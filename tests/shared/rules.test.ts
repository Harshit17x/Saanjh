import { describe, expect, it } from 'vitest';
import { percent, summarise } from '../../shared/adherence';
import {
  appointmentStage,
  doseStage,
  effectiveStatus,
  recipientsFor,
  REMINDER,
} from '../../shared/escalation';
import { daysOfSupply, dosesPerDay, needsRefill } from '../../shared/refill';
import { dose, member } from './fixtures';

const MIN = 60_000;

describe('escalation', () => {
  const due = 1_000_000_000;
  const at = (minutes: number) => due + minutes * MIN;

  it('reports nothing well before the dose', () => {
    expect(doseStage(dose({ dueAt: due }), at(-REMINDER.upcomingLeadMin - 1))).toBeNull();
  });

  it('moves through upcoming, nudge and missed at exact boundaries', () => {
    const d = dose({ dueAt: due });
    expect(doseStage(d, at(-REMINDER.upcomingLeadMin))).toBe('upcoming');
    expect(doseStage(d, at(REMINDER.nudgeAfterMin - 1))).toBe('upcoming');
    expect(doseStage(d, at(REMINDER.nudgeAfterMin))).toBe('nudge');
    expect(doseStage(d, at(REMINDER.missedAfterMin - 1))).toBe('nudge');
    expect(doseStage(d, at(REMINDER.missedAfterMin))).toBe('missed');
  });

  it('ignores doses already decided', () => {
    expect(doseStage(dose({ dueAt: due, status: 'taken' }), at(90))).toBeNull();
  });

  it('computes appointment reminders', () => {
    const appt = { at: due };
    expect(appointmentStage(appt, due - 25 * 60 * MIN)).toBeNull();
    expect(appointmentStage(appt, due - 24 * 60 * MIN)).toBe('appt24h');
    expect(appointmentStage(appt, due - 3 * 60 * MIN)).toBe('appt24h');
    expect(appointmentStage(appt, due - 2 * 60 * MIN)).toBe('appt2h');
    expect(appointmentStage(appt, due)).toBeNull();
  });

  it('treats long-overdue pending doses as missed', () => {
    expect(effectiveStatus(dose({ dueAt: due }), at(59))).toBe('pending');
    expect(effectiveStatus(dose({ dueAt: due }), at(60))).toBe('missed');
    expect(effectiveStatus(dose({ dueAt: due, status: 'skipped' }), at(600))).toBe('skipped');
  });

  it('chooses recipients: elder first, family on missed', () => {
    const elder = member();
    const family = member({ id: 'f', role: 'family', email: 'f@example.com' });
    const carer = member({ id: 'c', role: 'caretaker', email: 'c@example.com' });
    const muted = member({ id: 'x', role: 'family', notify: false });
    const all = [elder, family, carer, muted];
    expect(recipientsFor('upcoming', all)).toEqual([elder]);
    expect(recipientsFor('nudge', all)).toEqual([elder]);
    expect(recipientsFor('missed', all)).toEqual([family, carer]);
    expect(recipientsFor('appt24h', all)).toEqual([elder, family, carer]);
    expect(recipientsFor('appt2h', all)).toHaveLength(3);
    expect(recipientsFor('lowStock', all)).toHaveLength(3);
    expect(recipientsFor('digest', all)).toHaveLength(3);
  });

  it('falls back to caretakers when the elder has no email', () => {
    const elder = member({ email: null });
    const family = member({ id: 'f', role: 'family' });
    const carer = member({ id: 'c', role: 'caretaker' });
    expect(recipientsFor('upcoming', [elder, family, carer])).toEqual([carer]);
    expect(recipientsFor('upcoming', [member({ email: '' })])).toEqual([]);
  });
});

describe('refill', () => {
  it('computes supply', () => {
    expect(dosesPerDay({ times: ['08:00', '20:00'], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })).toBe(2);
    expect(daysOfSupply({ times: ['08:00', '20:00'], daysOfWeek: [0, 1, 2, 3, 4, 5, 6], stock: 9 })).toBe(4);
    expect(daysOfSupply({ times: ['08:00'], daysOfWeek: [0], stock: 2 })).toBe(14);
    expect(daysOfSupply({ times: ['08:00'], daysOfWeek: [0], stock: null })).toBeNull();
    expect(daysOfSupply({ times: [], daysOfWeek: [0], stock: 3 })).toBeNull();
  });

  it('warns below the threshold', () => {
    const daily = { times: ['08:00'], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
    expect(needsRefill({ ...daily, stock: 4 })).toBe(true);
    expect(needsRefill({ ...daily, stock: 5 })).toBe(false);
    expect(needsRefill({ ...daily, stock: 0 })).toBe(true);
    expect(needsRefill({ ...daily, stock: null })).toBe(false);
  });
});

describe('adherence', () => {
  const now = Date.UTC(2026, 10, 15, 12);
  const past = now - 3 * 60 * MIN;

  it('tallies by day and medication and computes a streak', () => {
    const doses = [
      dose({ id: 'a', localDate: '2026-11-13', status: 'missed', dueAt: past }),
      dose({ id: 'b', localDate: '2026-11-14', status: 'taken', dueAt: past }),
      dose({ id: 'c', localDate: '2026-11-15', status: 'taken', dueAt: past }),
      dose({
        id: 'd',
        localDate: '2026-11-15',
        medId: 'm2',
        medName: 'Aspirin',
        status: 'pending',
        dueAt: now + 60 * MIN,
      }),
      dose({ id: 'e', localDate: '2026-11-10', status: 'taken', dueAt: past }), // out of range
    ];
    const s = summarise(doses, '2026-11-13', '2026-11-15', now);
    expect(s.overall).toMatchObject({ taken: 2, missed: 1, pending: 1, skipped: 0 });
    expect(s.overall.rate).toBeCloseTo(2 / 3);
    expect(s.byDay.map((d) => d.date)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
    expect(s.byDay[0]?.rate).toBe(0);
    expect(s.byMedication.map((m) => m.medName)).toEqual(['Amlodipine', 'Aspirin']);
    expect(s.byMedication[1]?.rate).toBeNull();
    expect(s.streakDays).toBe(2);
  });

  it('counts overdue pending doses as missed and handles empty ranges', () => {
    const s = summarise(
      [dose({ status: 'pending', dueAt: now - 2 * 60 * MIN })],
      '2026-11-15',
      '2026-11-15',
      now,
    );
    expect(s.overall.missed).toBe(1);
    expect(s.streakDays).toBe(0);
    const empty = summarise([], '2026-11-15', '2026-11-15', now);
    expect(empty.overall.rate).toBeNull();
    expect(empty.streakDays).toBe(0);
  });

  it('breaks the streak on a skipped day', () => {
    const doses = [
      dose({ id: 'a', localDate: '2026-11-14', status: 'taken', dueAt: past }),
      dose({ id: 'b', localDate: '2026-11-15', status: 'skipped', dueAt: past }),
    ];
    expect(summarise(doses, '2026-11-14', '2026-11-15', now).streakDays).toBe(0);
  });

  it('rounds percentages', () => {
    expect(percent(0.926)).toBe(93);
    expect(percent(null)).toBeNull();
  });
});
