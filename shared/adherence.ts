import type { Dose, DoseStatus } from './types';
import { effectiveStatus } from './escalation';
import { dateRange } from './time';

/** Below this rate a medication is flagged for attention. */
export const LOW_ADHERENCE_RATE = 0.8;

export interface Tally {
  taken: number;
  skipped: number;
  missed: number;
  pending: number;
  /** Taken ÷ (taken + skipped + missed); null when nothing has been decided yet. */
  rate: number | null;
}

export interface DayTally extends Tally {
  date: string;
}

export interface MedicationTally extends Tally {
  medId: string;
  medName: string;
}

/** Parts of the day, by a dose's local time: morning 05–12, afternoon 12–17, evening 17–21, night 21–05. */
export const DAY_PERIODS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type DayPeriod = (typeof DAY_PERIODS)[number];

export interface PeriodTally extends Tally {
  period: DayPeriod;
}

/** The part of the day a local `HH:MM` time falls in. */
export function periodOf(time: string): DayPeriod {
  const hour = Number(time.slice(0, 2));
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export interface AdherenceSummary {
  from: string;
  to: string;
  overall: Tally;
  byDay: DayTally[];
  byMedication: MedicationTally[];
  /** Adherence by part of the day, to show when doses tend to be missed. */
  byPeriod: PeriodTally[];
  /** Consecutive days, ending today, on which every decided dose was taken. */
  streakDays: number;
}

function emptyTally(): Tally {
  return { taken: 0, skipped: 0, missed: 0, pending: 0, rate: null };
}

function add(tally: Tally, status: DoseStatus): void {
  tally[status] += 1;
}

function finalise<T extends Tally>(tally: T): T {
  const decided = tally.taken + tally.skipped + tally.missed;
  tally.rate = decided === 0 ? null : tally.taken / decided;
  return tally;
}

function streak(byDay: DayTally[]): number {
  let days = 0;
  for (let i = byDay.length - 1; i >= 0; i -= 1) {
    const day = byDay[i];
    if (!day) break;
    if (day.missed > 0 || day.skipped > 0) break;
    if (day.taken > 0) days += 1;
  }
  return days;
}

/**
 * Adherence over an inclusive range of local dates. Every number shown to
 * users, and every number given to the AI, comes from here.
 */
export function summarise(doses: Dose[], from: string, to: string, now: number): AdherenceSummary {
  const overall = emptyTally();
  const days = new Map<string, DayTally>(
    dateRange(from, to).map((date) => [date, { date, ...emptyTally() }]),
  );
  const meds = new Map<string, MedicationTally>();
  const periods = new Map<DayPeriod, PeriodTally>(
    DAY_PERIODS.map((period) => [period, { period, ...emptyTally() }]),
  );

  for (const dose of doses) {
    const day = days.get(dose.localDate);
    if (!day) continue;
    const status = effectiveStatus(dose, now);
    add(overall, status);
    add(day, status);
    const period = periods.get(periodOf(dose.localTime));
    if (period) add(period, status);
    let med = meds.get(dose.medId);
    if (!med) {
      med = { medId: dose.medId, medName: dose.medName, ...emptyTally() };
      meds.set(dose.medId, med);
    }
    add(med, status);
  }

  const byDay = [...days.values()].map(finalise);
  return {
    from,
    to,
    overall: finalise(overall),
    byDay,
    byMedication: [...meds.values()].map(finalise).sort((a, b) => a.medName.localeCompare(b.medName)),
    byPeriod: [...periods.values()].map(finalise),
    streakDays: streak(byDay),
  };
}

/** Rate as a whole percentage, or null. */
export function percent(rate: number | null): number | null {
  return rate === null ? null : Math.round(rate * 100);
}
