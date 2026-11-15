import { describe, expect, it } from 'vitest';
import { agent, buildContext, createCircle, joinAs, PASSCODE } from './helpers';

describe('circles and sign-in', () => {
  it('creates a circle, sets an HttpOnly session cookie and returns no credentials', async () => {
    const ctx = buildContext();
    const res = await agent(ctx)
      .post('/api/circles')
      .send({ elderName: 'Kamla', timezone: 'Asia/Kolkata', email: '', passcode: PASSCODE })
      .expect(201);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/saanjh_session=.+HttpOnly; SameSite=Strict/);
    expect(cookie).not.toContain('Secure');
    expect(res.body.circle.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(res.body.circle).not.toHaveProperty('materialisedThrough');
    expect(res.body.member).toMatchObject({ role: 'elder', permission: 'manage', email: null });
    expect(res.body.member).not.toHaveProperty('passcodeHash');
    expect(res.body.member).not.toHaveProperty('failedAttempts');
  });

  it('marks cookies Secure when configured', async () => {
    const ctx = buildContext({ secureCookies: true });
    const res = await agent(ctx)
      .post('/api/circles')
      .send({ elderName: 'Kamla', timezone: 'Asia/Kolkata', passcode: PASSCODE })
      .expect(201);
    expect(String(res.headers['set-cookie'])).toContain('Secure');
  });

  it('rejects invalid input with field messages', async () => {
    const ctx = buildContext();
    const res = await agent(ctx)
      .post('/api/circles')
      .send({ elderName: '', timezone: 'Nope/Zone', passcode: '12' })
      .expect(400);
    expect(res.body.error.code).toBe('invalid_input');
    expect(Object.keys(res.body.error.fields)).toEqual(
      expect.arrayContaining(['elderName', 'timezone', 'passcode']),
    );
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('requires a session for private routes', async () => {
    const ctx = buildContext();
    const res = await agent(ctx).get('/api/me').expect(401);
    expect(res.body.error.code).toBe('unauthenticated');
    await agent(ctx).get('/api/me').set('Cookie', 'saanjh_session=garbage').expect(401);
  });

  it('looks up, joins and signs in', async () => {
    const ctx = buildContext();
    const { elder, code, elderId } = await createCircle(ctx);
    const me = await elder.get('/api/me').expect(200);
    expect(me.body.member.id).toBe(elderId);

    const { member: priya } = await joinAs(ctx, code, 'family', 'Priya', 'priya@example.com');
    expect((await priya.get('/api/me').expect(200)).body.member).toMatchObject({
      name: 'Priya',
      role: 'family',
      permission: 'manage',
    });

    const lookup = await agent(ctx)
      .post('/api/auth/lookup')
      .send({ code: `${code.slice(0, 4)}-${code.slice(4)}` })
      .expect(200);
    expect(lookup.body.elderName).toBe('Kamla Devi');
    expect((lookup.body.members as { name: string }[]).map((m) => m.name)).toEqual(['Kamla Devi', 'Priya']);
    expect(lookup.body.members[0]).not.toHaveProperty('email');

    const fresh = agent(ctx);
    await fresh.post('/api/auth/login').send({ code, memberId: elderId, passcode: PASSCODE }).expect(200);
    await fresh.get('/api/me').expect(200);
    await fresh.post('/api/auth/logout').expect(204);
    await fresh.get('/api/me').expect(401);
  });

  it('returns 404 for an unknown circle code', async () => {
    const ctx = buildContext();
    await agent(ctx).post('/api/auth/lookup').send({ code: 'ABCDEFGH' }).expect(404);
    await agent(ctx)
      .post('/api/auth/join')
      .send({ code: 'ABCDEFGH', name: 'P', role: 'family', passcode: PASSCODE })
      .expect(404);
  });

  it('gives the same error for an unknown member and a wrong passcode, then locks out', async () => {
    const ctx = buildContext();
    const { code, elderId } = await createCircle(ctx);
    const unknown = await agent(ctx)
      .post('/api/auth/login')
      .send({ code, memberId: 'nobody', passcode: PASSCODE })
      .expect(401);
    const badCircle = await agent(ctx)
      .post('/api/auth/login')
      .send({ code: 'ABCDEFGH', memberId: elderId, passcode: PASSCODE })
      .expect(401);
    const wrong = await agent(ctx)
      .post('/api/auth/login')
      .send({ code, memberId: elderId, passcode: '000000' })
      .expect(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(badCircle.body.error.message).toBe(wrong.body.error.message);

    for (let i = 0; i < 4; i += 1) {
      await agent(ctx)
        .post('/api/auth/login')
        .send({ code, memberId: elderId, passcode: '000000' })
        .expect(401);
    }
    // Five wrong attempts: even the right passcode is refused while locked.
    ctx.clock.advanceMinutes(1);
    const locked = await agent(ctx)
      .post('/api/auth/login')
      .send({ code, memberId: elderId, passcode: PASSCODE })
      .expect(423);
    expect(locked.body.error.code).toBe('locked');

    ctx.clock.advanceMinutes(16);
    await agent(ctx)
      .post('/api/auth/login')
      .send({ code, memberId: elderId, passcode: PASSCODE })
      .expect(200);
  });

  it('resets the failure count after a successful sign-in', async () => {
    const ctx = buildContext();
    const { code, elderId } = await createCircle(ctx);
    await agent(ctx)
      .post('/api/auth/login')
      .send({ code, memberId: elderId, passcode: '000000' })
      .expect(401);
    await agent(ctx)
      .post('/api/auth/login')
      .send({ code, memberId: elderId, passcode: PASSCODE })
      .expect(200);
    const member = await ctx.repo.getMember((await ctx.repo.findCircleByCode(code))!.id, elderId);
    expect(member?.failedAttempts).toBe(0);
  });

  it('refuses to join a full circle', async () => {
    const ctx = buildContext();
    const { code, circleId } = await createCircle(ctx);
    const circle = (await ctx.repo.getCircle(circleId))!;
    const template = (await ctx.repo.listMembers(circleId))[0]!;
    for (let i = 0; i < 11; i += 1) {
      await ctx.repo.createMember({ ...template, id: `m${i}`, role: 'family', createdAt: i + 1 });
    }
    expect(circle.id).toBe(circleId);
    const res = await agent(ctx)
      .post('/api/auth/join')
      .send({ code, name: 'Late', role: 'family', passcode: PASSCODE })
      .expect(409);
    expect(res.body.error.message).toMatch(/full/);
  });

  it('signs out a session whose member was removed', async () => {
    const ctx = buildContext();
    const { code, circleId } = await createCircle(ctx);
    const { member, memberId } = await joinAs(ctx, code, 'caretaker', 'Ravi');
    await ctx.repo.deleteMember(circleId, memberId);
    await member.get('/api/me').expect(401);
  });
});
