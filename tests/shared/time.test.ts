import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateRange,
  isValidTimeZone,
  localDate,
  localTime,
  minutesUntil,
  weekday,
  zonedTimeToInstant,
} from '../../shared/time';

describe('time', () => {
  it('converts local wall time to UTC for a fixed-offset zone', () => {
    expect(zonedTimeToInstant('2026-11-15', '08:00', 'Asia/Kolkata')).toBe(Date.UTC(2026, 10, 15, 2, 30));
    expect(zonedTimeToInstant('2026-11-15', '00:00', 'UTC')).toBe(Date.UTC(2026, 10, 15, 0, 0));
  });

  it('handles local midnight crossing the UTC date', () => {
    const instant = zonedTimeToInstant('2026-11-15', '00:15', 'Asia/Kolkata');
    expect(new Date(instant).toISOString()).toBe('2026-11-14T18:45:00.000Z');
    expect(localDate(instant, 'Asia/Kolkata')).toBe('2026-11-15');
    expect(localTime(instant, 'Asia/Kolkata')).toBe('00:15');
  });

  it('round-trips through DST in New York', () => {
    // Before and after the 8 March 2026 spring-forward.
    const before = zonedTimeToInstant('2026-03-07', '09:00', 'America/New_York');
    const after = zonedTimeToInstant('2026-03-09', '09:00', 'America/New_York');
    expect(new Date(before).toISOString()).toBe('2026-03-07T14:00:00.000Z');
    expect(new Date(after).toISOString()).toBe('2026-03-09T13:00:00.000Z');
    expect(localTime(after, 'America/New_York')).toBe('09:00');
  });

  it('resolves a non-existent DST time to a real instant', () => {
    const gap = zonedTimeToInstant('2026-03-08', '02:30', 'America/New_York');
    expect(Number.isFinite(gap)).toBe(true);
    expect(localDate(gap, 'America/New_York')).toBe('2026-03-08');
  });

  it('formats local date and time', () => {
    const instant = Date.UTC(2026, 10, 15, 6, 30);
    expect(localDate(instant, 'Asia/Kolkata')).toBe('2026-11-15');
    expect(localTime(instant, 'Asia/Kolkata')).toBe('12:00');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('computes weekdays with Sunday as 0', () => {
    expect(weekday('2026-11-15')).toBe(0);
    expect(weekday('2026-11-16')).toBe(1);
  });

  it('builds inclusive date ranges', () => {
    expect(dateRange('2026-11-14', '2026-11-16')).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
    expect(dateRange('2026-11-16', '2026-11-14')).toEqual([]);
  });

  it('validates time zones', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('measures minutes until an instant', () => {
    expect(minutesUntil(120_000, 0)).toBe(2);
    expect(minutesUntil(0, 60_000)).toBe(-1);
  });
});
