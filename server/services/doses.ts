import type { ActPreviewResponse, TodayResponse } from '../../shared/api';
import { summarise, type AdherenceSummary } from '../../shared/adherence';
import { effectiveStatus } from '../../shared/escalation';
import { daysOfSupply, needsRefill } from '../../shared/refill';
import { addDays, localDate, zonedTimeToInstant } from '../../shared/time';
import type { Circle, Dose, DoseStatus, DoseVia } from '../../shared/types';
import type { Actor, Deps } from '../context';
import { AppError, forbidden, notFound } from '../errors';
import type { LinkAction } from '../security/actionLinks';
import { isElder, requireDoseRecorder } from './access';
import { ACTIVITY_LIMIT, recordActivity } from './activity';
import { pendingProposals, topUpCircle } from './medications';
import { wellbeingFrom } from './wellbeing';

export type DoseAction = 'take' | 'skip' | 'undo';

/** A dose may be recorded at most this long before it is due. */
export const EARLIEST_RECORD_MS = 12 * 60 * 60_000;

/** Instants bounding an inclusive range of local dates. */
function dayBounds(circle: Circle, from: string, to: string): [number, number] {
  return [
    zonedTimeToInstant(from, '00:00', circle.timezone),
    zonedTimeToInstant(addDays(to, 1), '00:00', circle.timezone),
  ];
}

const withEffectiveStatus = (doses: Dose[], now: number): Dose[] =>
  doses.map((d) => ({ ...d, status: effectiveStatus(d, now) }));

/** Everything the Today screen shows. Tops up doses lazily if the scheduler has not yet. */
export async function today(deps: Deps, actor: Actor): Promise<TodayResponse> {
  const now = deps.clock.now();
  const { circle } = actor;
  const date = localDate(now, circle.timezone);
  if (circle.materialisedThrough < addDays(date, 1)) await topUpCircle(deps, circle);

  const [from, to] = dayBounds(circle, date, date);
  const [doses, appointments, meds, activity] = await Promise.all([
    deps.repo.listDosesForCircle(circle.id, from, to),
    deps.repo.listAppointments(circle.id),
    deps.repo.listMedications(circle.id),
    deps.repo.listActivity(circle.id, ACTIVITY_LIMIT),
  ]);
  return {
    date,
    now,
    doses: withEffectiveStatus(doses, now),
    nextAppointment: appointments.find((a) => a.at > now) ?? null,
    proposals: pendingProposals(meds),
    lowStock: meds
      .filter((m) => m.status === 'active' && needsRefill(m))
      .map((m) => ({ medId: m.id, medName: m.name, daysLeft: daysOfSupply(m) ?? 0 })),
    ...wellbeingFrom(activity, circle.timezone, now),
  };
}

const TARGET: Record<Exclude<DoseAction, 'undo'>, DoseStatus> = { take: 'taken', skip: 'skipped' };

async function adjustStock(deps: Deps, circleId: string, medId: string, delta: number): Promise<void> {
  const med = await deps.repo.getMedication(circleId, medId);
  if (med?.stock === undefined || med.stock === null) return;
  await deps.repo.saveMedication({ ...med, stock: Math.max(0, med.stock + delta) });
}

/**
 * Records a dose as taken or skipped, or undoes that. Taking a dose reduces
 * the stock count; undoing it puts the count back. Repeating an action is a no-op.
 */
export async function actOnDose(
  deps: Deps,
  actor: Actor,
  doseId: string,
  action: DoseAction,
  via: DoseVia = 'app',
): Promise<Dose> {
  requireDoseRecorder(actor);
  const dose = await deps.repo.getDose(doseId);
  if (dose?.circleId !== actor.circle.id) throw notFound('Dose');
  const now = deps.clock.now();

  if (action === 'undo') {
    if (dose.status === 'pending') return dose;
    if (!isElder(actor.member) && dose.actedBy !== actor.member.id) {
      throw forbidden('Only the person who recorded this dose, or the elder, can undo it');
    }
    const patch = { status: 'pending' as const, actedBy: null, actedByName: null, actedAt: null, via: null };
    await deps.repo.updateDose(dose.id, patch);
    if (dose.status === 'taken') await adjustStock(deps, actor.circle.id, dose.medId, +1);
    await recordActivity(deps, actor, 'dose.undone', dose.medName);
    return { ...dose, ...patch, status: effectiveStatus({ ...dose, status: 'pending' }, now) };
  }

  const status = TARGET[action];
  if (dose.status === status) return dose;
  if (dose.dueAt - now > EARLIEST_RECORD_MS) throw new AppError('conflict', 'This dose is not due yet');
  const patch = { status, actedBy: actor.member.id, actedByName: actor.member.name, actedAt: now, via };
  await deps.repo.updateDose(dose.id, patch);
  if (status === 'taken') await adjustStock(deps, actor.circle.id, dose.medId, -1);
  if (dose.status === 'taken') await adjustStock(deps, actor.circle.id, dose.medId, +1);
  await recordActivity(deps, actor, status === 'taken' ? 'dose.taken' : 'dose.skipped', dose.medName);
  return { ...dose, ...patch };
}

/** Adherence over the last 7 or 30 local days, including today. */
export async function adherence(deps: Deps, circle: Circle, days: number): Promise<AdherenceSummary> {
  const now = deps.clock.now();
  const to = localDate(now, circle.timezone);
  const from = addDays(to, -(days - 1));
  const [start, end] = dayBounds(circle, from, to);
  const doses = await deps.repo.listDosesForCircle(circle.id, start, end);
  return summarise(doses, from, to, now);
}

interface LinkContext {
  actor: Actor;
  dose: Dose;
  action: LinkAction;
  jti: string;
}

async function resolveLink(deps: Deps, token: string): Promise<LinkContext> {
  const payload = deps.links.verify(token, deps.clock.now());
  if (!payload) throw new AppError('unauthenticated', 'This link has expired. Please open Saanjh instead.');
  const dose = await deps.repo.getDose(payload.d);
  if (!dose) throw notFound('Dose');
  const [circle, member] = await Promise.all([
    deps.repo.getCircle(dose.circleId),
    deps.repo.getMember(dose.circleId, payload.m),
  ]);
  if (!circle || !member) throw new AppError('unauthenticated', 'This link is no longer valid.');
  return { actor: { circle, member }, dose, action: payload.a, jti: payload.j };
}

/** What a one-tap email link would do, without doing it (safe for link scanners). */
export async function previewLink(deps: Deps, token: string): Promise<ActPreviewResponse> {
  const { dose, action } = await resolveLink(deps, token);
  return {
    action,
    medName: dose.medName,
    medDose: dose.medDose,
    localDate: dose.localDate,
    localTime: dose.localTime,
    status: effectiveStatus(dose, deps.clock.now()),
  };
}

/** Performs a one-tap email action. Each link works once. */
export async function actByLink(deps: Deps, token: string): Promise<Dose> {
  const { actor, dose, action, jti } = await resolveLink(deps, token);
  if (!(await deps.repo.claimOnce(`link_${jti}`))) {
    throw new AppError('conflict', 'This link has already been used.');
  }
  return actOnDose(deps, actor, dose.id, action, 'email');
}
