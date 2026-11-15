import type { MedicationInput } from '../../shared/schemas';
import { dosesBetween, materialiseWindow } from '../../shared/schedule';
import type { Circle, Medication, MedicationFields, ProposalAction } from '../../shared/types';
import type { Actor, Deps } from '../context';
import { AppError, notFound } from '../errors';
import { newId } from '../security/ids';
import { needsApproval, requireElder, requireManage } from './access';
import { recordActivity } from './activity';

/** A circle may track at most this many medications. */
export const MAX_MEDICATIONS = 40;

/**
 * Creates future dose documents for the given medications. Doses already
 * recorded keep their status because creation skips existing ids.
 */
async function materialise(deps: Deps, circle: Circle, meds: Medication[]): Promise<string> {
  const now = deps.clock.now();
  const { from, to } = materialiseWindow(now, circle.timezone);
  const doses = dosesBetween(meds, from, to, circle.timezone).filter((d) => d.dueAt > now);
  await deps.repo.createDosesIfAbsent(doses);
  return to;
}

/** Replaces a medication's future pending doses after its schedule changed. */
async function rescheduleMedication(deps: Deps, circle: Circle, med: Medication): Promise<void> {
  await deps.repo.deletePendingDosesAfter(med.id, deps.clock.now());
  await materialise(deps, circle, [med]);
}

/** Creates any missing dose documents for a circle and records how far ahead they go. */
export async function topUpCircle(deps: Deps, circle: Circle): Promise<void> {
  const meds = await deps.repo.listMedications(circle.id);
  const through = await materialise(deps, circle, meds);
  await deps.repo.updateCircle(circle.id, { materialisedThrough: through });
}

/** Rebuilds all future doses of a circle, e.g. after its time zone changed. */
export async function rematerialiseCircle(deps: Deps, circle: Circle): Promise<void> {
  const meds = await deps.repo.listMedications(circle.id);
  await Promise.all(meds.map((med) => deps.repo.deletePendingDosesAfter(med.id, deps.clock.now())));
  await topUpCircle(deps, circle);
}

async function load(deps: Deps, actor: Actor, medId: string): Promise<Medication> {
  const med = await deps.repo.getMedication(actor.circle.id, medId);
  if (!med) throw notFound('Medication');
  return med;
}

function propose(
  actor: Actor,
  action: ProposalAction,
  changes: MedicationFields | null,
  now: number,
): NonNullable<Medication['pending']> {
  return { action, changes, by: actor.member.id, byName: actor.member.name, at: now };
}

export function listMedications(deps: Deps, actor: Actor): Promise<Medication[]> {
  return deps.repo.listMedications(actor.circle.id);
}

/** Adds a medication, or proposes it when the elder's approval is required. */
export async function createMedication(
  deps: Deps,
  actor: Actor,
  input: MedicationInput,
): Promise<Medication> {
  requireManage(actor);
  const existing = await deps.repo.listMedications(actor.circle.id);
  if (existing.length >= MAX_MEDICATIONS)
    throw new AppError('conflict', 'This circle has too many medications');
  const now = deps.clock.now();
  const proposal = needsApproval(actor);
  const med: Medication = {
    ...input,
    id: newId(),
    circleId: actor.circle.id,
    status: proposal ? 'proposed' : 'active',
    pending: proposal ? propose(actor, 'create', null, now) : null,
    createdAt: now,
    updatedAt: now,
  };
  await deps.repo.saveMedication(med);
  if (!proposal) await materialise(deps, actor.circle, [med]);
  await recordActivity(deps, actor, proposal ? 'med.proposed' : 'med.created', med.name);
  return med;
}

/** Edits a medication, or proposes the edit when approval is required. */
export async function updateMedication(
  deps: Deps,
  actor: Actor,
  medId: string,
  input: MedicationInput,
): Promise<Medication> {
  requireManage(actor);
  const med = await load(deps, actor, medId);
  const now = deps.clock.now();
  if (med.status !== 'proposed' && needsApproval(actor)) {
    const proposed = { ...med, pending: propose(actor, 'update', input, now), updatedAt: now };
    await deps.repo.saveMedication(proposed);
    await recordActivity(deps, actor, 'med.proposed', med.name);
    return proposed;
  }
  const updated: Medication = { ...med, ...input, updatedAt: now };
  await deps.repo.saveMedication(updated);
  if (updated.status === 'active') await rescheduleMedication(deps, actor.circle, updated);
  await recordActivity(deps, actor, 'med.updated', updated.name);
  return updated;
}

