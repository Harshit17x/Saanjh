import { describe, expect, it } from 'vitest';
import {
  doseId,
  dosesBetween,
  dosesOn,
  isScheduledOn,
  materialiseWindow,
  MATERIALISE_DAYS_AHEAD,
} from '../../shared/schedule';
import { zonedTimeToInstant } from '../../shared/time';
import { med } from './fixtures';

describe('schedule', () => {
  it('makes deterministic dose ids', () => {
    expect(doseId('abc', '2026-11-15', '08:30')).toBe('abc_20261115_0830');
  });

  it('respects status, start, end and weekday', () => {
    expect(isScheduledOn(med(), '2026-11-15')).toBe(true);
    expect(isScheduledOn(med({ status: 'paused' }), '2026-11-15')).toBe(false);
    expect(isScheduledOn(med({ status: 'proposed' }), '2026-11-15')).toBe(false);
    expect(isScheduledOn(med({ startDate: '2026-11-16' }), '2026-11-15')).toBe(false);
    expect(isScheduledOn(med({ endDate: '2026-11-14' }), '2026-11-15')).toBe(false);
    expect(isScheduledOn(med({ endDate: '2026-11-15' }), '2026-11-15')).toBe(true);
    expect(isScheduledOn(med({ daysOfWeek: [1] }), '2026-11-15')).toBe(false);
  });

  it('creates sorted pending doses with UTC instants', () => {
    const doses = dosesOn(med(), '2026-11-15', 'Asia/Kolkata');
    expect(doses.map((d) => d.localTime)).toEqual(['08:00', '20:00']);
    expect(doses[0]).toMatchObject({
      id: 'm1_20261115_0800',
      status: 'pending',
      dueAt: zonedTimeToInstant('2026-11-15', '08:00', 'Asia/Kolkata'),
      medName: 'Amlodipine',
    });
    expect(dosesOn(med({ status: 'paused' }), '2026-11-15', 'Asia/Kolkata')).toEqual([]);
  });

  it('spans ranges across medications', () => {
    const doses = dosesBetween(
      [med(), med({ id: 'm2', times: ['12:00'], daysOfWeek: [0] })],
      '2026-11-15',
      '2026-11-16',
      'UTC',
    );
    expect(doses).toHaveLength(2 * 2 + 1);
  });

  it('materialises today plus a fixed lookahead', () => {
    const now = Date.UTC(2026, 10, 15, 20, 0); // 01:30 on the 16th in Kolkata
    expect(materialiseWindow(now, 'Asia/Kolkata')).toEqual({ from: '2026-11-16', to: '2026-11-19' });
    expect(MATERIALISE_DAYS_AHEAD).toBe(3);
  });
});
