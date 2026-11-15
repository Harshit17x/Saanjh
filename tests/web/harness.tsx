import { render, type RenderResult } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import type {
  ActivityResponse,
  AdherenceResponse,
  CircleResponse,
  DigestResponse,
  SafetyCheckResponse,
  SessionResponse,
  TodayResponse,
  VisitBriefResponse,
} from '../../shared/api';
import { localDate } from '../../shared/time';
import type { Appointment, Dose, Medication, PublicMember } from '../../shared/types';
import { App } from '../../web/src/App';
import { PreferencesProvider } from '../../web/src/hooks/usePreferences';
import { SessionProvider } from '../../web/src/hooks/useSession';
import { I18nProvider } from '../../web/src/i18n';

export const TZ = 'Asia/Kolkata';
export const NOW = Date.now();
export const TODAY = localDate(NOW, TZ);
const HOUR = 3_600_000;

export const circle: SessionResponse['circle'] = {
  id: 'c1',
  code: 'QLJC8PSW',
  elderName: 'Kamla Devi',
  timezone: TZ,
  language: 'en',
  requireElderApproval: true,
  demo: false,
  createdAt: NOW - 30 * 24 * HOUR,
};

const member = (
  id: string,
  name: string,
  role: PublicMember['role'],
  permission: PublicMember['permission'] = 'manage',
): PublicMember => ({
  id,
  circleId: 'c1',
  name,
  role,
  email: `${id}@example.com`,
  permission,
  notify: true,
  createdAt: NOW - 10 * HOUR,
});

export const elder = member('m-elder', 'Kamla Devi', 'elder');
export const family = member('m-family', 'Priya', 'family');
export const caretaker = member('m-care', 'Ravi', 'caretaker');
export const members = [elder, family, caretaker];

export const session = (
  who: PublicMember = elder,
  overrides: Partial<SessionResponse['circle']> = {},
): SessionResponse => ({
  circle: { ...circle, ...overrides },
  member: who,
});

const dose = (
  id: string,
  medName: string,
  time: string,
  status: Dose['status'],
  extra: Partial<Dose> = {},
): Dose => ({
  id,
  circleId: 'c1',
  medId: `med-${medName}`,
  medName,
  medDose: '5 mg',
  withFood: false,
  dueAt: NOW,
  localDate: TODAY,
  localTime: time,
  status,
  actedBy: null,
  actedByName: null,
  actedAt: null,
  via: null,
  ...extra,
});

export const medBase = (overrides: Partial<Medication> = {}): Medication => ({
  id: 'med-1',
  circleId: 'c1',
  name: 'Amlodipine',
  dose: '5 mg',
  form: 'tablet',
  times: ['08:00'],
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  withFood: false,
  startDate: '2026-11-01',
  endDate: null,
  stock: 24,
  notes: 'For blood pressure',
  status: 'active',
  pending: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

export const proposedMed = medBase({
  id: 'med-prop',
  name: 'Calcium + D3',
  dose: '500 mg',
  times: ['13:00'],
  withFood: true,
  status: 'proposed',
  notes: 'Bones',
  pending: { action: 'create', changes: null, by: 'm-family', byName: 'Priya', at: NOW },
});

export const medications: Medication[] = [
  medBase(),
  medBase({
    id: 'med-2',
    name: 'Atorvastatin',
    dose: '10 mg',
    times: ['21:30'],
    stock: 3,
    daysOfWeek: [1, 3],
    notes: '',
  }),
  medBase({
    id: 'med-3',
    name: 'Metformin',
    dose: '500 mg',
    times: ['08:30', '20:30'],
    status: 'paused',
    stock: null,
    withFood: true,
  }),
  proposedMed,
];

export const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: 'appt-1',
  circleId: 'c1',
  doctor: 'Dr. Anil Mehta',
  speciality: 'Cardiology',
  place: 'Apollo Clinic, Bengaluru',
  at: NOW + 48 * HOUR,
  notes: 'Bring readings',
  createdBy: 'm-care',
  createdAt: NOW,
  ...overrides,
});

