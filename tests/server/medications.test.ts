import { beforeEach, describe, expect, it } from 'vitest';
import type { agent } from './helpers';
import { buildContext, createCircle, joinAs, medication, type TestContext } from './helpers';

type Agent = ReturnType<typeof agent>;

describe('medications and proposals', () => {
  let ctx: TestContext;
  let elder: Agent;
  let family: Agent;
  let familyId: string;
  let circleId: string;

  beforeEach(async () => {
    ctx = buildContext();
    const created = await createCircle(ctx);
    elder = created.elder;
    circleId = created.circleId;
    const joined = await joinAs(ctx, created.code, 'family', 'Priya');
    family = joined.member;
    familyId = joined.memberId;
  });

  const todayDoses = async (who: Agent) =>
    (await who.get('/api/today').expect(200)).body.doses as { medId: string; localTime: string }[];

  it('lets the elder add a medication directly, creating future doses', async () => {
    const res = await elder
      .post('/api/medications')
      .send(medication({ times: ['08:00', '14:00'] }))
      .expect(201);
    expect(res.body).toMatchObject({ status: 'active', pending: null });
    // 08:00 has passed at noon, so only the 14:00 dose is created today.
    expect((await todayDoses(elder)).map((d) => d.localTime)).toEqual(['14:00']);
    const list = await family.get('/api/medications').expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it('turns a family addition into a proposal the elder approves', async () => {
    const res = await family
      .post('/api/medications')
      .send(medication({ name: 'Calcium' }))
      .expect(201);
    expect(res.body.status).toBe('proposed');
    expect(res.body.pending).toMatchObject({ action: 'create', byName: 'Priya', by: familyId });
    expect(await todayDoses(elder)).toHaveLength(0);
    const today = await elder.get('/api/today').expect(200);
    expect(today.body.proposals).toHaveLength(1);

    await family.post(`/api/medications/${res.body.id}/approve`).expect(403);
    const approved = await elder.post(`/api/medications/${res.body.id}/approve`).expect(200);
    expect(approved.body.medication).toMatchObject({ status: 'active', pending: null });
    expect(await todayDoses(elder)).toHaveLength(1);
    await elder.post(`/api/medications/${res.body.id}/approve`).expect(409);
  });

  it('removes a declined new medication', async () => {
    const res = await family.post('/api/medications').send(medication()).expect(201);
    const rejected = await elder.post(`/api/medications/${res.body.id}/reject`).expect(200);
    expect(rejected.body.medication).toBeNull();
    expect((await elder.get('/api/medications')).body.items).toHaveLength(0);
    await elder.post(`/api/medications/${res.body.id}/reject`).expect(404);
  });

  it('proposes, approves and rejects edits', async () => {
    const med = (await elder.post('/api/medications').send(medication()).expect(201)).body;
    const proposed = await family
      .put(`/api/medications/${med.id}`)
      .send(medication({ times: ['16:00'] }))
      .expect(200);
    expect(proposed.body.pending).toMatchObject({ action: 'update' });
    expect(proposed.body.times).toEqual(['14:00']);

    await elder.post(`/api/medications/${med.id}/approve`).expect(200);
    expect((await todayDoses(elder)).map((d) => d.localTime)).toEqual(['16:00']);

    await family
      .put(`/api/medications/${med.id}`)
      .send(medication({ times: ['18:00'] }))
      .expect(200);
    const rejected = await elder.post(`/api/medications/${med.id}/reject`).expect(200);
    expect(rejected.body.medication).toMatchObject({ pending: null, times: ['16:00'] });
    await elder.post(`/api/medications/${med.id}/reject`).expect(409);
  });

  it('lets the elder edit directly and reschedules doses', async () => {
    const med = (await elder.post('/api/medications').send(medication()).expect(201)).body;
    const updated = await elder
      .put(`/api/medications/${med.id}`)
      .send(medication({ name: 'Amlodipine XL', times: ['15:00'] }))
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Amlodipine XL', pending: null });
    expect((await todayDoses(elder)).map((d) => d.localTime)).toEqual(['15:00']);
  });

  it('lets a proposer edit their own unapproved medication directly', async () => {
    const med = (await family.post('/api/medications').send(medication()).expect(201)).body;
    const edited = await family
      .put(`/api/medications/${med.id}`)
      .send(medication({ dose: '10 mg' }))
      .expect(200);
    expect(edited.body).toMatchObject({ status: 'proposed', dose: '10 mg' });
  });

  it('pauses and resumes via proposals and directly', async () => {
    const med = (await elder.post('/api/medications').send(medication()).expect(201)).body;
    const pauseProposal = await family.post(`/api/medications/${med.id}/pause`).expect(200);
    expect(pauseProposal.body.pending.action).toBe('pause');
    await elder.post(`/api/medications/${med.id}/approve`).expect(200);
    expect((await ctx.repo.getMedication(circleId, med.id))?.status).toBe('paused');
    expect(await todayDoses(elder)).toHaveLength(0);

    await family.post(`/api/medications/${med.id}/resume`).expect(200);
    await elder.post(`/api/medications/${med.id}/approve`).expect(200);
    expect((await ctx.repo.getMedication(circleId, med.id))?.status).toBe('active');
    expect(await todayDoses(elder)).toHaveLength(1);

    const paused = await elder.post(`/api/medications/${med.id}/pause`).expect(200);
    expect(paused.body.status).toBe('paused');
    const resumed = await elder.post(`/api/medications/${med.id}/resume`).expect(200);
    expect(resumed.body.status).toBe('active');
  });

  it('refuses to pause a medication that is still a proposal', async () => {
    const med = (await family.post('/api/medications').send(medication()).expect(201)).body;
    await elder.post(`/api/medications/${med.id}/pause`).expect(409);
  });

  it('proposes and approves deletion, keeping past history', async () => {
    const med = (await elder.post('/api/medications').send(medication()).expect(201)).body;
    const proposal = await family.delete(`/api/medications/${med.id}`).expect(202);
    expect(proposal.body.pending.action).toBe('delete');
    await elder.post(`/api/medications/${med.id}/approve`).expect(200);
    expect(await ctx.repo.getMedication(circleId, med.id)).toBeNull();
    expect(await todayDoses(elder)).toHaveLength(0);
  });

  it('lets the elder delete directly and a proposer withdraw their own proposal', async () => {
    const mine = (await elder.post('/api/medications').send(medication()).expect(201)).body;
    await elder.delete(`/api/medications/${mine.id}`).expect(204);
    const theirs = (
      await family
        .post('/api/medications')
        .send(medication({ name: 'Calcium' }))
        .expect(201)
    ).body;
    await family.delete(`/api/medications/${theirs.id}`).expect(204);
    expect((await elder.get('/api/medications')).body.items).toHaveLength(0);
  });

  it('applies family changes directly when approval is turned off', async () => {
    await elder.patch('/api/circle').send({ requireElderApproval: false }).expect(200);
    const res = await family.post('/api/medications').send(medication()).expect(201);
    expect(res.body.status).toBe('active');
  });

  it('blocks view-only members from changes', async () => {
    await elder.patch(`/api/circle/members/${familyId}`).send({ permission: 'view' }).expect(204);
    const res = await family.post('/api/medications').send(medication()).expect(403);
    expect(res.body.error.code).toBe('forbidden');
    await family.get('/api/medications').expect(200);
  });

  it('caps the number of medications', async () => {
    const template = (await elder.post('/api/medications').send(medication()).expect(201)).body;
    const stored = (await ctx.repo.getMedication(circleId, template.id))!;
    for (let i = 0; i < 39; i += 1) await ctx.repo.saveMedication({ ...stored, id: `extra${i}` });
    await elder.post('/api/medications').send(medication()).expect(409);
  });

  it('returns 404 for medications in other circles and rejects bad ids', async () => {
    const other = await createCircle(ctx);
    const theirs = (await other.elder.post('/api/medications').send(medication()).expect(201)).body;
    await elder.put(`/api/medications/${theirs.id}`).send(medication()).expect(404);
    await elder.post('/api/medications/bad$id/pause').expect(400);
  });
});
