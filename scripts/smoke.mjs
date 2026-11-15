#!/usr/bin/env node
/**
 * End-to-end smoke test against a running Saanjh server.
 * Usage: node scripts/smoke.mjs https://your-service.run.app
 * Creates a demo circle, then checks the main flows and security headers.
 */
const base = (process.argv[2] ?? 'http://localhost:8080').replace(/\/$/, '');
let cookie = '';
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, json, text };
}

function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition || !detail ? '' : `  (${detail})`}`);
  if (!condition) failures += 1;
}

const health = await call('GET', '/healthz');
check('health check', health.res.status === 200 && health.json?.ok === true);

const home = await call('GET', '/');
check('web app served', home.res.status === 200 && home.text.includes('<div id="root">'));
const csp = home.res.headers.get('content-security-policy') ?? '';
check('strict CSP', csp.includes("script-src 'self'") && !csp.includes('unsafe-inline'));
check('frame protection', (home.res.headers.get('x-frame-options') ?? '') !== '');
check('nosniff', home.res.headers.get('x-content-type-options') === 'nosniff');

const anon = await call('GET', '/api/today');
check('API requires sign-in', anon.res.status === 401);

const demo = await call('POST', '/api/demo', {});
check(
  'demo circle created',
  demo.res.status === 201 && Boolean(demo.json?.circle?.code),
  String(demo.res.status),
);

const today = await call('GET', '/api/today');
check('today loads', today.res.status === 200 && Array.isArray(today.json?.doses));
check('proposal waiting for elder', (today.json?.proposals?.length ?? 0) >= 1);

const meds = await call('GET', '/api/medications');
check('medications listed', (meds.json?.items?.length ?? 0) >= 4);

const pending = today.json?.doses?.find((d) => d.status === 'pending' || d.status === 'missed');
if (pending) {
  const taken = await call('POST', `/api/doses/${pending.id}/take`, {});
  check('dose marked taken', taken.res.status === 200 && taken.json?.status === 'taken');
  const undo = await call('POST', `/api/doses/${pending.id}/undo`, {});
  check('dose undo', undo.res.status === 200);
}

const adherence = await call('GET', '/api/adherence?days=7');
check('adherence computed', typeof adherence.json?.overall?.taken === 'number');

const safety = await call('POST', '/api/ai/safety-check', {});
check('safety check answers', safety.res.status === 200 && Array.isArray(safety.json?.cautions));

const crossSite = await fetch(`${base}/api/medications`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie },
  body: '{}',
});
check('cross-site write blocked', crossSite.status === 403);

const tick = await call('POST', '/api/internal/tick', {});
check('reminder trigger rejects anonymous calls', tick.res.status === 403);

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