export const todayResponse = (overrides: Partial<TodayResponse> = {}): TodayResponse => ({
  date: TODAY,
  now: NOW,
  doses: [
    dose('d1', 'Amlodipine', '08:00', 'taken', { actedBy: 'm-care', actedByName: 'Ravi' }),
    dose('d2', 'Vitamin D3', '10:00', 'missed'),
    dose('d3', 'Metformin', '20:30', 'pending', { withFood: true, medDose: '500 mg' }),
    dose('d4', 'Atorvastatin', '21:30', 'skipped', { actedBy: 'm-elder', actedByName: 'Kamla Devi' }),
  ],
  nextAppointment: appointment(),
  proposals: [proposedMed],
  lowStock: [{ medId: 'med-2', medName: 'Atorvastatin', daysLeft: 3 }],
  checkIn: null,
  helpRequest: null,
  ...overrides,
});

const dayTally = (date: string, taken: number, missed: number) => ({
  date,
  taken,
  skipped: 0,
  missed,
  pending: 0,
  rate: taken + missed === 0 ? null : taken / (taken + missed),
});

export const adherenceResponse = (days = 7): AdherenceResponse => ({
  from: TODAY,
  to: TODAY,
  overall: { taken: 25, skipped: 1, missed: 2, pending: 0, rate: 25 / 28 },
  byDay: Array.from({ length: days }, (_, i) =>
    dayTally(`2026-11-${String(i + 1).padStart(2, '0')}`, 3, i % 3 === 0 ? 1 : 0),
  ),
  byMedication: [
    { medId: 'med-1', medName: 'Amlodipine', taken: 7, skipped: 0, missed: 0, pending: 0, rate: 1 },
    { medId: 'med-3', medName: 'Metformin', taken: 9, skipped: 0, missed: 3, pending: 0, rate: 0.75 },
    { medId: 'med-9', medName: 'Unused', taken: 0, skipped: 0, missed: 0, pending: 1, rate: null },
  ],
  byPeriod: [
    { period: 'morning', taken: 14, skipped: 0, missed: 0, pending: 0, rate: 1 },
    { period: 'afternoon', taken: 0, skipped: 0, missed: 0, pending: 0, rate: null },
    { period: 'evening', taken: 6, skipped: 0, missed: 3, pending: 0, rate: 6 / 9 },
    { period: 'night', taken: 5, skipped: 1, missed: 0, pending: 0, rate: 5 / 6 },
  ],
  streakDays: 4,
});

export const digestResponse: DigestResponse = {
  source: 'gemini',
  headline: '93% of doses taken this week',
  summary: 'Kamla Devi took 25 doses.',
  encouragement: 'Well done!',
};

export const safetyResponse: SafetyCheckResponse = {
  source: 'gemini',
  cautions: [
    {
      severity: 'warning',
      medsInvolved: ['Warfarin', 'Aspirin'],
      explanation: 'Bleeding risk.',
      questionForDoctor: 'Is this safe together?',
    },
    {
      severity: 'caution',
      medsInvolved: ['Metformin'],
      explanation: 'Take with food.',
      questionForDoctor: 'Morning or night?',
    },
    {
      severity: 'info',
      medsInvolved: ['A', 'B'],
      explanation: 'Busy time.',
      questionForDoctor: 'Spread out?',
    },
  ],
};

export const briefResponse: VisitBriefResponse = {
  source: 'rules',
  appointment: appointment(),
  medications: [{ name: 'Amlodipine', dose: '5 mg', times: ['08:00'], withFood: true }],
  adherencePercent: 92,
  overview: 'Kamla takes 1 medicine.',
  concerns: ['Metformin was taken 75% of the time.'],
  questions: ['Are all of these still needed?'],
};

export const activityResponse: ActivityResponse = {
  items: [
    {
      id: 'a1',
      circleId: 'c1',
      actorId: 'm-family',
      actorName: 'Priya',
      action: 'med.proposed',
      subject: 'Calcium + D3',
      at: NOW - HOUR,
    },
    {
      id: 'a2',
      circleId: 'c1',
      actorId: 'm-elder',
      actorName: 'Kamla Devi',
      action: 'dose.taken',
      subject: 'Amlodipine',
      at: NOW - 2 * HOUR,
    },
  ],
};

