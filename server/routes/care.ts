import { Router } from 'express';
import type { Request } from 'express';
import {
  adherenceQuerySchema,
  appointmentSchema,
  idParamSchema,
  medicationSchema,
} from '../../shared/schemas';
import type { Deps } from '../context';
import { parseInput } from '../errors';
import { actorOf } from '../middleware';
import {
  createAppointment,
  deleteAppointment,
  listAppointments,
  updateAppointment,
} from '../services/appointments';
import { actOnDose, adherence, today, type DoseAction } from '../services/doses';
import {
  approveProposal,
  createMedication,
  deleteMedication,
  listMedications,
  rejectProposal,
  setPaused,
  updateMedication,
} from '../services/medications';

const idOf = (req: Request): string => parseInput(idParamSchema, req.params).id;

/** Medications, doses, adherence and appointments. */
export function careRoutes(deps: Deps): Router {
  const router = Router();

  router.get('/today', async (req, res) => {
    res.json(await today(deps, actorOf(req)));
  });

  router.get('/medications', async (req, res) => {
    res.json({ items: await listMedications(deps, actorOf(req)) });
  });

  router.post('/medications', async (req, res) => {
    const med = await createMedication(deps, actorOf(req), parseInput(medicationSchema, req.body));
    res.status(201).json(med);
  });

  router.put('/medications/:id', async (req, res) => {
    res.json(await updateMedication(deps, actorOf(req), idOf(req), parseInput(medicationSchema, req.body)));
  });

  router.post('/medications/:id/pause', async (req, res) => {
    res.json(await setPaused(deps, actorOf(req), idOf(req), true));
  });

  router.post('/medications/:id/resume', async (req, res) => {
    res.json(await setPaused(deps, actorOf(req), idOf(req), false));
  });

  router.delete('/medications/:id', async (req, res) => {
    const pending = await deleteMedication(deps, actorOf(req), idOf(req));
    if (pending) res.status(202).json(pending);
    else res.status(204).end();
  });

  router.post('/medications/:id/approve', async (req, res) => {
    res.json({ medication: await approveProposal(deps, actorOf(req), idOf(req)) });
  });

  router.post('/medications/:id/reject', async (req, res) => {
    res.json({ medication: await rejectProposal(deps, actorOf(req), idOf(req)) });
  });

  for (const action of ['take', 'skip', 'undo'] as const satisfies readonly DoseAction[]) {
    router.post(`/doses/:id/${action}`, async (req, res) => {
      res.json(await actOnDose(deps, actorOf(req), idOf(req), action));
    });
  }

  router.get('/adherence', async (req, res) => {
    const { days } = parseInput(adherenceQuerySchema, req.query);
    res.json(await adherence(deps, actorOf(req).circle, days));
  });

  router.get('/appointments', async (req, res) => {
    res.json({ items: await listAppointments(deps, actorOf(req)) });
  });

  router.post('/appointments', async (req, res) => {
    res
      .status(201)
      .json(await createAppointment(deps, actorOf(req), parseInput(appointmentSchema, req.body)));
  });

  router.put('/appointments/:id', async (req, res) => {
    res.json(await updateAppointment(deps, actorOf(req), idOf(req), parseInput(appointmentSchema, req.body)));
  });

  router.delete('/appointments/:id', async (req, res) => {
    await deleteAppointment(deps, actorOf(req), idOf(req));
    res.status(204).end();
  });

  return router;
}
