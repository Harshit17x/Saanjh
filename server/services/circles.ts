import type { LookupResponse, PublicCircle } from '../../shared/api';
import type { CircleSettingsInput, CreateCircleInput, JoinInput, ProfileInput } from '../../shared/schemas';
import { addDays, localDate } from '../../shared/time';
import type { Circle, Member, Permission } from '../../shared/types';
import type { Actor, Deps } from '../context';
import { AppError, forbidden, notFound } from '../errors';
import { newCircleCode, newId } from '../security/ids';
import { hashPasscode, LOCKOUT_MS, MAX_ATTEMPTS, verifyPasscode } from '../security/passcode';
import { requireElder } from './access';
import { recordActivity } from './activity';
import { rematerialiseCircle } from './medications';

/** A circle may hold at most this many members. */
export const MAX_MEMBERS = 12;
const CODE_ATTEMPTS = 5;

export function toPublicCircle(circle: Circle): PublicCircle {
  const { materialisedThrough: _through, ...rest } = circle;
  return rest;
}

async function uniqueCode(deps: Deps): Promise<string> {
  for (let i = 0; i < CODE_ATTEMPTS; i += 1) {
    const code = newCircleCode();
    if (!(await deps.repo.findCircleByCode(code))) return code;
  }
  throw new AppError('internal', 'Could not create a circle code');
}

interface NewMember {
  circleId: string;
  name: string;
  role: Member['role'];
  email: string | null;
  passcode: string;
  permission: Permission;
}

async function buildMember(deps: Deps, input: NewMember): Promise<Member> {
  return {
    id: newId(),
    circleId: input.circleId,
    name: input.name,
    role: input.role,
    email: input.email,
    permission: input.permission,
    notify: true,
    passcodeHash: await hashPasscode(input.passcode),
    failedAttempts: 0,
    lockedUntil: 0,
    createdAt: deps.clock.now(),
  };
}

/** Creates a circle with the elder as its first member. */
export async function createCircle(deps: Deps, input: CreateCircleInput, demo = false): Promise<Actor> {
  const now = deps.clock.now();
  const circle: Circle = {
    id: newId(),
    code: await uniqueCode(deps),
    elderName: input.elderName,
    timezone: input.timezone,
    language: input.language,
    requireElderApproval: true,
    materialisedThrough: addDays(localDate(now, input.timezone), -1),
    demo,
    createdAt: now,
  };
  const elder = await buildMember(deps, {
    circleId: circle.id,
    name: input.elderName,
    role: 'elder',
    email: input.email,
    passcode: input.passcode,
    permission: 'manage',
  });
  await deps.repo.createCircle(circle, elder);
  const actor = { circle, member: elder };
  await recordActivity(deps, actor, 'circle.created', circle.elderName);
  return actor;
}

async function circleByCode(deps: Deps, code: string): Promise<Circle> {
  const circle = await deps.repo.findCircleByCode(code);
  if (!circle) throw notFound('Circle');
  return circle;
}

/** Names and roles of a circle's members, so people can pick themselves when signing in. */
export async function lookupCircle(deps: Deps, code: string): Promise<LookupResponse> {
  const circle = await circleByCode(deps, code);
  const members = await deps.repo.listMembers(circle.id);
  return { elderName: circle.elderName, members: members.map(({ id, name, role }) => ({ id, name, role })) };
}

/** Adds a family member or caretaker. They can make changes, which wait for the elder's approval. */
export async function joinCircle(deps: Deps, input: JoinInput): Promise<Actor> {
  const circle = await circleByCode(deps, input.code);
  const members = await deps.repo.listMembers(circle.id);
  if (members.length >= MAX_MEMBERS) throw new AppError('conflict', 'This circle is full');
  const member = await buildMember(deps, {
    circleId: circle.id,
    name: input.name,
    role: input.role,
    email: input.email,
    passcode: input.passcode,
    permission: 'manage',
  });
  await deps.repo.createMember(member);
  const actor = { circle, member };
  await recordActivity(deps, actor, 'member.joined', member.name);
  return actor;
}

const WRONG_PASSCODE = 'That passcode did not match. Please try again.';

/** Checks a member's passcode, locking the member after repeated failures. */
export async function login(deps: Deps, code: string, memberId: string, passcode: string): Promise<Actor> {
  const circle = await deps.repo.findCircleByCode(code);
  const member = circle ? await deps.repo.getMember(circle.id, memberId) : null;
  if (!circle || !member) throw new AppError('unauthenticated', WRONG_PASSCODE);

  const now = deps.clock.now();
  if (member.lockedUntil > now) {
    throw new AppError('locked', 'Too many tries. Please wait 15 minutes and try again.');
  }
  if (!(await verifyPasscode(passcode, member.passcodeHash))) {
    const failedAttempts = member.failedAttempts + 1;
    const locked = failedAttempts >= MAX_ATTEMPTS;
    await deps.repo.updateMember(circle.id, member.id, {
      failedAttempts: locked ? 0 : failedAttempts,
      lockedUntil: locked ? now + LOCKOUT_MS : 0,
    });
    throw new AppError('unauthenticated', WRONG_PASSCODE);
  }
  if (member.failedAttempts > 0) await deps.repo.updateMember(circle.id, member.id, { failedAttempts: 0 });
  return { circle, member };
}

/** Updates circle settings. Elder only. */
export async function updateSettings(deps: Deps, actor: Actor, input: CircleSettingsInput): Promise<Circle> {
  requireElder(actor);
  await deps.repo.updateCircle(actor.circle.id, input);
  const circle = { ...actor.circle, ...input };
  if (input.timezone && input.timezone !== actor.circle.timezone) {
    await rematerialiseCircle(deps, circle);
  }
  await recordActivity(deps, actor, 'settings.updated', circle.elderName);
  return circle;
}

async function otherMember(deps: Deps, actor: Actor, memberId: string): Promise<Member> {
  requireElder(actor);
  const member = await deps.repo.getMember(actor.circle.id, memberId);
  if (!member) throw notFound('Member');
  if (member.role === 'elder') throw forbidden('The elder’s own access cannot be changed');
  return member;
}

/** Sets a member to view-only or manage. Elder only. */
export async function setMemberAccess(
  deps: Deps,
  actor: Actor,
  memberId: string,
  permission: Permission,
): Promise<void> {
  const member = await otherMember(deps, actor, memberId);
  await deps.repo.updateMember(actor.circle.id, member.id, { permission });
  await recordActivity(deps, actor, 'member.updated', member.name);
}

/** Removes a member from the circle. Elder only. */
export async function removeMember(deps: Deps, actor: Actor, memberId: string): Promise<void> {
  const member = await otherMember(deps, actor, memberId);
  await deps.repo.deleteMember(actor.circle.id, member.id);
  await recordActivity(deps, actor, 'member.removed', member.name);
}

/** Updates the signed-in member's own name, email and notification choice. */
export async function updateProfile(deps: Deps, actor: Actor, input: ProfileInput): Promise<Member> {
  await deps.repo.updateMember(actor.circle.id, actor.member.id, input);
  return { ...actor.member, ...input };
}
