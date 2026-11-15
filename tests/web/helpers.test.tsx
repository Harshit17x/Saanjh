// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TodayResponse } from '../../shared/api';
import { ApiError } from '../../web/src/api/client';
import { supplyPercent } from '../../web/src/components/medicines/MedicineCard';
import { useAction } from '../../web/src/hooks/useAction';
import { canCallForHelp } from '../../web/src/hooks/useSession';
import { format } from '../../web/src/i18n';
import { en } from '../../web/src/i18n/en';
import type { MessageKey } from '../../web/src/i18n/en';
import { greetingKey, minutesOf, speechFor, takenCount } from '../../web/src/lib/today';
import { dose } from '../shared/fixtures';

const t = (key: MessageKey, vars?: Record<string, string | number>) => format(en[key], vars);

describe('useAction', () => {
  it('reports success and clears earlier errors', async () => {
    const { result } = renderHook(() => useAction());
    await act(async () => {
      await result.current.run(() => Promise.reject(new Error('boom')));
    });
    expect(result.current.error).toBe('boom');
    let ok = false;
    await act(async () => {
      ok = await result.current.run(() => Promise.resolve());
    });
    expect(ok).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('keeps per-field messages from a rejected form', async () => {
    const { result } = renderHook(() => useAction());
    let ok = true;
    await act(async () => {
      ok = await result.current.run(() =>
        Promise.reject(new ApiError(400, 'invalid', 'Check the form', { name: 'Required' })),
      );
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('Check the form');
    expect(result.current.fields).toEqual({ name: 'Required' });
  });
});

describe('Today helpers', () => {
  it('turns wall-clock times into minutes and picks a greeting', () => {
    expect(minutesOf('07:30')).toBe(450);
    expect(greetingKey(minutesOf('07:30'))).toBe('today.greeting.morning');
    expect(greetingKey(minutesOf('13:00'))).toBe('today.greeting.afternoon');
    expect(greetingKey(minutesOf('19:00'))).toBe('today.greeting.evening');
  });

  it('builds the read-aloud text from the day', () => {
    const doses = [
      dose({ id: 'a', status: 'taken' }),
      dose({ id: 'b', status: 'pending', medName: 'Metformin', medDose: '500 mg', withFood: true }),
    ];
    expect(takenCount(doses)).toBe(1);
    const data = { doses, nextAppointment: null } as unknown as TodayResponse;
    const text = speechFor(t, data, 'Good morning', 'en-IN', 'Asia/Kolkata');
    expect(text).toContain('Metformin');
    expect(text).toContain(t('speech.food'));
  });

  it('says the day is done when nothing is left', () => {
    const data = { doses: [dose({ status: 'taken' })], nextAppointment: null } as unknown as TodayResponse;
    expect(speechFor(t, data, 'Hello', 'en-IN', 'Asia/Kolkata')).toContain(t('speech.done'));
  });
});

describe('small rules', () => {
  it('fills the supply bar at a month and caps it at 100%', () => {
    expect(supplyPercent(15)).toBe(50);
    expect(supplyPercent(90)).toBe(100);
  });

  it('lets the elder and caretakers call for help, not family', () => {
    expect(canCallForHelp({ role: 'elder' })).toBe(true);
    expect(canCallForHelp({ role: 'caretaker' })).toBe(true);
    expect(canCallForHelp({ role: 'family' })).toBe(false);
  });
});
