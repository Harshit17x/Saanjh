import { createHmac } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../../server/adapters/memory/repository';
import { loadConfig } from '../../server/config';
import {
  appointmentEmail,
  digestEmail,
  doseReminderEmail,
  escapeHtml,
  lowStockEmail,
  missedDoseEmail,
  testEmail,
} from '../../server/email/templates';
import { AppError } from '../../server/errors';
import { jsonLogger } from '../../server/logger';
import { systemClock } from '../../server/ports/services';
import { ActionLinkSigner, LINK_TTL_MS } from '../../server/security/actionLinks';
import { newCircleCode, newId } from '../../server/security/ids';
import { hashPasscode, verifyPasscode } from '../../server/security/passcode';
import {
  clearedSessionCookie,
  readCookie,
  SESSION_TTL_SECONDS,
  sessionCookie,
  SessionSigner,
} from '../../server/security/session';
import { denyAllVerifier, sharedSecretVerifier } from '../../server/security/trigger';
import { runReminders } from '../../server/services/reminders';
import type { Appointment, Circle } from '../../shared/types';
import { dose } from '../shared/fixtures';
import { buildContext } from './helpers';

describe('passcodes', () => {
  it('hashes with a salt and verifies', async () => {
    const a = await hashPasscode('123456');
    const b = await hashPasscode('123456');
    expect(a).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
    expect(a).not.toBe(b);
    expect(await verifyPasscode('123456', a)).toBe(true);
    expect(await verifyPasscode('654321', a)).toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPasscode('123456', 'plain')).toBe(false);
    expect(await verifyPasscode('123456', 'bcrypt$a$b')).toBe(false);
    expect(await verifyPasscode('123456', 'scrypt$AAAA$AAAA')).toBe(false);
  });
});

