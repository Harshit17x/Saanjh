import type { MedicationFields } from './types';

/** A refill warning is raised when fewer than this many days of supply remain. */
export const LOW_STOCK_DAYS = 5;

/** Average doses per day across the week. */
export function dosesPerDay(med: Pick<MedicationFields, 'times' | 'daysOfWeek'>): number {
  return (med.times.length * med.daysOfWeek.length) / 7;
}

/** Whole days of supply left, or null when stock is not tracked or nothing is scheduled. */
export function daysOfSupply(med: Pick<MedicationFields, 'times' | 'daysOfWeek' | 'stock'>): number | null {
  const perDay = dosesPerDay(med);
  if (med.stock === null || perDay === 0) return null;
  return Math.floor(med.stock / perDay);
}

/** Whether the medication needs a refill soon. */
export function needsRefill(med: Pick<MedicationFields, 'times' | 'daysOfWeek' | 'stock'>): boolean {
  const days = daysOfSupply(med);
  return days !== null && days < LOW_STOCK_DAYS;
}
