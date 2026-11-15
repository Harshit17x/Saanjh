import { Router } from 'express';
import type { ActivityResponse, CircleResponse, HelpResponse } from '../../shared/api';
import {
  checkInSchema,
  circleSettingsSchema,
  helpSchema,
  idParamSchema,
  memberAccessSchema,
  profileSchema,
} from '../../shared/schemas';
import type { Deps } from '../context';
import { AppError, parseInput } from '../errors';
import { testEmail } from '../email/templates';
import { actorOf, rateLimit } from '../middleware';
import { toPublicMember } from '../services/access';
import { ACTIVITY_LIMIT } from '../services/activity';
import {
  removeMember,
  setMemberAccess,
  toPublicCircle,
  updateProfile,
  updateSettings,
} from '../services/circles';
import { switchDemoMember } from '../services/demo';
import { checkIn, requestHelp } from '../services/wellbeing';
import { sessionBody, startSession } from './session';

/** The signed-in member, their circle, its members and its activity log. */
export function circleRoutes(deps: Deps): Router {
  const router = Router();
  const emailLimit = rateLimit('test-email', 3, 10 * 60_000, () => deps.clock.now());
  const helpLimit = rateLimit('help', 3, 10 * 60_000, () => deps.clock.now());

  router.get('/me', (req, res) => {
    res.json(sessionBody(actorOf(req)));
  });

  router.patch('/me', async (req, res) => {
    const actor = actorOf(req);
    const member = await updateProfile(deps, actor, parseInput(profileSchema, req.body));
    res.json(sessionBody({ circle: actor.circle, member }));
  });

  router.post('/me/test-email', emailLimit, async (req, res) => {
    const { member } = actorOf(req);
    if (!member.email) throw new AppError('invalid_input', 'Add your email address first');
    await deps.mailer.send(testEmail(member.email, member.name, deps.appUrl));
    res.status(202).json({ sent: true });
  });

  router.get('/circle', async (req, res) => {
    const actor = actorOf(req);
    const members = await deps.repo.listMembers(actor.circle.id);
    const body: CircleResponse = {
      circle: toPublicCircle(actor.circle),
      members: members.map(toPublicMember),
    };
    res.json(body);
  });

  router.patch('/circle', async (req, res) => {
    const actor = actorOf(req);
    const circle = await updateSettings(deps, actor, parseInput(circleSettingsSchema, req.body));
    res.json({ circle: toPublicCircle(circle) });
  });

  router.patch('/circle/members/:id', async (req, res) => {
    const { id } = parseInput(idParamSchema, req.params);
    const { permission } = parseInput(memberAccessSchema, req.body);
    await setMemberAccess(deps, actorOf(req), id, permission);
    res.status(204).end();
  });

  router.delete('/circle/members/:id', async (req, res) => {
    const { id } = parseInput(idParamSchema, req.params);
    await removeMember(deps, actorOf(req), id);
    res.status(204).end();
  });

  router.post('/help', helpLimit, async (req, res) => {
    const { note } = parseInput(helpSchema, req.body);
    const body: HelpResponse = { notified: await requestHelp(deps, actorOf(req), note) };
    res.status(201).json(body);
  });

  router.post('/checkin', async (req, res) => {
    const { mood, note } = parseInput(checkInSchema, req.body);
    res.status(201).json(await checkIn(deps, actorOf(req), mood, note));
  });

  router.get('/activity', async (req, res) => {
    const body: ActivityResponse = {
      items: await deps.repo.listActivity(actorOf(req).circle.id, ACTIVITY_LIMIT),
    };
    res.json(body);
  });

  router.post('/demo/switch/:id', async (req, res) => {
    const { id } = parseInput(idParamSchema, req.params);
    res.json(await startSession(deps, res, await switchDemoMember(deps, actorOf(req), id)));
  });

  return router;
}
