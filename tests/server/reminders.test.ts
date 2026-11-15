import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  agent,
  buildContext,
  createCircle,
  joinAs,
  medication,
  TICK_SECRET,
  type TestContext,
} from './helpers';

type Agent = ReturnType<typeof agent>;

const tick = (ctx: TestContext) =>
  request(ctx.app).post('/api/internal/tick').set('Authorization', `Bearer ${TICK_SECRET}`).expect(200);

const tokenFrom = (text: string, label: 'I took it' | 'Skip'): string => {
  const match = new RegExp(`${label}: \\S+/act#(\\S+)`).exec(text);
  if (!match?.[1]) throw new Error('no link in email');
  return match[1];
};

describe('reminder run', () => {
  let ctx: TestContext;
  let elder: Agent;
  let circleId: string;
  let carerId: string;

  beforeEach(async () => {
    ctx = buildContext();
    const created = await createCircle(ctx);
    elder = created.elder;
    circleId = created.circleId;
    await joinAs(ctx, created.code, 'family', 'Priya', 'priya@example.com');
    carerId = (await joinAs(ctx, created.code, 'caretaker', 'Ravi', 'ravi@example.com')).memberId;
    await elder
      .post('/api/medications')
      .send(medication({ name: 'Metformin', times: ['12:05'], stock: 30 }))
      .expect(201);
  });

  it('requires the scheduler credential', async () => {
    await request(ctx.app).post('/api/internal/tick').expect(403);
    await request(ctx.app).post('/api/internal/tick').set('Authorization', 'Bearer wrong').expect(403);
    await request(ctx.app).post('/api/internal/digest').expect(403);
  });

  it('reminds the elder, nudges, then escalates a missed dose to family once', async () => {
    const first = await tick(ctx);
    expect(first.body).toMatchObject({ sent: 1, failed: 0, toppedUp: 1 });
    expect(ctx.mailer.sent[0]).toMatchObject({ to: 'elder@example.com', subject: 'Time for Metformin' });
    expect(ctx.mailer.sent[0]?.html).toContain('I took it');

    expect((await tick(ctx)).body.sent).toBe(0);

    ctx.clock.advanceMinutes(25);
    await tick(ctx);
    expect(ctx.mailer.sent.at(-1)).toMatchObject({
      to: 'elder@example.com',
      subject: 'Did you take Metformin?',
    });

    ctx.clock.advanceMinutes(40);
    const missed = await tick(ctx);
    expect(missed.body).toMatchObject({ sent: 2, markedMissed: 1 });
    expect(
      ctx.mailer.sent
        .slice(-2)
        .map((e) => e.to)
        .sort(),
    ).toEqual(['priya@example.com', 'ravi@example.com']);
    expect(ctx.mailer.sent.at(-1)?.subject).toBe('Kamla Devi has not confirmed Metformin');
    const dose = (await ctx.repo.listDosesForCircle(circleId, 0, Number.MAX_SAFE_INTEGER)).find(
      (d) => d.localTime === '12:05',
    );
    expect(dose?.status).toBe('missed');

    expect((await tick(ctx)).body.sent).toBe(0);
  });

  it('sends nothing for a dose already taken', async () => {
    const today = await elder.get('/api/today').expect(200);
    await elder.post(`/api/doses/${today.body.doses[0].id}/take`).expect(200);
    expect((await tick(ctx)).body.sent).toBe(0);
  });

  it('retries an email that failed to send', async () => {
    ctx.mailer.failNext = 1;
    expect((await tick(ctx)).body).toMatchObject({ sent: 0, failed: 1 });
    expect((await tick(ctx)).body).toMatchObject({ sent: 1, failed: 0 });
  });

  it('sends appointment reminders a day and two hours ahead', async () => {
    await elder
      .post('/api/appointments')
      .send({ doctor: 'Dr. Mehta', date: '2026-11-16', time: '11:00', place: 'Apollo' })
      .expect(201);
    await tick(ctx);
    const dayAhead = ctx.mailer.sent.filter((e) => e.subject.startsWith('Tomorrow'));
    expect(dayAhead.map((e) => e.to).sort()).toEqual([
      'elder@example.com',
      'priya@example.com',
      'ravi@example.com',
    ]);
    expect(dayAhead[0]?.html).toContain('Apollo');

    ctx.clock.advanceMinutes(21 * 60 + 30); // 09:30 next day
    await tick(ctx);
    expect(ctx.mailer.sent.filter((e) => e.subject.startsWith('In 2 hours'))).toHaveLength(3);
  });

  it('warns about low stock once a week', async () => {
    const meds = await ctx.repo.listMedications(circleId);
    await ctx.repo.saveMedication({ ...meds[0]!, stock: 2 });
    await tick(ctx);
    const refill = ctx.mailer.sent.filter((e) => e.subject === 'Time to refill Metformin');
    expect(refill).toHaveLength(3);
    expect(refill[0]?.html).toContain('2 days');
    await tick(ctx);
    expect(ctx.mailer.sent.filter((e) => e.subject === 'Time to refill Metformin')).toHaveLength(3);
  });

  it('sends the elder’s reminders to a caretaker when the elder has no email', async () => {
    const elderMember = (await ctx.repo.listMembers(circleId)).find((m) => m.role === 'elder')!;
    await ctx.repo.updateMember(circleId, elderMember.id, { email: null });
    await tick(ctx);
    expect(ctx.mailer.sent[0]?.to).toBe('ravi@example.com');
    expect(tokenFrom(ctx.mailer.sent[0]!.text, 'I took it')).toBeTruthy();
    expect(carerId).toBeTruthy();
  });

  it('skips demo circles', async () => {
    const demoCtx = buildContext();
    await agent(demoCtx).post('/api/demo').expect(201);
    const [id] = await demoCtx.repo.listAllCircleIds();
    for (const m of await demoCtx.repo.listMembers(id!))
      await demoCtx.repo.updateMember(id!, m.id, { email: `${m.id}@example.com` });
    const res = await tick(demoCtx);
    expect(res.body.sent).toBe(0);
    const digest = await request(demoCtx.app)
      .post('/api/internal/digest')
      .set('Authorization', `Bearer ${TICK_SECRET}`)
      .expect(200);
    expect(digest.body.sent).toBe(0);
  });

  it('emails a weekly digest to everyone reachable, once per day', async () => {
    const run = () =>
      request(ctx.app).post('/api/internal/digest').set('Authorization', `Bearer ${TICK_SECRET}`).expect(200);
    const res = await run();
    expect(res.body.sent).toBe(3);
    expect(ctx.mailer.sent[0]?.subject).toBe('This week with Kamla Devi');
    expect((await run()).body.sent).toBe(0);
  });

  it('skips the digest for circles with nobody reachable', async () => {
    const quiet = buildContext();
    await createCircle(quiet, null);
    const res = await request(quiet.app)
      .post('/api/internal/digest')
      .set('Authorization', `Bearer ${TICK_SECRET}`)
      .expect(200);
    expect(res.body.sent).toBe(0);
  });
});

