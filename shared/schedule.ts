import type { Dose, Medication } from './types';
import { addDays, dateRange, localDate, weekday, zonedTimeToInstant } from './time';

/** How many local days ahead dose documents are created, counting today. */
export const MATERIALISE_DAYS_AHEAD = 3;

/** Deterministic dose id, so creating the same dose twice is a no-op. */
export function doseId(medId: string, date: string, time: string): string {
  return `${medId}_${date.replaceAll('-', '')}_${time.replace(':', '')}`;
}

/** Whether an active medication is scheduled on a local date. */
export function isScheduledOn(med: Medication, date: string): boolean {
  if (med.status !== 'active') return false;
  if (date < med.startDate) return false;
  if (med.endDate !== null && date > med.endDate) return false;
  return med.daysOfWeek.includes(weekday(date));
}

/** Pending dose records for one medication on one local date. */
export function dosesOn(med: Medication, date: string, timeZone: string): Dose[] {
  if (!isScheduledOn(med, date)) return [];
  return [...med.times].sort().map((time) => ({
    id: doseId(med.id, date, time),
    circleId: med.circleId,
    medId: med.id,
    medName: med.name,
    medDose: med.dose,
    withFood: med.withFood,
    dueAt: zonedTimeToInstant(date, time, timeZone),
    localDate: date,
    localTime: time,
    status: 'pending',
    actedBy: null,
    actedByName: null,
    actedAt: null,
    via: null,
  }));
}

/** Pending doses for many medications over an inclusive range of local dates. */
export function dosesBetween(meds: Medication[], from: string, to: string, timeZone: string): Dose[] {
  const dates = dateRange(from, to);
  return meds.flatMap((med) => dates.flatMap((date) => dosesOn(med, date, timeZone)));
}

/** The local date range that should have dose documents at `now`. */
export function materialiseWindow(now: number, timeZone: string): { from: string; to: string } {
  const today = localDate(now, timeZone);
  return { from: today, to: addDays(today, MATERIALISE_DAYS_AHEAD) };
}
