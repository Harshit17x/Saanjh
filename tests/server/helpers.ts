import request from 'supertest';
import { MemoryRepository } from '../../server/adapters/memory/repository';
import { createApp } from '../../server/app';
import type { Deps } from '../../server/context';
import type { AiClient, AiRequest, Email, Logger, Mailer } from '../../server/ports/services';
import { ActionLinkSigner } from '../../server/security/actionLinks';
import { SessionSigner } from '../../server/security/session';
import { sharedSecretVerifier } from '../../server/security/trigger';

/** 15 Nov 2026, 12:00 in Asia/Kolkata (06:30 UTC). */
export const NOON_IST = Date.UTC(2026, 10, 15, 6, 30);
export const TICK_SECRET = 'test-tick-secret-value';

export class FakeClock {
  constructor(public value: number = NOON_IST) {}
  now = (): number => this.value;
  advanceMinutes(minutes: number): void {
    this.value += minutes * 60_000;
  }
}

export class FakeMailer implements Mailer {
  sent: Email[] = [];
  failNext = 0;
  send(email: Email): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error('smtp down'));
    }
    this.sent.push(email);
    return Promise.resolve();
  }
}

/** Scripted model: each call takes the next queued response (a value, or an Error to throw). */
export class FakeAi implements AiClient {
  available = true;
  requests: AiRequest[] = [];
  queue: unknown[] = [];
  generateJson(req: AiRequest): Promise<unknown> {
    this.requests.push(req);
    const next = this.queue.shift();
    if (next instanceof Error) return Promise.reject(next);
    if (next === undefined) return Promise.reject(new Error('no scripted response'));
    return Promise.resolve(next);
  }
}

export const silentLogger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

export interface TestContext {
  deps: Deps;
  repo: MemoryRepository;
  clock: FakeClock;
  mailer: FakeMailer;
  ai: FakeAi;
  app: ReturnType<typeof createApp>;
}

export function buildContext(overrides: Partial<Deps> = {}): TestContext {
  const repo = new MemoryRepository();
  const clock = new FakeClock();
  const mailer = new FakeMailer();
  const ai = new FakeAi();
  const deps: Deps = {
    repo,
    clock,
    mailer,
    ai,
    sessions: new SessionSigner('s'.repeat(40)),
    links: new ActionLinkSigner('l'.repeat(40)),
    verifyTrigger: sharedSecretVerifier(TICK_SECRET),
    logger: silentLogger,
    appUrl: 'https://saanjh.test',
    secureCookies: false,
    ...overrides,
  };
  return { deps, repo, clock, mailer, ai, app: createApp(deps) };
}

/** A supertest agent that keeps cookies, i.e. one signed-in browser. */
export const agent = (ctx: TestContext) => request.agent(ctx.app);

export const PASSCODE = '135790';

/** Creates a circle in Asia/Kolkata and returns the elder's agent and the circle code. */
export async function createCircle(ctx: TestContext, email: string | null = 'elder@example.com') {
  const elder = agent(ctx);
  const res = await elder
    .post('/api/circles')
    .send({ elderName: 'Kamla Devi', timezone: 'Asia/Kolkata', language: 'en', email, passcode: PASSCODE })
    .expect(201);
  const body = res.body as { circle: { id: string; code: string }; member: { id: string } };
  return { elder, code: body.circle.code, circleId: body.circle.id, elderId: body.member.id };
}

export async function joinAs(
  ctx: TestContext,
  code: string,
  role: 'family' | 'caretaker',
  name: string,
  email: string | null = null,
) {
  const member = agent(ctx);
  const res = await member
    .post('/api/auth/join')
    .send({ code, name, role, email, passcode: PASSCODE })
    .expect(201);
  return { member, memberId: (res.body as { member: { id: string } }).member.id };
}

export const medication = (overrides: Record<string, unknown> = {}) => ({
  name: 'Amlodipine',
  dose: '5 mg',
  form: 'tablet',
  times: ['14:00'],
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  withFood: false,
  startDate: '2026-11-01',
  endDate: null,
  stock: 10,
  notes: '',
  ...overrides,
});