export const circleResponse = (overrides: Partial<SessionResponse['circle']> = {}): CircleResponse => ({
  circle: { ...circle, ...overrides },
  members,
});

export interface MockResponse {
  status?: number;
  body?: unknown;
}
export type Handler = MockResponse | ((body: unknown, path: string) => MockResponse | Promise<MockResponse>);
export type Routes = Record<string, Handler>;

export interface FetchMock {
  calls: { method: string; path: string; body: unknown }[];
  routes: Routes;
  callsTo(method: string, path: string): { method: string; path: string; body: unknown }[];
}

/**
 * Routes fetch by "METHOD /path" (path without the /api prefix, query included).
 * A route key ending in "*" matches any path with that prefix. Unrouted calls return 404.
 */
export function mockFetch(routes: Routes): FetchMock {
  const mock: FetchMock = {
    calls: [],
    routes,
    callsTo: (method, path) => mock.calls.filter((c) => c.method === method && c.path === path),
  };
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^\/api/, '');
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    mock.calls.push({ method, path, body });
    const key = `${method} ${path}`;
    let handler = mock.routes[key];
    if (!handler) {
      const prefix = Object.keys(mock.routes).find((k) => k.endsWith('*') && key.startsWith(k.slice(0, -1)));
      handler = prefix ? mock.routes[prefix] : undefined;
    }
    const result: MockResponse = handler
      ? typeof handler === 'function'
        ? await handler(body, path)
        : handler
      : { status: 404, body: { error: { code: 'not_found', message: `No route ${key}`, requestId: 'r' } } };
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return mock;
}

/** Default routes for a signed-in member, overridable per test. */
export function signedInRoutes(
  who: PublicMember = elder,
  extra: Routes = {},
  circleOverrides: Partial<SessionResponse['circle']> = {},
): Routes {
  return {
    'GET /me': { body: session(who, circleOverrides) },
    'GET /today': { body: todayResponse() },
    'GET /medications': { body: { items: medications } },
    'GET /appointments': {
      body: {
        items: [
          appointment(),
          appointment({ id: 'appt-old', doctor: 'Dr. Old', at: NOW - 72 * HOUR, place: '' }),
        ],
      },
    },
    'GET /adherence?days=7': { body: adherenceResponse(7) },
    'GET /adherence?days=30': { body: adherenceResponse(30) },
    'GET /ai/digest': { body: digestResponse },
    'POST /ai/safety-check': { body: safetyResponse },
    'GET /ai/visit-brief/appt-1': { body: briefResponse },
    'GET /circle': { body: circleResponse(circleOverrides) },
    'GET /activity': { body: activityResponse },
    ...extra,
  };
}

export const errorBody = (code: string, message: string, fields?: Record<string, string>) => ({
  error: { code, message, requestId: 'req-1', ...(fields ? { fields } : {}) },
});

/** In-memory Storage: Node 25's built-in localStorage global shadows jsdom's and is unusable without a file. */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

export function installStorage(storage: Storage = new MemoryStorage()): Storage {
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  return storage;
}

/** Browser APIs jsdom lacks, plus fresh storage and document state for each test. */
export function installBrowserStubs() {
  installStorage();
  document.documentElement.lang = 'en';
  delete document.documentElement.dataset.textSize;
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal('speechSynthesis', { speak, cancel });
  class Utterance {
    lang = '';
    rate = 1;
    onend: (() => void) | null = null;
    constructor(public text: string) {}
  }
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  window.confirm = vi.fn(() => true);
  window.alert = vi.fn();
  window.prompt = vi.fn(() => null);
  window.print = vi.fn();
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return { speak, cancel, writeText };
}

export function Providers({ children, path = '/' }: { children: ReactNode; path?: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <PreferencesProvider>
          <SessionProvider>{children}</SessionProvider>
        </PreferencesProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

export function renderApp(path: string): RenderResult {
  return render(
    <Providers path={path}>
      <App />
    </Providers>,
  );
}

/** Runs axe on the rendered document; color-contrast is skipped because jsdom has no layout. */
export async function expectNoAxeViolations(container: Element = document.body) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
  if (summary.length > 0) throw new Error(`axe violations:\n${summary.join('\n')}`);
}
