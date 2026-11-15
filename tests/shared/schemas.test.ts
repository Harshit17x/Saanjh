import { describe, expect, it } from 'vitest';
import {
  adherenceQuerySchema,
  appointmentSchema,
  circleCodeSchema,
  createCircleSchema,
  joinSchema,
  medicationSchema,
  passcodeSchema,
  scanSchema,
} from '../../shared/schemas';
import { DEMO_PASSCODE } from '../../shared/demo';

describe('schemas', () => {
  it('normalises circle codes', () => {
    expect(circleCodeSchema.parse(' k7qm-4xpa ')).toBe('K7QM4XPA');
    expect(circleCodeSchema.parse('SAANJH-K7QM4XPA')).toBe('K7QM4XPA');
    expect(circleCodeSchema.safeParse('K7QM4XP0').success).toBe(false); // 0 is not in the alphabet
    expect(circleCodeSchema.safeParse('SHORT').success).toBe(false);
  });

  it('requires a 6-digit passcode', () => {
    expect(passcodeSchema.safeParse('123456').success).toBe(true);
    expect(passcodeSchema.safeParse('12345').success).toBe(false);
    expect(passcodeSchema.safeParse('12345a').success).toBe(false);
    expect(passcodeSchema.safeParse(DEMO_PASSCODE).success).toBe(true);
  });

  it('validates circle creation and turns blank email into null', () => {
    const ok = createCircleSchema.parse({
      elderName: ' Kamla ',
      timezone: 'Asia/Kolkata',
      email: '',
      passcode: '123456',
    });
    expect(ok).toMatchObject({ elderName: 'Kamla', email: null, language: 'en' });
    expect(
      createCircleSchema.parse({ elderName: 'K', timezone: 'UTC', email: 'A@B.COM', passcode: '123456' })
        .email,
    ).toBe('a@b.com');
    expect(
      createCircleSchema.safeParse({ elderName: 'K', timezone: 'Nowhere/Zone', passcode: '123456' }).success,
    ).toBe(false);
  });

  it('only lets family or caretakers join', () => {
    const base = { code: 'K7QM4XPA', name: 'Priya', passcode: '123456' };
    expect(joinSchema.safeParse({ ...base, role: 'family' }).success).toBe(true);
    expect(joinSchema.safeParse({ ...base, role: 'elder' }).success).toBe(false);
  });

  it('dedupes and sorts medication times and days, and checks end date', () => {
    const parsed = medicationSchema.parse({
      name: 'Metformin',
      times: ['20:30', '08:30', '20:30'],
      daysOfWeek: [3, 1, 1],
      startDate: '2026-11-01',
    });
    expect(parsed.times).toEqual(['08:30', '20:30']);
    expect(parsed.daysOfWeek).toEqual([1, 3]);
    expect(parsed).toMatchObject({ form: 'tablet', withFood: false, endDate: null, stock: null, notes: '' });
    const bad = medicationSchema.safeParse({
      name: 'X',
      times: ['08:00'],
      daysOfWeek: [1],
      startDate: '2026-11-10',
      endDate: '2026-11-01',
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(['endDate']);
    expect(
      medicationSchema.safeParse({ name: 'X', times: ['25:00'], daysOfWeek: [1], startDate: '2026-11-10' })
        .success,
    ).toBe(false);
    expect(
      medicationSchema.safeParse({ name: 'X', times: [], daysOfWeek: [1], startDate: '2026-11-10' }).success,
    ).toBe(false);
  });

  it('parses appointments, adherence query and scans', () => {
    expect(appointmentSchema.parse({ doctor: 'Dr. Rao', date: '2026-11-20', time: '10:00' }).place).toBe('');
    expect(adherenceQuerySchema.parse({}).days).toBe(7);
    expect(adherenceQuerySchema.parse({ days: '30' }).days).toBe(30);
    expect(adherenceQuerySchema.safeParse({ days: '14' }).success).toBe(false);
    expect(scanSchema.safeParse({ mimeType: 'image/jpeg', data: 'aGVsbG8=' }).success).toBe(true);
    expect(scanSchema.safeParse({ mimeType: 'image/gif', data: 'aGVsbG8=' }).success).toBe(false);
    expect(scanSchema.safeParse({ mimeType: 'image/png', data: 'not base64!' }).success).toBe(false);
  });
});
