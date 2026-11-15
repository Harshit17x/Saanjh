import type { Member, PublicMember } from '../../shared/types';
import type { Actor } from '../context';
import { forbidden } from '../errors';

/**
 * Who may do what. The elder can do everything; others act only with the
 * "manage" permission the elder grants, and medication changes by others
 * become proposals while the circle requires the elder's approval.
 */

export const isElder = (member: Pick<Member, 'role'>): boolean => member.role === 'elder';

export const canManage = (member: Pick<Member, 'role' | 'permission'>): boolean =>
  isElder(member) || member.permission === 'manage';

/** Elder, or a caretaker with manage permission, may record doses. */
export const canRecordDoses = (member: Pick<Member, 'role' | 'permission'>): boolean =>
  isElder(member) || (member.role === 'caretaker' && member.permission === 'manage');

export function requireElder(actor: Actor): void {
  if (!isElder(actor.member)) throw forbidden('Only the elder can do that');
}

export function requireManage(actor: Actor): void {
  if (!canManage(actor.member)) throw forbidden('Ask the elder for permission to make changes');
}

export function requireDoseRecorder(actor: Actor): void {
  if (!canRecordDoses(actor.member)) throw forbidden('Only the elder or a caretaker can record doses');
}

/** Whether a change by this actor must wait for the elder's approval. */
export const needsApproval = (actor: Actor): boolean =>
  actor.circle.requireElderApproval && !isElder(actor.member);

/** Strips credential fields before a member leaves the server. */
export function toPublicMember(member: Member): PublicMember {
  const { passcodeHash: _hash, failedAttempts: _attempts, lockedUntil: _locked, ...rest } = member;
  return rest;
}