describe('one-tap email links', () => {
  let ctx: TestContext;
  let take: string;
  let skip: string;
  let circleId: string;
  let elderId: string;

  beforeEach(async () => {
    ctx = buildContext();
    const created = await createCircle(ctx);
    circleId = created.circleId;
    elderId = created.elderId;
    await created.elder
      .post('/api/medications')
      .send(medication({ times: ['12:05'], stock: 5 }))
      .expect(201);
    await tick(ctx);
    const email = ctx.mailer.sent[0]!;
    take = tokenFrom(email.text, 'I took it');
    skip = tokenFrom(email.text, 'Skip');
  });

  const api = () => request(ctx.app);

  it('previews without acting, then records the dose once', async () => {
    const preview = await api().post('/api/act/preview').send({ token: take }).expect(200);
    expect(preview.body).toMatchObject({
      action: 'take',
      medName: 'Amlodipine',
      localTime: '12:05',
      status: 'pending',
    });
    await api().post('/api/act/preview').send({ token: take }).expect(200);

    const done = await api().post('/api/act').send({ token: take }).expect(200);
    expect(done.body).toMatchObject({ status: 'taken', via: 'email', actedBy: elderId });
    const reused = await api().post('/api/act').send({ token: take }).expect(409);
    expect(reused.body.error.message).toMatch(/already been used/);
    expect((await ctx.repo.listMedications(circleId))[0]?.stock).toBe(4);
  });

  it('supports skip links', async () => {
    const done = await api().post('/api/act').send({ token: skip }).expect(200);
    expect(done.body.status).toBe('skipped');
  });

  it('rejects expired and tampered links', async () => {
    const tampered = `${take.slice(0, -2)}${take.endsWith('A') ? 'BB' : 'AA'}`;
    await api().post('/api/act/preview').send({ token: tampered }).expect(401);
    await api().post('/api/act/preview').send({ token: 'abc' }).expect(400);
    ctx.clock.advanceMinutes(13 * 60);
    const expired = await api().post('/api/act/preview').send({ token: take }).expect(401);
    expect(expired.body.error.message).toMatch(/expired/);
  });

  it('rejects links for removed members or deleted doses', async () => {
    const elderMember = (await ctx.repo.listMembers(circleId))[0]!;
    await ctx.repo.deleteMember(circleId, elderMember.id);
    await api().post('/api/act').send({ token: take }).expect(401);
    const med = (await ctx.repo.listMedications(circleId))[0]!;
    await ctx.repo.deletePendingDosesAfter(med.id, 0);
    await api().post('/api/act/preview').send({ token: skip }).expect(404);
  });
});
