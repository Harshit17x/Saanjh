import type { AppointmentInput } from '../../shared/schemas';
import { zonedTimeToInstant } from '../../shared/time';
import type { Appointment } from '../../shared/types';
import type { Actor, Deps } from '../context';
import { AppError, notFound } from '../errors';
import { newId } from '../security/ids';
import { requireManage } from './access';
import { recordActivity } from './activity';

/** A circle may hold at most this many appointments. */
export const MAX_APPOINTMENTS = 100;

export function listAppointments(deps: Deps, actor: Actor): Promise<Appointment[]> {
  return deps.repo.listAppointments(actor.circle.id);
}

function fields(
  actor: Actor,
  input: AppointmentInput,
): Omit<Appointment, 'id' | 'circleId' | 'createdBy' | 'createdAt'> {
  return {
    doctor: input.doctor,
    speciality: input.speciality,
    place: input.place,
    notes: input.notes,
    at: zonedTimeToInstant(input.date, input.time, actor.circle.timezone),
  };
}

export async function createAppointment(
  deps: Deps,
  actor: Actor,
  input: AppointmentInput,
): Promise<Appointment> {
  requireManage(actor);
  const existing = await deps.repo.listAppointments(actor.circle.id);
  if (existing.length >= MAX_APPOINTMENTS) throw new AppError('conflict', 'Too many appointments');
  const appt: Appointment = {
    ...fields(actor, input),
    id: newId(),
    circleId: actor.circle.id,
    createdBy: actor.member.id,
    createdAt: deps.clock.now(),
  };
  await deps.repo.saveAppointment(appt);
  await recordActivity(deps, actor, 'appt.created', appt.doctor);
  return appt;
}

export async function getAppointment(deps: Deps, actor: Actor, id: string): Promise<Appointment> {
  const appt = await deps.repo.getAppointment(actor.circle.id, id);
  if (!appt) throw notFound('Appointment');
  return appt;
}

export async function updateAppointment(
  deps: Deps,
  actor: Actor,
  id: string,
  input: AppointmentInput,
): Promise<Appointment> {
  requireManage(actor);
  const appt = { ...(await getAppointment(deps, actor, id)), ...fields(actor, input) };
  await deps.repo.saveAppointment(appt);
  await recordActivity(deps, actor, 'appt.updated', appt.doctor);
  return appt;
}

export async function deleteAppointment(deps: Deps, actor: Actor, id: string): Promise<void> {
  requireManage(actor);
  const appt = await getAppointment(deps, actor, id);
  await deps.repo.deleteAppointment(actor.circle.id, id);
  await recordActivity(deps, actor, 'appt.deleted', appt.doctor);
}
