import { beforeEach, describe, expect, it } from 'vitest';
import { agent, buildContext, createCircle, joinAs, medication, type TestContext } from './helpers';

type Agent = ReturnType<typeof agent>;
interface DoseBody {
  id: string;
  status: string;
  actedBy: string | null;
  actedByName: string | null;
  via: string | null;
  localTime: string;
}

describe('doses', () => {
  let ctx: TestContext;
  let elder: Agent;
  let family: Agent;
  let carer: Agent;
  let carerId: string;
  let circleId: string;
  let medId: string;

  beforeEach(async () => {
    ctx = buildContext();
    const created = await createCircle(ctx);
    elder = created.elder;
    circleId = created.circleId;
    family = (await joinAs(ctx, created.code, 'family', 'Priya')).member;
    const c = await joinAs(ctx, created.code, 'caretaker', 'Ravi');
    carer = c.member;
    carerId = c.memberId;
    medId = (
      await elder
        .post('/api/medications')
        .send(medication({ times: ['14:00', '20:00'], stock: 10 }))
        .expect(201)
    ).body.id;
  });

  const doses = async (): Promise<DoseBody[]> =>
    (await elder.get('/api/today').expect(200)).body.doses as DoseBody[];
  const stock = async () => (await ctx.repo.getMedication(circleId, medId))?.stock;

  it('takes a dose, lowers stock, and undoes it', async () => {
    const [first] = await doses();
    const taken = await elder.post(`/api/doses/${first!.id}/take`).expect(200);
    expect(taken.body).toMatchObject({ status: 'taken', via: 'app', actedByName: 'Kamla Devi' });
    expect(await stock()).toBe(9);
    // Repeating is a no-op.
    await elder.post(`/api/doses/${first!.id}/take`).expect(200);
    expect(await stock()).toBe(9);

    const undone = await elder.post(`/api/doses/${first!.id}/undo`).expect(200);
    expect(undone.body).toMatchObject({ status: 'pending', actedBy: null });
    expect(await stock()).toBe(10);
    await elder.post(`/api/doses/${first!.id}/undo`).expect(200);
  });

  it('skips a dose without changing stock, and switching from taken to skipped restores stock', async () => {
    const [first] = await doses();
    await elder.post(`/api/doses/${first!.id}/take`).expect(200);
    const skipped = await elder.post(`/api/doses/${first!.id}/skip`).expect(200);
    expect(skipped.body.status).toBe('skipped');
    expect(await stock()).toBe(10);
    await elder.post(`/api/doses/${first!.id}/undo`).expect(200);
    expect(await stock()).toBe(10);
  });

  it('records caretaker doses as theirs and limits who can undo', async () => {
    const [first, second] = await doses();
    const taken = await carer.post(`/api/doses/${first!.id}/take`).expect(200);
    expect(taken.body).toMatchObject({ actedBy: carerId, actedByName: 'Ravi' });
    await elder.post(`/api/doses/${second!.id}/take`).expect(200);
    const res = await carer.post(`/api/doses/${second!.id}/undo`).expect(403);
    expect(res.body.error.message).toMatch(/undo/);
    await elder.post(`/api/doses/${first!.id}/undo`).expect(200);
  });

  it('does not let family record doses', async () => {
    const [first] = await doses();
    await family.post(`/api/doses/${first!.id}/take`).expect(403);
  });

  it('refuses doses far in the future and doses of other circles', async () => {
    const [first] = await doses();
    const future = (await ctx.repo.listDosesForCircle(circleId, 0, Number.MAX_SAFE_INTEGER)).find(
      (d) => d.localDate === '2026-11-17',
    );
    expect(future).toBeDefined();
    await elder.post(`/api/doses/${future!.id}/take`).expect(409);

    const other = await createCircle(ctx);
    await other.elder.post(`/api/doses/${first!.id}/take`).expect(404);
    await elder.post('/api/doses/nope/take').expect(404);
  });

  it('does not take stock below zero', async () => {
    await ctx.repo.saveMedication({ ...(await ctx.repo.getMedication(circleId, medId))!, stock: 0 });
    const [first] = await doses();
    await elder.post(`/api/doses/${first!.id}/take`).expect(200);
    expect(await stock()).toBe(0);
  });

  it('shows low stock on Today and reports adherence', async () => {
    await ctx.repo.saveMedication({ ...(await ctx.repo.getMedication(circleId, medId))!, stock: 3 });
    const today = await elder.get('/api/today').expect(200);
    expect(today.body.lowStock).toEqual([{ medId, medName: 'Amlodipine', daysLeft: 1 }]);
    expect(today.body.date).toBe('2026-11-15');

    const [first] = await doses();
    await elder.post(`/api/doses/${first!.id}/take`).expect(200);
    const week = await elder.get('/api/adherence?days=7').expect(200);
    expect(week.body.byDay).toHaveLength(7);
    expect(week.body.overall.taken).toBe(1);
    expect((await elder.get('/api/adherence?days=30').expect(200)).body.byDay).toHaveLength(30);
    await elder.get('/api/adherence?days=3').expect(400);
  });
});