describe('sessions', () => {
  const signer = new SessionSigner('x'.repeat(40));
  const now = Date.UTC(2026, 10, 15);

  it('signs and verifies, and expires after the TTL', async () => {
    const token = await signer.sign({ circleId: 'c', memberId: 'm' }, now);
    expect(await signer.verify(token, now + 1000)).toEqual({ circleId: 'c', memberId: 'm' });
    expect(await signer.verify(token, now + (SESSION_TTL_SECONDS + 5) * 1000)).toBeNull();
  });

  it('rejects tampered, foreign and malformed tokens', async () => {
    const token = await signer.sign({ circleId: 'c', memberId: 'm' }, now);
    expect(await new SessionSigner('y'.repeat(40)).verify(token, now)).toBeNull();
    expect(await signer.verify(`${token}x`, now)).toBeNull();
    const badClaims = await new SignJWT({ cid: 5 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('saanjh')
      .setIssuedAt(Math.floor(now / 1000))
      .setExpirationTime(Math.floor(now / 1000) + 60)
      .sign(new TextEncoder().encode('x'.repeat(40)));
    expect(await signer.verify(badClaims, now)).toBeNull();
  });

  it('builds and reads cookies', () => {
    expect(sessionCookie('t', true)).toBe(
      `saanjh_session=t; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}; Secure`,
    );
    expect(clearedSessionCookie(false)).toBe('saanjh_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    expect(clearedSessionCookie(true)).toContain('; Secure');
    expect(readCookie('a=1; saanjh_session=abc=; b=2', 'saanjh_session')).toBe('abc=');
    expect(readCookie('a=1', 'saanjh_session')).toBeNull();
    expect(readCookie(undefined, 'a')).toBeNull();
    expect(readCookie('=x; a', 'a')).toBeNull();
  });
});

describe('action links', () => {
  const secret = 'l'.repeat(40);
  const links = new ActionLinkSigner(secret);
  const now = 1_000_000;
  const forge = (payload: unknown): string => {
    const encoded = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)).toString(
      'base64url',
    );
    return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
  };

  it('round-trips and expires', () => {
    const token = links.sign('d1', 'm1', 'take', now);
    expect(links.verify(token, now)).toMatchObject({ d: 'd1', m: 'm1', a: 'take', exp: now + LINK_TTL_MS });
    expect(links.verify(token, now + LINK_TTL_MS)).toBeNull();
  });

  it('rejects tampering and malformed payloads', () => {
    const token = links.sign('d1', 'm1', 'skip', now);
    expect(links.verify('nodot', now)).toBeNull();
    expect(links.verify(`${token.split('.')[0]}.AAAA`, now)).toBeNull();
    expect(new ActionLinkSigner('z'.repeat(40)).verify(token, now)).toBeNull();
    expect(links.verify(forge('not json'), now)).toBeNull();
    expect(links.verify(forge({ d: 'd', m: 'm', a: 'delete', exp: now + 1, j: 'j' }), now)).toBeNull();
    expect(links.verify(forge({ d: 'd', m: 'm', a: 'take', exp: 'soon', j: 'j' }), now)).toBeNull();
    expect(links.verify(forge({ d: 'd', m: 'm', a: 'take', exp: now + 1, j: 'j' }), now)).not.toBeNull();
  });
});

describe('trigger verifiers', () => {
  it('accepts only the shared secret as a bearer token', async () => {
    const verify = sharedSecretVerifier('secret-value');
    expect(await verify('Bearer secret-value')).toBe(true);
    expect(await verify('Bearer secret-valuX')).toBe(false);
    expect(await verify('Bearer short')).toBe(false);
    expect(await verify('Basic secret-value')).toBe(false);
    expect(await verify(undefined)).toBe(false);
    expect(await denyAllVerifier('Bearer anything')).toBe(false);
  });
});

describe('ids', () => {
  it('generates unambiguous codes and random ids', () => {
    expect(newCircleCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(newId()).toMatch(/^[\w-]{16}$/);
    expect(newId()).not.toBe(newId());
  });
});

describe('config', () => {
  it('uses development defaults with random secrets', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      isProduction: false,
      port: 8080,
      dataBackend: 'memory',
      gmail: null,
      tickSecret: null,
      schedulerServiceAccount: null,
    });
    expect(config.sessionSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.sessionSecret).not.toBe(loadConfig({}).sessionSecret);
    expect(config.gemini).toEqual({
      apiKey: null,
      model: 'gemini-3.1-flash-lite',
      fallbackModel: 'gemini-flash-lite-latest',
    });
  });

  it('treats blank values as unset and trims the app URL', () => {
    const config = loadConfig({
      GEMINI_API_KEY: '',
      APP_URL: 'https://saanjh.app/',
      GMAIL_USER: 'a@gmail.com',
      GMAIL_APP_PASSWORD: 'pw',
      TICK_SECRET: 't',
      SCHEDULER_SA: 'sa@x',
    });
    expect(config.gemini.apiKey).toBeNull();
    expect(config.appUrl).toBe('https://saanjh.app');
    expect(config.gmail).toEqual({ user: 'a@gmail.com', appPassword: 'pw' });
    expect(config.tickSecret).toBe('t');
    expect(config.schedulerServiceAccount).toBe('sa@x');
  });

  it('requires strong secrets in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
    expect(() =>
      loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(40), LINK_SECRET: 'short' }),
    ).toThrow(/LINK_SECRET/);
    const config = loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 's'.repeat(40),
      LINK_SECRET: 'l'.repeat(40),
      DATA_BACKEND: 'firestore',
      PORT: '9000',
    });
    expect(config).toMatchObject({
      isProduction: true,
      sessionSecret: 's'.repeat(40),
      dataBackend: 'firestore',
      port: 9000,
    });
  });
});

describe('logger and clock', () => {
  it('writes one JSON line per entry with a severity', () => {
    const lines: string[] = [];
    const logger = jsonLogger((line) => lines.push(line));
    logger.info('hello', { a: 1 });
    logger.warn('careful');
    logger.error('broken');
    expect(lines.map((l) => (JSON.parse(l) as { severity: string }).severity)).toEqual([
      'INFO',
      'WARNING',
      'ERROR',
    ]);
    expect(JSON.parse(lines[0]!)).toMatchObject({ message: 'hello', a: 1 });
  });

  it('writes to stdout by default', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jsonLogger().info('to stdout');
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"to stdout"'));
  });

  it('reads the system clock', () => {
    expect(Math.abs(systemClock.now() - Date.now())).toBeLessThan(1000);
  });

  it('maps error codes to statuses', () => {
    expect(new AppError('locked', 'x').status).toBe(423);
    expect(new AppError('payload_too_large', 'x').status).toBe(413);
  });
});

