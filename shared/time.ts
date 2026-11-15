/**
 * Time-zone arithmetic built on Intl, with no date library.
 * Schedules are stored as local wall-clock times and converted to UTC
 * instants here, so daylight-saving changes are handled by the platform.
 */

const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(instant: number, timeZone: string): LocalParts {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  };
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** True when `timeZone` is an IANA zone the runtime recognises. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date (`YYYY-MM-DD`) of an instant in a zone. */
export function localDate(instant: number, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Local wall-clock time (`HH:MM`) of an instant in a zone. */
export function localTime(instant: number, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Offset of the zone from UTC at an instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const floored = instant - (instant % MINUTE_MS);
  const p = localParts(floored, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - floored;
}

function splitDate(date: string): [number, number, number] {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return [y, m, d];
}

/**
 * The UTC instant at which a local date and time occur in a zone.
 * A second pass corrects the guess when it lands across a DST change.
 */
export function zonedTimeToInstant(date: string, time: string, timeZone: string): number {
  const [y, m, d] = splitDate(date);
  const [hh = 0, mm = 0] = time.split(':').map(Number);
  const asIfUtc = Date.UTC(y, m - 1, d, hh, mm);
  const firstOffset = offsetAt(asIfUtc, timeZone);
  const candidate = asIfUtc - firstOffset;
  const secondOffset = offsetAt(candidate, timeZone);
  return secondOffset === firstOffset ? candidate : asIfUtc - secondOffset;
}

/** Calendar date `days` after `date` (negative goes back). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = splitDate(date);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Day of week for a calendar date, 0 = Sunday. */
export function weekday(date: string): number {
  const [y, m, d] = splitDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Inclusive list of dates from `from` to `to`. Empty when `to` is before `from`. */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** Minutes from `now` until `instant` (negative when in the past). */
export function minutesUntil(instant: number, now: number): number {
  return (instant - now) / MINUTE_MS;
}
