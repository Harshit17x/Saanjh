import { beforeEach, describe, expect, it } from 'vitest';
import { helpEmail, moodEmail } from '../../server/email/templates';
import type { Circle } from '../../shared/types';
import { agent, buildContext, createCircle, joinAs, PASSCODE, type TestContext } from './helpers';

type Agent = ReturnType<typeof agent>;
const DAY_MIN = 24 * 60;

interface Setup {
  ctx: TestContext;
  elder: Agent;
  family: Agent;
  carer: Agent;
  code: string;
  elderId: string;
}

async function setup(): Promise<Setup> {
  const ctx = buildContext();
  const created = await createCircle(ctx);
  const family = (await joinAs(ctx, created.code, 'family', 'Priya', 'priya@example.com')).member;
  const carer = (await joinAs(ctx, created.code, 'caretaker', 'Ravi', 'ravi@example.com')).member;
  // A member who cannot be emailed is never counted.
  await joinAs(ctx, created.code, 'family', 'Arjun', null);
  return { ctx, elder: created.elder, family, carer, code: created.code, elderId: created.elderId };
}

/** Sessions last 12 hours, so tests that move the clock a day ahead sign in again. */
async function signInAgain(s: Setup): Promise<Agent> {
  const fresh = agent(s.ctx);
  await fresh
    .post('/api/auth/login')
    .send({ code: s.code, memberId: s.elderId, passcode: PASSCODE })
    .expect(200);
  return fresh;
}

describe('daily check-in', () => {
  let s: Setup;
  beforeEach(async () => {
    s = await setup();
  });

  it('records the elder’s mood and note, shown on Today for the whole circle', async () => {
    const res = await s.elder.post('/api/checkin').send({ mood: 'good', note: 'Slept well' }).expect(201);
    expect(res.body).toMatchObject({ mood: 'good', note: 'Slept well', byName: 'Kamla Devi' });

    const today = await s.family.get('/api/today').expect(200);
    expect(today.body.checkIn).toMatchObject({ mood: 'good', note: 'Slept well', byName: 'Kamla Devi' });

    const activity = await s.family.get('/api/activity').expect(200);
    const entry = (activity.body.items as { action: string; subject: string; detail?: string }[]).find(
      (a) => a.action === 'wellbeing.checkin',
    );
    expect(entry).toMatchObject({ subject: 'good', detail: 'Slept well' });
    expect(s.ctx.mailer.sent).toHaveLength(0);
  });

  it('shows the latest check-in of the day', async () => {
    await s.elder.post('/api/checkin').send({ mood: 'okay' }).expect(201);
    s.ctx.clock.advanceMinutes(30);
    await s.elder.post('/api/checkin').send({ mood: 'great' }).expect(201);
    const today = await s.elder.get('/api/today').expect(200);
    expect(today.body.checkIn).toMatchObject({ mood: 'great', note: '' });
  });

  it('allows only the elder to check in', async () => {
    await s.family.post('/api/checkin').send({ mood: 'good' }).expect(403);
    await s.carer.post('/api/checkin').send({ mood: 'good' }).expect(403);
  });

  it('rejects an unknown mood', async () => {
    const res = await s.elder.post('/api/checkin').send({ mood: 'ecstatic' }).expect(400);
    expect(res.body.error.fields).toHaveProperty('mood');
  });

  it('tells family and caretakers once a day when the elder feels low or unwell', async () => {
    await s.elder.post('/api/checkin').send({ mood: 'low', note: 'Knee <hurts>' }).expect(201);
    expect(s.ctx.mailer.sent.map((e) => e.to).sort()).toEqual(['priya@example.com', 'ravi@example.com']);
    expect(s.ctx.mailer.sent[0]?.subject).toBe('Kamla Devi is feeling low today');
    expect(s.ctx.mailer.sent[0]?.html).toContain('Knee &lt;hurts&gt;');

    await s.elder.post('/api/checkin').send({ mood: 'unwell' }).expect(201);
    expect(s.ctx.mailer.sent).toHaveLength(2);

    s.ctx.clock.advanceMinutes(DAY_MIN);
    const elder = await signInAgain(s);
    await elder.post('/api/checkin').send({ mood: 'unwell' }).expect(201);
    expect(s.ctx.mailer.sent).toHaveLength(4);
  });

  it('sends nothing for a good day', async () => {
    for (const mood of ['great', 'good', 'okay'])
      await s.elder.post('/api/checkin').send({ mood }).expect(201);
    expect(s.ctx.mailer.sent).toHaveLength(0);
  });
});