describe('appointments', () => {
  let ctx: TestContext;
  let elder: Agent;
  let family: Agent;
  let familyId: string;

  beforeEach(async () => {
    ctx = buildContext();
    const created = await createCircle(ctx);
    elder = created.elder;
    const j = await joinAs(ctx, created.code, 'family', 'Priya');
    family = j.member;
    familyId = j.memberId;
  });

  const appt = {
    doctor: 'Dr. Mehta',
    speciality: 'Cardiology',
    place: 'Apollo',
    date: '2026-11-17',
    time: '11:00',
    notes: '',
  };

  it('creates, lists, updates and deletes', async () => {
    const created = await family.post('/api/appointments').send(appt).expect(201);
    expect(created.body.at).toBe(Date.UTC(2026, 10, 17, 5, 30));
    const list = await elder.get('/api/appointments').expect(200);
    expect(list.body.items).toHaveLength(1);
    const today = await elder.get('/api/today').expect(200);
    expect(today.body.nextAppointment.doctor).toBe('Dr. Mehta');

    const updated = await elder
      .put(`/api/appointments/${created.body.id}`)
      .send({ ...appt, time: '12:00' })
      .expect(200);
    expect(updated.body.at).toBe(Date.UTC(2026, 10, 17, 6, 30));
    await elder.delete(`/api/appointments/${created.body.id}`).expect(204);
    await elder.delete(`/api/appointments/${created.body.id}`).expect(404);
  });

  it('blocks view-only members and caps the total', async () => {
    await elder.patch(`/api/circle/members/${familyId}`).send({ permission: 'view' }).expect(204);
    await family.post('/api/appointments').send(appt).expect(403);
    const first = (await elder.post('/api/appointments').send(appt).expect(201)).body;
    for (let i = 0; i < 99; i += 1) await ctx.repo.saveAppointment({ ...first, id: `a${i}` });
    await elder.post('/api/appointments').send(appt).expect(409);
  });
});

