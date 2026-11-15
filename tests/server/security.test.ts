import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../../server/adapters/memory/repository';
import { createApp } from '../../server/app';
import { actorOf, rateLimit } from '../../server/middleware';
import { agent, buildContext, createCircle, PASSCODE } from './helpers';

describe('HTTP hardening', () => {
  it('serves health checks and strict security headers', async () => {
    const ctx = buildContext();
    const res = await request(ctx.app).get('/healthz').expect(200);
    expect(res.body).toEqual({ ok: true });
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('adds HSTS and upgrade-insecure-requests in production', async () => {
    const ctx = buildContext();
    const app = createApp(ctx.deps, { isProduction: true });
    const res = await request(app).get('/healthz').expect(200);
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(String(res.headers['content-security-policy'])).toContain('upgrade-insecure-requests');
  });

  it('echoes a valid request id and replaces an invalid one', async () => {
    const ctx = buildContext();
    const echoed = await request(ctx.app).get('/healthz').set('X-Request-Id', 'abc12345-req').expect(200);
    expect(echoed.headers['x-request-id']).toBe('abc12345-req');
    const replaced = await request(ctx.app).get('/healthz').set('X-Request-Id', 'bad id!').expect(200);
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('never caches API responses', async () => {
    const ctx = buildContext();
    const res = await request(ctx.app).get('/api/me').expect(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('blocks cross-site writes but allows same-origin ones', async () => {
    const ctx = buildContext();
    const body = { elderName: 'K', timezone: 'UTC', passcode: PASSCODE };
    const blocked = await request(ctx.app)
      .post('/api/circles')
      .set('Origin', 'https://evil.example')
      .send(body)
      .expect(403);
    expect(blocked.body.error.message).toMatch(/Cross-site/);
    await request(ctx.app).post('/api/circles').set('Origin', 'not a url').send(body).expect(403);
    await request(ctx.app)
      .post('/api/circles')
      .set('Host', 'saanjh.test')
      .set('Origin', 'https://saanjh.test')
      .send(body)
      .expect(201);
  });

  it('rejects oversized and malformed bodies', async () => {
    const ctx = buildContext();
    const big = await request(ctx.app)
      .post('/api/circles')
      .send({ elderName: 'x'.repeat(20_000) })
      .expect(413);
    expect(big.body.error.code).toBe('payload_too_large');
    const bad = await request(ctx.app)
      .post('/api/circles')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);
    expect(bad.body.error.code).toBe('invalid_input');
  });

  it('rate-limits sign-in attempts per client', async () => {
    const ctx = buildContext();
    for (let i = 0; i < 10; i += 1) {
      await request(ctx.app)
        .post('/api/auth/lookup')
        .set('X-Forwarded-For', '203.0.113.9')
        .send({ code: 'ABCDEFGH' })
        .expect(404);
    }
    const limited = await request(ctx.app)
      .post('/api/auth/lookup')
      .set('X-Forwarded-For', '203.0.113.9')
      .send({ code: 'ABCDEFGH' })
      .expect(429);
    expect(limited.headers['retry-after']).toBe('60');
    expect(limited.headers['ratelimit-remaining']).toBe('0');
    await request(ctx.app)
      .post('/api/auth/lookup')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ code: 'ABCDEFGH' })
      .expect(404);
    ctx.clock.advanceMinutes(1);
    await request(ctx.app)
      .post('/api/auth/lookup')
      .set('X-Forwarded-For', '203.0.113.9')
      .send({ code: 'ABCDEFGH' })
      .expect(404);
  });

  it('returns 404 for unknown API routes when signed in', async () => {
    const ctx = buildContext();
    const { elder } = await createCircle(ctx);
    const res = await elder.get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('hides internal errors behind a generic message and logs them', async () => {
    class BrokenRepo extends MemoryRepository {
      override listActivity(): Promise<never> {
        return Promise.reject(new Error('database exploded'));
      }
    }
    const error = vi.fn();
    const ctx = buildContext({ repo: new BrokenRepo(), logger: { info: vi.fn(), warn: vi.fn(), error } });
    const elder = agent(ctx);
    await elder
      .post('/api/circles')
      .send({ elderName: 'K', timezone: 'UTC', passcode: PASSCODE })
      .expect(201);
    const res = await elder.get('/api/activity').expect(500);
    expect(res.body.error).toMatchObject({
      code: 'internal',
      message: 'Something went wrong. Please try again.',
    });
    expect(JSON.stringify(res.body)).not.toContain('exploded');
    expect(error).toHaveBeenCalledWith('unhandled error', expect.objectContaining({ path: '/api/activity' }));
  });

  it('serves the web client with long-lived assets and an SPA fallback', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'saanjh-static-'));
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Saanjh</title>');
    writeFileSync(path.join(dir, 'assets', 'app-123.js'), 'console.log(1)');
    writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *');
    const ctx = buildContext();
    const app = createApp(ctx.deps, { staticDir: dir });

    const page = await request(app).get('/today').expect(200);
    expect(page.text).toContain('<title>Saanjh</title>');
    expect(page.headers['cache-control']).toBe('no-cache');
    const asset = await request(app).get('/assets/app-123.js').expect(200);
    expect(asset.headers['cache-control']).toContain('immutable');
    await request(app).get('/robots.txt').expect(200);
    await request(app).post('/somewhere').expect(404);
    // API routes are never swallowed by the SPA fallback.
    await request(app).get('/api/me').expect(401);
  });

  it('ignores a static directory that does not exist', async () => {
    const ctx = buildContext();
    const app = createApp(ctx.deps, { staticDir: '/definitely/not/here' });
    await request(app).get('/today').expect(404);
  });
});

describe('middleware units', () => {
  it('actorOf throws without an authenticated actor', () => {
    expect(() => actorOf({} as never)).toThrow('Please sign in');
  });

  it('rateLimit evicts expired windows when the table grows large', () => {
    let now = 0;
    const limiter = rateLimit('t', 1, 1000, () => now);
    const res = { setHeader: vi.fn() };
    const next = vi.fn();
    for (let i = 0; i < 10_002; i += 1) limiter({ ip: `ip${i}` } as never, res as never, next);
    now = 5000;
    limiter({ ip: 'fresh' } as never, res as never, next);
    expect(next).toHaveBeenLastCalledWith();
    limiter({ ip: undefined } as never, res as never, next);
    expect(next).toHaveBeenCalledTimes(10_004);
  });
});
