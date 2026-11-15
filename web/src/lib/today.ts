import type { TodayResponse } from '../../../shared/api';
import type { Dose } from '../../../shared/types';
import type { Translate } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { formatDateTime, formatWallTime } from './format';

const NOON = 12 * 60;
const EVENING = 17 * 60;

/** Minutes since midnight for an "HH:MM" wall-clock time. */
export const minutesOf = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** The greeting that fits the time of day. */
export function greetingKey(minutes: number): Extract<MessageKey, `today.greeting.${string}`> {
  if (minutes < NOON) return 'today.greeting.morning';
  if (minutes < EVENING) return 'today.greeting.afternoon';
  return 'today.greeting.evening';
}

/** The dose to put front and centre: the earliest one still due, else the earliest missed today. */
export function pickNextDose(doses: Dose[]): Dose | null {
  return doses.find((d) => d.status === 'pending') ?? doses.find((d) => d.status === 'missed') ?? null;
}

/** Number of doses already taken. */
export const takenCount = (doses: Dose[]): number => doses.filter((d) => d.status === 'taken').length;

/** The text read out by "Read my day": greeting, progress, next dose and next visit. */
export function speechFor(
  t: Translate,
  data: TodayResponse,
  greeting: string,
  locale: string,
  timeZone: string,
): string {
  const parts = [t('speech.intro', { greeting, total: data.doses.length, taken: takenCount(data.doses) })];
  const next = pickNextDose(data.doses);
  if (next) {
    parts.push(
      t('speech.next', {
        med: next.medName,
        dose: next.medDose,
        time: formatWallTime(next.localTime, locale),
      }),
    );
    if (next.withFood) parts.push(t('speech.food'));
  } else if (data.doses.length > 0) parts.push(t('speech.done'));
  if (data.nextAppointment) {
    parts.push(
      t('speech.visit', {
        doctor: data.nextAppointment.doctor,
        when: formatDateTime(data.nextAppointment.at, timeZone, locale),
      }),
    );
  }
  return parts.join(' ');
}