describe('circle management', () => {
  let ctx: TestContext;
  let elder: Agent;
  let family: Agent;
  let familyId: string;
  let elderId: string;
  let circleId: string;

  beforeEach(async () => {
    ctx = buildContext();
    const created = await createCircle(ctx);
    elder = created.elder;
    elderId = created.elderId;
    circleId = created.circleId;
    const j = await joinAs(ctx, created.code, 'family', 'Priya');
    family = j.member;
    familyId = j.memberId;
  });

  it('lists members without credentials', async () => {
    const res = await family.get('/api/circle').expect(200);
    expect(res.body.members).toHaveLength(2);
    expect(res.body.members[0]).not.toHaveProperty('passcodeHash');
  });

  it('lets only the elder change settings, and rebuilds doses on a time-zone change', async () => {
    await elder
      .post('/api/medications')
      .send(medication({ times: ['23:00'] }))
      .expect(201);
    await family.patch('/api/circle').send({ language: 'hi' }).expect(403);
    const res = await elder.patch('/api/circle').send({ language: 'hi', timezone: 'UTC' }).expect(200);
    expect(res.body.circle).toMatchObject({ language: 'hi', timezone: 'UTC' });
    const today = await elder.get('/api/today').expect(200);
    expect(today.body.doses[0].dueAt).toBe(Date.UTC(2026, 10, 15, 23, 0));
    await elder.patch('/api/circle').send({ elderName: 'Kamla D' }).expect(200);
  });

  it('changes access and removes members, never the elder', async () => {
    await family.patch(`/api/circle/members/${elderId}`).send({ permission: 'view' }).expect(403);
    await elder.patch(`/api/circle/members/${elderId}`).send({ permission: 'view' }).expect(403);
    await elder.patch('/api/circle/members/missing').send({ permission: 'view' }).expect(404);
    await elder.patch(`/api/circle/members/${familyId}`).send({ permission: 'admin' }).expect(400);
    await elder.patch(`/api/circle/members/${familyId}`).send({ permission: 'view' }).expect(204);
    expect((await ctx.repo.getMember(circleId, familyId))?.permission).toBe('view');
    await elder.delete(`/api/circle/members/${familyId}`).expect(204);
    await family.get('/api/me').expect(401);
  });

  it('updates the profile and sends a test email', async () => {
    await family.post('/api/me/test-email').expect(400);
    const res = await family
      .patch('/api/me')
      .send({ email: 'Priya@Example.com', notify: false, name: 'Priya S' })
      .expect(200);
    expect(res.body.member).toMatchObject({ email: 'priya@example.com', notify: false, name: 'Priya S' });
    await family.post('/api/me/test-email').expect(202);
    expect(ctx.mailer.sent.at(-1)).toMatchObject({
      to: 'priya@example.com',
      subject: 'Saanjh reminders are working',
    });
  });

  it('logs activity, newest first', async () => {
    ctx.clock.advanceMinutes(1);
    await elder.post('/api/medications').send(medication()).expect(201);
    const res = await family.get('/api/activity').expect(200);
    const actions = (res.body.items as { action: string }[]).map((i) => i.action);
    expect(actions[0]).toBe('med.created');
    expect(actions).toEqual(expect.arrayContaining(['circle.created', 'member.joined']));
  });

  it('refuses to switch members outside a demo circle', async () => {
    await elder.post(`/api/demo/switch/${familyId}`).expect(403);
  });
});

describe('demo circle', () => {
  it('creates a populated demo and switches between members', async () => {
    const ctx = buildContext();
    const demo = agent(ctx);
    const res = await demo.post('/api/demo').expect(201);
    expect(res.body).toMatchObject({ passcode: '246810', circle: { demo: true, elderName: 'Kamla Devi' } });
    expect(res.body.code).toBe(res.body.circle.code);

    const today = await demo.get('/api/today').expect(200);
    expect(today.body.proposals).toHaveLength(1);
    expect((today.body.lowStock as { medName: string }[]).map((l) => l.medName)).toContain('Atorvastatin');
    expect(today.body.nextAppointment.doctor).toBe('Dr. Anil Mehta');

    const week = await demo.get('/api/adherence?days=7').expect(200);
    expect(week.body.overall.missed).toBeGreaterThan(0);
    expect(week.body.overall.taken).toBeGreaterThan(10);

    const circle = await demo.get('/api/circle').expect(200);
    const priya = (circle.body.members as { id: string; name: string }[]).find((m) => m.name === 'Priya')!;
    const switched = await demo.post(`/api/demo/switch/${priya.id}`).expect(200);
    expect(switched.body.member.name).toBe('Priya');
    expect((await demo.get('/api/me').expect(200)).body.member.role).toBe('family');
    await demo.post('/api/demo/switch/nobody').expect(404);
  });
});
