import type { MedicationInput } from '../../shared/schemas';
import { dosesBetween } from '../../shared/schedule';
import { addDays, localDate, zonedTimeToInstant } from '../../shared/time';
import type { Dose, DoseStatus, Medication } from '../../shared/types';
import type { Actor, Deps } from '../context';
import { forbidden, notFound } from '../errors';
import { createAppointment } from './appointments';
import { createCircle, joinCircle } from './circles';
import { createMedication } from './medications';

import { DEMO_PASSCODE } from '../../shared/demo';

export { DEMO_PASSCODE };
const DEMO_TIMEZONE = 'Asia/Kolkata';
const HISTORY_DAYS = 13;

const daily = [0, 1, 2, 3, 4, 5, 6];

const DEMO_MEDS = (start: string): MedicationInput[] => [
  {
    name: 'Amlodipine',
    dose: '5 mg',
    form: 'tablet',
    times: ['08:00'],
    daysOfWeek: daily,
    withFood: false,
    startDate: start,
    endDate: null,
    stock: 24,
    notes: 'For blood pressure',
  },
  {
    name: 'Metformin',
    dose: '500 mg',
    form: 'tablet',
    times: ['08:30', '20:30'],
    daysOfWeek: daily,
    withFood: true,
    startDate: start,
    endDate: null,
    stock: 40,
    notes: 'For sugar',
  },
  {
    name: 'Atorvastatin',
    dose: '10 mg',
    form: 'tablet',
    times: ['21:30'],
    daysOfWeek: daily,
    withFood: false,
    startDate: start,
    endDate: null,
    stock: 3,
    notes: 'For cholesterol',
  },
  {
    name: 'Vitamin D3',
    dose: '60000 IU',
    form: 'capsule',
    times: ['10:00'],
    daysOfWeek: [0],
    withFood: true,
    startDate: start,
    endDate: null,
    stock: 6,
    notes: 'Sundays',
  },
];

/**
 * A believable history: evening Metformin is the dose most often missed,
 * which gives the insights, digest and visit brief something real to say.
 */
function historicStatus(dose: Dose, dayIndex: number): DoseStatus {
  if (dose.medName === 'Metformin' && dose.localTime === '20:30' && dayIndex % 4 === 1) return 'missed';
  if (dose.medName === 'Atorvastatin' && dayIndex === 5) return 'skipped';
  if (dose.medName === 'Amlodipine' && dayIndex === 9) return 'missed';
  return 'taken';
}

async function seedHistory(deps: Deps, actor: Actor, meds: Medication[]): Promise<void> {
  const now = deps.clock.now();
  const today = localDate(now, DEMO_TIMEZONE);
  const from = addDays(today, -HISTORY_DAYS);
  const past = dosesBetween(meds, from, today, DEMO_TIMEZONE).filter((d) => d.dueAt < now);
  const dayIndex = (date: string): number =>
    Math.round(
      (zonedTimeToInstant(date, '12:00', DEMO_TIMEZONE) - zonedTimeToInstant(from, '12:00', DEMO_TIMEZONE)) /
        86_400_000,
    );
  const recorded = past.map((dose): Dose => {
    const status = historicStatus(dose, dayIndex(dose.localDate));
    const acted = status === 'taken' || status === 'skipped';
    return {
      ...dose,
      status,
      actedBy: acted ? actor.member.id : null,
      actedByName: acted ? actor.member.name : null,
      actedAt: acted ? dose.dueAt + 5 * 60_000 : null,
      via: acted ? 'app' : null,
    };
  });
  await deps.repo.createDosesIfAbsent(recorded);
}

/** Creates a fully populated demo circle and returns the elder's session. */
export async function createDemoCircle(deps: Deps): Promise<{ actor: Actor; code: string }> {
  const now = deps.clock.now();
  const today = localDate(now, DEMO_TIMEZONE);
  const elder = await createCircle(
    deps,
    {
      elderName: 'Kamla Devi',
      timezone: DEMO_TIMEZONE,
      language: 'en',
      email: null,
      passcode: DEMO_PASSCODE,
    },
    true,
  );
  const code = elder.circle.code;
  const priya = await joinCircle(deps, {
    code,
    name: 'Priya',
    role: 'family',
    email: null,
    passcode: DEMO_PASSCODE,
  });
  const ravi = await joinCircle(deps, {
    code,
    name: 'Ravi',
    role: 'caretaker',
    email: null,
    passcode: DEMO_PASSCODE,
  });

  const meds: Medication[] = [];
  for (const input of DEMO_MEDS(addDays(today, -HISTORY_DAYS)))
    meds.push(await createMedication(deps, elder, input));
  await seedHistory(deps, elder, meds);

  await createMedication(deps, priya, {
    name: 'Calcium + D3',
    dose: '500 mg',
    form: 'tablet',
    times: ['13:00'],
    daysOfWeek: daily,
    withFood: true,
    startDate: today,
    endDate: null,
    stock: 30,
    notes: 'Suggested by Dr. Mehta for bone strength',
  });
  await createAppointment(deps, ravi, {
    doctor: 'Dr. Anil Mehta',
    speciality: 'Cardiology',
    place: 'Apollo Clinic, Indiranagar, Bengaluru',
    date: addDays(today, 2),
    time: '11:00',
    notes: 'Bring the last blood pressure readings',
  });
  await createAppointment(deps, priya, {
    doctor: 'Dr. Sunita Rao',
    speciality: 'General physician',
    place: 'Manipal Hospital, Old Airport Road, Bengaluru',
    date: addDays(today, 12),
    time: '17:30',
    notes: '',
  });
  return { actor: elder, code };
}

/** In a demo circle only, signs in as another member to see their view. */
export async function switchDemoMember(deps: Deps, actor: Actor, memberId: string): Promise<Actor> {
  if (!actor.circle.demo) throw forbidden('Only available in a demo circle');
  const member = await deps.repo.getMember(actor.circle.id, memberId);
  if (!member) throw notFound('Member');
  return { circle: actor.circle, member };
}