describe('email templates', () => {
  const circle: Circle = {
    id: 'c',
    code: 'ABCDEFGH',
    elderName: 'Kamla <b>',
    timezone: 'Asia/Kolkata',
    language: 'en',
    requireElderApproval: true,
    materialisedThrough: '',
    demo: false,
    createdAt: 0,
  };
  const appt: Appointment = {
    id: 'a',
    circleId: 'c',
    doctor: 'Dr. Rao',
    speciality: '',
    place: '',
    at: 0,
    notes: '',
    createdBy: 'm',
    createdAt: 0,
  };

  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('builds dose reminders with links and escaped names', () => {
    const d = dose({ medName: '<script>alert(1)</script>', medDose: '', withFood: true });
    const email = doseReminderEmail(
      'e@x',
      'nudge',
      d,
      { take: 'https://t?a=1&b=2', skip: 'https://s' },
      'https://app',
    );
    expect(email.subject).toBe('Did you take <script>alert(1)</script>?');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&amp;b=2');
    expect(email.html).toContain('with food');
    expect(email.text).toContain('Skip: https://s');
    expect(doseReminderEmail('e@x', 'upcoming', dose(), { take: 't', skip: 's' }, 'a').html).toContain(
      ' · 5 mg',
    );
  });

  it('builds escalation, appointment, stock, digest and test emails', () => {
    expect(missedDoseEmail('e@x', circle, dose(), 'https://app').html).toContain('https://app/today');
    const appt24 = appointmentEmail('e@x', circle, appt, '16 Nov', 24, 'https://app');
    expect(appt24.subject).toBe('Tomorrow: Dr. Rao');
    expect(appt24.html).not.toContain('Place:');
    expect(appt24.html).toContain('Kamla &lt;b&gt;');
    const appt2 = appointmentEmail(
      'e@x',
      circle,
      { ...appt, speciality: 'GP', place: 'Clinic' },
      '16 Nov',
      2,
      'https://app',
    );
    expect(appt2.subject).toBe('In 2 hours: Dr. Rao');
    expect(appt2.html).toContain('(GP)');
    expect(lowStockEmail('e@x', circle, 'Metformin', 1, 'a').html).toContain('1 day</strong>');
    expect(lowStockEmail('e@x', circle, 'Metformin', 3, 'a').html).toContain('3 days</strong>');
    expect(
      digestEmail('e@x', circle, { headline: 'H', summary: 'S', encouragement: 'E' }, 'a').text,
    ).toContain('H\n\nS\n\nE');
    expect(testEmail('e@x', 'Priya', 'https://app').subject).toBe('Saanjh reminders are working');
  });
});

describe('memory repository edge cases', () => {
  it('scopes reads and deletes to the owning circle and ignores missing records', async () => {
    const repo = new MemoryRepository();
    const appt: Appointment = {
      id: 'a',
      circleId: 'c1',
      doctor: 'D',
      speciality: '',
      place: '',
      at: 5,
      notes: '',
      createdBy: 'm',
      createdAt: 0,
    };
    await repo.saveAppointment(appt);
    expect(await repo.getAppointment('c2', 'a')).toBeNull();
    await repo.deleteAppointment('c2', 'a');
    expect(await repo.listAppointmentsBetween(0, 10)).toHaveLength(1);
    expect(await repo.getMedication('c2', 'none')).toBeNull();
    await repo.deleteMedication('c2', 'none');
    await repo.updateCircle('missing', { elderName: 'x' });
    await repo.updateMember('c', 'missing', { name: 'x' });
    await repo.updateDose('missing', { status: 'taken' });
    expect(await repo.getCircle('missing')).toBeNull();
    expect(await repo.getMember('c', 'missing')).toBeNull();
    expect(await repo.getDose('missing')).toBeNull();
    expect(await repo.getCached('missing')).toBeNull();
    expect(await repo.claimOnce('k')).toBe(true);
    await repo.releaseClaim('k');
    expect(await repo.claimOnce('k')).toBe(true);
  });
});

describe('reminder run edge cases', () => {
  it('skips doses whose circle no longer exists', async () => {
    const ctx = buildContext();
    await ctx.repo.createDosesIfAbsent([dose({ circleId: 'gone', dueAt: ctx.clock.now() + 60_000 })]);
    await ctx.repo.saveAppointment({
      id: 'a',
      circleId: 'gone',
      doctor: 'D',
      speciality: '',
      place: '',
      at: ctx.clock.now() + 3_600_000,
      notes: '',
      createdBy: 'm',
      createdAt: 0,
    });
    const report = await runReminders(ctx.deps);
    expect(report).toEqual({ sent: 0, failed: 0, markedMissed: 0, toppedUp: 0 });
  });
});
