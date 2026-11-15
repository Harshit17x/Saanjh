import { describe, expect, it } from 'vitest';
import { periodOf, summarise } from '../../shared/adherence';
import { recipientsFor } from '../../shared/escalation';
import { dose, member } from './fixtures';

describe('periodOf', () => {
  it.each([
    ['00:00', 'night'],
    ['04:59', 'night'],
    ['05:00', 'morning'],
    ['11:59', 'morning'],
    ['12:00', 'afternoon'],
    ['16:59', 'afternoon'],
    ['17:00', 'evening'],
    ['20:59', 'evening'],
    ['21:00', 'night'],
    ['23:59', 'night'],
  ])('%s is %s', (time, period) => {
    expect(periodOf(time)).toBe(period);
  });
});

describe('summarise byPeriod', () => {
  const day = '2026-11-15';
  const now = Date.UTC(2026, 10, 16);

  it('tallies each part of the day and leaves empty periods without a rate', () => {
    const doses = [
      dose({ id: 'a', localDate: day, localTime: '08:00', status: 'taken' }),
      dose({ id: 'b', localDate: day, localTime: '09:30', status: 'taken' }),
      dose({ id: 'c', localDate: day, localTime: '18:00', status: 'missed' }),
      dose({ id: 'd', localDate: day, localTime: '19:00', status: 'taken' }),
      dose({ id: 'e', localDate: day, localTime: '22:00', status: 'skipped' }),
    ];
    const { byPeriod } = summarise(doses, day, day, now);
    expect(byPeriod.map((p) => p.period)).toEqual(['morning', 'afternoon', 'evening', 'night']);
    const [morning, afternoon, evening, night] = byPeriod;
    expect(morning).toMatchObject({ taken: 2, missed: 0, rate: 1 });
    expect(afternoon).toMatchObject({ taken: 0, missed: 0, skipped: 0, rate: null });
    expect(evening).toMatchObject({ taken: 1, missed: 1, rate: 0.5 });
    expect(night).toMatchObject({ taken: 0, skipped: 1, rate: 0 });
  });

  it('ignores doses outside the range', () => {
    const { byPeriod } = summarise([dose({ localDate: '2026-11-01', status: 'taken' })], day, day, now);
    expect(byPeriod.every((p) => p.taken === 0)).toBe(true);
  });
});

describe('recipientsFor help', () => {
  it('returns reachable family and caretakers, never the elder', () => {
    const elder = member({ id: 'e', role: 'elder' });
    const family = member({ id: 'f', role: 'family', email: 'f@example.com' });
    const carer = member({ id: 'c', role: 'caretaker', email: 'c@example.com' });
    const muted = member({ id: 'm', role: 'family', notify: false });
    const noEmail = member({ id: 'n', role: 'caretaker', email: null });
    expect(recipientsFor('help', [elder, family, carer, muted, noEmail]).map((m) => m.id)).toEqual([
      'f',
      'c',
    ]);
  });
});
