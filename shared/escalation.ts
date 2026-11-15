import type { Appointment, Dose, DoseStatus, PublicMember } from './types';
import { minutesUntil } from './time';

/** Reminder timing, in minutes relative to a dose's due time unless noted. */
export const REMINDER = {
  upcomingLeadMin: 10,
  nudgeAfterMin: 20,
  missedAfterMin: 60,
  /** The tick looks this far back so a late run still catches overdue doses. */
  lookbackMin: 120,
  lookaheadMin: 15,
  appointmentLeadHours: { early: 24, late: 2 },
} as const;

export type DoseStage = 'upcoming' | 'nudge' | 'missed';
export type AppointmentStage = 'appt24h' | 'appt2h';

/**
 * The reminder stage a pending dose has reached at `now`, or null.
 * Only the latest stage is returned, so a late tick sends the message that
 * fits the situation now rather than replaying earlier ones.
 */
export function doseStage(dose: Pick<Dose, 'status' | 'dueAt'>, now: number): DoseStage | null {
  if (dose.status !== 'pending') return null;
  const minutesLate = -minutesUntil(dose.dueAt, now);
  if (minutesLate >= REMINDER.missedAfterMin) return 'missed';
  if (minutesLate >= REMINDER.nudgeAfterMin) return 'nudge';
  if (minutesLate >= -REMINDER.upcomingLeadMin) return 'upcoming';
  return null;
}

/** The appointment reminder due at `now`, or null when none is due. */
export function appointmentStage(appt: Pick<Appointment, 'at'>, now: number): AppointmentStage | null {
  const hoursUntil = minutesUntil(appt.at, now) / 60;
  if (hoursUntil <= 0) return null;
  if (hoursUntil <= REMINDER.appointmentLeadHours.late) return 'appt2h';
  if (hoursUntil <= REMINDER.appointmentLeadHours.early) return 'appt24h';
  return null;
}

/**
 * Status to show for a dose at `now`. A pending dose well past its time is
 * treated as missed even if no reminder run has marked it yet.
 */
export function effectiveStatus(dose: Pick<Dose, 'status' | 'dueAt'>, now: number): DoseStatus {
  if (dose.status === 'pending' && -minutesUntil(dose.dueAt, now) >= REMINDER.missedAfterMin) return 'missed';
  return dose.status;
}

const reachable = (m: PublicMember): boolean => m.notify && m.email !== null && m.email !== '';

/**
 * Who should receive a reminder. The elder is told first; family and
 * caretakers hear about a dose only once it is missed. If the elder has no
 * email, caretakers receive the elder's reminders instead.
 */
export function recipientsFor(
  stage: DoseStage | AppointmentStage | 'lowStock' | 'digest',
  members: PublicMember[],
): PublicMember[] {
  const elder = members.filter((m) => m.role === 'elder' && reachable(m));
  const others = members.filter((m) => m.role !== 'elder' && reachable(m));
  switch (stage) {
    case 'upcoming':
    case 'nudge':
      return elder.length > 0 ? elder : others.filter((m) => m.role === 'caretaker');
    case 'missed':
      return others;
    case 'appt24h':
    case 'appt2h':
    case 'lowStock':
    case 'digest':
      return [...elder, ...others];
  }
}
