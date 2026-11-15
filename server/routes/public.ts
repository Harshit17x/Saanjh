import { Router } from 'express';
import type { DemoResponse } from '../../shared/api';
import { createCircleSchema, joinSchema, lookupSchema, loginSchema, tokenSchema } from '../../shared/schemas';
import type { Deps } from '../context';
import { parseInput } from '../errors';
import { rateLimit } from '../middleware';
import { createCircle, joinCircle, login, lookupCircle } from '../services/circles';
import { createDemoCircle, DEMO_PASSCODE } from '../services/demo';
import { actByLink, previewLink } from '../services/doses';
import { clearedSessionCookie } from '../security/session';
import { startSession } from './session';

const MINUTE = 60_000;

/** Routes that do not need a session: creating, joining and signing in, demo, and email links. */
export function publicRoutes(deps: Deps): Router {
  const router = Router();
  const now = () => deps.clock.now();
  const authLimit = rateLimit('auth', 10, MINUTE, now);
  const createLimit = rateLimit('create', 5, 10 * MINUTE, now);
  const linkLimit = rateLimit('link', 30, MINUTE, now);

  router.post('/circles', createLimit, async (req, res) => {
    const input = parseInput(createCircleSchema, req.body);
    res.status(201).json(await startSession(deps, res, await createCircle(deps, input)));
  });

  router.post('/demo', createLimit, async (_req, res) => {
    const { actor, code } = await createDemoCircle(deps);
    const body: DemoResponse = { ...(await startSession(deps, res, actor)), code, passcode: DEMO_PASSCODE };
    res.status(201).json(body);
  });

  router.post('/auth/lookup', authLimit, async (req, res) => {
    const { code } = parseInput(lookupSchema, req.body);
    res.json(await lookupCircle(deps, code));
  });

  router.post('/auth/join', authLimit, async (req, res) => {
    const input = parseInput(joinSchema, req.body);
    res.status(201).json(await startSession(deps, res, await joinCircle(deps, input)));
  });

  router.post('/auth/login', authLimit, async (req, res) => {
    const { code, memberId, passcode } = parseInput(loginSchema, req.body);
    res.json(await startSession(deps, res, await login(deps, code, memberId, passcode)));
  });

  router.post('/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', clearedSessionCookie(deps.secureCookies));
    res.status(204).end();
  });

  router.post('/act/preview', linkLimit, async (req, res) => {
    const { token } = parseInput(tokenSchema, req.body);
    res.json(await previewLink(deps, token));
  });

  router.post('/act', linkLimit, async (req, res) => {
    const { token } = parseInput(tokenSchema, req.body);
    res.json(await actByLink(deps, token));
  });

  return router;
}
