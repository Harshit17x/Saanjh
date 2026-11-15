import { Router, type RequestHandler } from 'express';
import type { Deps } from '../context';
import { AppError } from '../errors';
import { runReminders, runWeeklyDigest } from '../services/reminders';

/** Endpoints for Cloud Scheduler only, authenticated by a verified OIDC token. */
export function internalRoutes(deps: Deps): Router {
  const router = Router();

  const schedulerOnly: RequestHandler = async (req, _res, next) => {
    if (await deps.verifyTrigger(req.get('authorization'))) return next();
    next(new AppError('forbidden', 'Not allowed'));
  };

  router.post('/tick', schedulerOnly, async (_req, res) => {
    res.json(await runReminders(deps));
  });

  router.post('/digest', schedulerOnly, async (_req, res) => {
    res.json(await runWeeklyDigest(deps));
  });

  return router;
}
