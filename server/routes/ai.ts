import { Router } from 'express';
import { idParamSchema, scanSchema } from '../../shared/schemas';
import type { Deps } from '../context';
import { parseInput } from '../errors';
import { actorOf, rateLimit } from '../middleware';
import { safetyCheck, scanPrescription, visitBrief, weeklyDigest } from '../services/ai';
import { adherence } from '../services/doses';

const DIGEST_DAYS = 7;

/** AI-assisted features. Rate-limited more tightly because each call costs model time. */
export function aiRoutes(deps: Deps): Router {
  const router = Router();
  router.use(rateLimit('ai', 20, 60_000, () => deps.clock.now()));

  router.post('/scan-prescription', async (req, res) => {
    res.json(await scanPrescription(deps, actorOf(req), parseInput(scanSchema, req.body)));
  });

  router.post('/safety-check', async (req, res) => {
    res.json(await safetyCheck(deps, actorOf(req)));
  });

  router.get('/digest', async (req, res) => {
    const { circle } = actorOf(req);
    res.json(await weeklyDigest(deps, circle, await adherence(deps, circle, DIGEST_DAYS)));
  });

  router.get('/visit-brief/:id', async (req, res) => {
    const { id } = parseInput(idParamSchema, req.params);
    res.json(await visitBrief(deps, actorOf(req), id));
  });

  return router;
}