describe('call for help', () => {
  let s: Setup;
  beforeEach(async () => {
    s = await setup();
  });

  it('alerts every reachable family member and caretaker when the elder asks', async () => {
    const res = await s.elder.post('/api/help').send({ note: 'I fell' }).expect(201);
    expect(res.body).toEqual({ notified: 2 });
    expect(s.ctx.mailer.sent.map((e) => e.to).sort()).toEqual(['priya@example.com', 'ravi@example.com']);
    for (const email of s.ctx.mailer.sent) {
      expect(email.subject).toMatch(/^Urgent: Kamla Devi has asked for help/);
      expect(email.text).toContain('I fell');
    }
    const today = await s.family.get('/api/today').expect(200);
    expect(today.body.helpRequest).toMatchObject({ byName: 'Kamla Devi' });
  });

  it('lets a caretaker call for help without emailing themselves', async () => {
    const res = await s.carer.post('/api/help').send({}).expect(201);
    expect(res.body).toEqual({ notified: 1 });
    // Help alerts go to family and caretakers (not the elder), minus the sender.
    expect(s.ctx.mailer.sent.map((e) => e.to)).toEqual(['priya@example.com']);
  });

  it('does not let family members raise the alarm', async () => {
    await s.family.post('/api/help').send({}).expect(403);
    expect(s.ctx.mailer.sent).toHaveLength(0);
  });

  it('still counts the others when one email fails', async () => {
    s.ctx.mailer.failNext = 1;
    const res = await s.elder.post('/api/help').send({}).expect(201);
    expect(res.body).toEqual({ notified: 1 });
  });

  it('limits repeated alerts to three every ten minutes', async () => {
    for (let i = 0; i < 3; i += 1) await s.elder.post('/api/help').send({}).expect(201);
    await s.elder.post('/api/help').send({}).expect(429);
  });

  it('clears the help banner after a day', async () => {
    await s.elder.post('/api/help').send({}).expect(201);
    s.ctx.clock.advanceMinutes(DAY_MIN - 1);
    const elder = await signInAgain(s);
    expect((await elder.get('/api/today').expect(200)).body.helpRequest).not.toBeNull();
    s.ctx.clock.advanceMinutes(2);
    expect((await elder.get('/api/today').expect(200)).body.helpRequest).toBeNull();
  });

  it('rejects an over-long note', async () => {
    await s.elder
      .post('/api/help')
      .send({ note: 'x'.repeat(201) })
      .expect(400);
  });
});

describe('help and mood email templates', () => {
  const circle = { elderName: 'Kamla <b>Devi</b>' } as Circle;

  it('escapes every value in the help email', () => {
    const email = helpEmail('a@example.com', circle, 'Ravi "R"', '<script>x</script>', 'https://s.test');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('Kamla &lt;b&gt;Devi&lt;/b&gt;');
    expect(email.html).toContain('Ravi &quot;R&quot;');
    expect(email.subject).toBe('Urgent: Ravi "R" has asked for help');
  });

  it('omits the message line when there is no note', () => {
    expect(helpEmail('a@example.com', circle, 'Ravi', '', 'https://s.test').html).not.toContain('Message:');
    expect(moodEmail('a@example.com', circle, 'low', '', 'https://s.test').html).not.toContain('They wrote');
  });

  it('escapes the mood email note', () => {
    const email = moodEmail('a@example.com', circle, 'unwell', '<img src=x>', 'https://s.test');
    expect(email.html).toContain('&lt;img src=x&gt;');
    expect(email.text).toContain('They wrote: <img src=x>');
  });
});