async function applyPause(deps: Deps, actor: Actor, med: Medication, paused: boolean): Promise<Medication> {
  const updated: Medication = {
    ...med,
    status: paused ? 'paused' : 'active',
    pending: null,
    updatedAt: deps.clock.now(),
  };
  await deps.repo.saveMedication(updated);
  if (paused) await deps.repo.deletePendingDosesAfter(med.id, deps.clock.now());
  else await materialise(deps, actor.circle, [updated]);
  return updated;
}

/** Pauses or resumes a medication, or proposes it when approval is required. */
export async function setPaused(
  deps: Deps,
  actor: Actor,
  medId: string,
  paused: boolean,
): Promise<Medication> {
  requireManage(actor);
  const med = await load(deps, actor, medId);
  if (med.status === 'proposed') throw new AppError('conflict', 'Approve this medication first');
  if (needsApproval(actor)) {
    const proposed = { ...med, pending: propose(actor, paused ? 'pause' : 'resume', null, deps.clock.now()) };
    await deps.repo.saveMedication(proposed);
    await recordActivity(deps, actor, 'med.proposed', med.name);
    return proposed;
  }
  const updated = await applyPause(deps, actor, med, paused);
  await recordActivity(deps, actor, paused ? 'med.paused' : 'med.resumed', med.name);
  return updated;
}

async function applyDelete(deps: Deps, actor: Actor, med: Medication): Promise<void> {
  await deps.repo.deletePendingDosesAfter(med.id, deps.clock.now());
  await deps.repo.deleteMedication(actor.circle.id, med.id);
}

/**
 * Deletes a medication (past doses stay in the history), or proposes the
 * deletion. A proposer may withdraw their own unapproved medication.
 */
export async function deleteMedication(deps: Deps, actor: Actor, medId: string): Promise<Medication | null> {
  requireManage(actor);
  const med = await load(deps, actor, medId);
  const ownProposal = med.status === 'proposed' && med.pending?.by === actor.member.id;
  if (!ownProposal && needsApproval(actor)) {
    const proposed = { ...med, pending: propose(actor, 'delete', null, deps.clock.now()) };
    await deps.repo.saveMedication(proposed);
    await recordActivity(deps, actor, 'med.proposed', med.name);
    return proposed;
  }
  await applyDelete(deps, actor, med);
  await recordActivity(deps, actor, 'med.deleted', med.name);
  return null;
}

/** The elder accepts a proposed change. Returns the medication, or null if it was deleted. */
export async function approveProposal(deps: Deps, actor: Actor, medId: string): Promise<Medication | null> {
  requireElder(actor);
  const med = await load(deps, actor, medId);
  if (!med.pending) throw new AppError('conflict', 'Nothing is waiting for approval');
  const now = deps.clock.now();
  let result: Medication | null;
  switch (med.pending.action) {
    case 'create':
      result = { ...med, status: 'active', pending: null, updatedAt: now };
      await deps.repo.saveMedication(result);
      await materialise(deps, actor.circle, [result]);
      break;
    case 'update':
      result = { ...med, ...(med.pending.changes ?? {}), pending: null, updatedAt: now };
      await deps.repo.saveMedication(result);
      if (result.status === 'active') await rescheduleMedication(deps, actor.circle, result);
      break;
    case 'pause':
    case 'resume':
      result = await applyPause(deps, actor, med, med.pending.action === 'pause');
      break;
    case 'delete':
      await applyDelete(deps, actor, med);
      result = null;
      break;
  }
  await recordActivity(deps, actor, 'med.approved', med.name);
  return result;
}

/** The elder declines a proposed change. A declined new medication is removed. */
export async function rejectProposal(deps: Deps, actor: Actor, medId: string): Promise<Medication | null> {
  requireElder(actor);
  const med = await load(deps, actor, medId);
  if (!med.pending) throw new AppError('conflict', 'Nothing is waiting for approval');
  await recordActivity(deps, actor, 'med.rejected', med.name);
  if (med.pending.action === 'create') {
    await deps.repo.deleteMedication(actor.circle.id, med.id);
    return null;
  }
  const restored = { ...med, pending: null, updatedAt: deps.clock.now() };
  await deps.repo.saveMedication(restored);
  return restored;
}

/** Medications with a change waiting for the elder. */
export const pendingProposals = (meds: Medication[]): Medication[] => meds.filter((m) => m.pending !== null);
