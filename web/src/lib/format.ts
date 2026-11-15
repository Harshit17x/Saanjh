import { zonedTimeToInstant } from '../../../shared/time';

/** Display formatting in the circle's time zone and the reader's language. */

export function formatTime(instant: number, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(instant);
}

/** Formats a local `HH:MM` wall time, e.g. 20:30 → 8:30 pm. */
export function formatWallTime(time: string, locale: string): string {
  return formatTime(zonedTimeToInstant('2000-01-01', time, 'UTC'), 'UTC', locale);
}

export function formatDate(instant: number, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(
    instant,
  );
}

export function formatDateTime(instant: number, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant);
}

/** Short day and month parts for a calendar tile. */
export function dateParts(instant: number, timeZone: string, locale: string): { day: string; month: string } {
  const parts = new Intl.DateTimeFormat(locale, { timeZone, day: 'numeric', month: 'short' }).formatToParts(
    instant,
  );
  return {
    day: parts.find((p) => p.type === 'day')?.value ?? '',
    month: parts.find((p) => p.type === 'month')?.value ?? '',
  };
}

export function formatShortDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).format(
    zonedTimeToInstant(date, '12:00', 'UTC'),
  );
}

/** First letter of a name for an avatar. */
export const initial = (name: string): string => name.trim().charAt(0).toUpperCase() || '?';

/** Shows an 8-character circle code as two groups: K7QM-4XPA. */
export const displayCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Google Calendar "add event" link for a one-hour appointment. */
export function googleCalendarUrl(title: string, start: number, details: string, location: string): string {
  const stamp = (t: number) =>
    new Date(t)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${stamp(start)}/${stamp(start + 60 * 60_000)}`,
    details,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Google Maps search link for a place. */
export function googleMapsUrl(place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}
