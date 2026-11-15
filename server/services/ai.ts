import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DigestResponse, SafetyCheckResponse, ScanResponse, VisitBriefResponse } from '../../shared/api';
import { percent, type AdherenceSummary } from '../../shared/adherence';
import type { Circle, Medication } from '../../shared/types';
import { digestPrompt, safetyCheckPrompt, scanPrompt, visitBriefPrompt } from '../adapters/gemini/prompts';
import type { Actor, Deps } from '../context';
import type { AiImage, AiRequest } from '../ports/services';
import { requireManage } from './access';
import { cleanDraft, MAX_CAUTIONS, ruleBasedCautions, templateBrief, templateDigest } from './aiFallback';
import { getAppointment } from './appointments';
import { adherence } from './doses';

/**
 * AI features. The model reads, checks and explains; every number comes
 * from tested code. Output is schema-validated, retried once, and replaced
 * by a rule-based result (see aiFallback.ts) if the model is unavailable or
 * returns bad data.
 */

const ATTEMPTS = 2;
const VISIT_BRIEF_DAYS = 30;
/** Length of the hex digest used as a safety-check cache key. */
const CACHE_KEY_LENGTH = 40;

const cautionSchema = z.object({
  severity: z.enum(['info', 'caution', 'warning']),
  medsInvolved: z.array(z.string().max(80)).max(4),
  explanation: z.string().min(1).max(400),
  questionForDoctor: z.string().min(1).max(300),
});
const safetySchema = z.object({ cautions: z.array(cautionSchema).max(MAX_CAUTIONS) });

const draftSchema = z.object({
  name: z.string().trim().min(1).max(60),
  dose: z.string().max(40),
  form: z.string().max(20),
  times: z.array(z.string()).max(8),
  withFood: z.boolean(),
  confidence: z.number(),
});
const scanOutputSchema = z.object({ medications: z.array(draftSchema).max(12) });

const digestSchema = z.object({
  headline: z.string().min(1).max(120),
  summary: z.string().min(1).max(900),
  encouragement: z.string().min(1).max(300),
});

const briefSchema = z.object({
  overview: z.string().min(1).max(900),
  concerns: z.array(z.string().max(300)).max(5),
  questions: z.array(z.string().max(300)).max(6),
});

/** Calls the model and validates its output; returns null when no valid answer was produced. */
async function generate<T extends z.ZodType>(
  deps: Deps,
  request: AiRequest,
  schema: T,
): Promise<z.infer<T> | null> {
  if (!deps.ai.available) return null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const parsed = schema.safeParse(await deps.ai.generateJson(request));
      if (parsed.success) return parsed.data;
      deps.logger.warn('ai output failed validation', { attempt });
    } catch (error) {
      deps.logger.warn('ai call failed', { attempt, error: String(error) });
      return null;
    }
  }
  return null;
}

/** The medication fields the model may see: no ids, stock or audit data. */
const medFacts = (meds: Medication[]) =>
  meds.map(({ name, dose, form, times, withFood, notes }) => ({ name, dose, form, times, withFood, notes }));

const cacheKey = (facts: unknown): string =>
  `safety_${createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, CACHE_KEY_LENGTH)}`;

/** Reviews the circle's current and proposed medications for things to ask a pharmacist about. */
export async function safetyCheck(deps: Deps, actor: Actor): Promise<SafetyCheckResponse> {
  const meds = (await deps.repo.listMedications(actor.circle.id)).filter((m) => m.status !== 'paused');
  if (meds.length === 0) return { source: 'rules', cautions: [] };
  const facts = medFacts(meds).sort((a, b) => a.name.localeCompare(b.name));
  const key = cacheKey(facts);
  const cached = safetySchema.safeParse(await deps.repo.getCached(key));
  if (cached.success) return { source: 'gemini', cautions: cached.data.cautions };

  const result = await generate(
    deps,
    {
      system: safetyCheckPrompt.system,
      prompt: safetyCheckPrompt.task(facts),
      schema: safetyCheckPrompt.schema,
    },
    safetySchema,
  );
  if (!result) return { source: 'rules', cautions: ruleBasedCautions(meds) };
  await deps.repo.setCached(key, result);
  return { source: 'gemini', cautions: result.cautions };
}

/** Reads a prescription photo into draft medications for a person to review. Nothing is saved here. */
export async function scanPrescription(deps: Deps, actor: Actor, image: AiImage): Promise<ScanResponse> {
  requireManage(actor);
  const result = await generate(
    deps,
    { system: scanPrompt.system, prompt: scanPrompt.task, schema: scanPrompt.schema, image },
    scanOutputSchema,
  );
  return result
    ? { source: 'gemini', medications: result.medications.map(cleanDraft) }
    : { source: 'rules', medications: [] };
}

/** The adherence numbers the model may phrase; it never computes them. */
function digestFacts(circle: Circle, summary: AdherenceSummary) {
  return {
    elderName: circle.elderName,
    days: summary.byDay.length,
    overallPercent: percent(summary.overall.rate),
    taken: summary.overall.taken,
    missed: summary.overall.missed,
    skipped: summary.overall.skipped,
    streakDays: summary.streakDays,
    medicines: summary.byMedication.map((m) => ({
      name: m.medName,
      percent: percent(m.rate),
      missed: m.missed,
    })),
  };
}

/** A short, kind summary of the week's adherence, in the circle's language. */
export async function weeklyDigest(
  deps: Deps,
  circle: Circle,
  summary: AdherenceSummary,
): Promise<DigestResponse> {
  const result = await generate(
    deps,
    {
      system: digestPrompt.system(circle.language),
      prompt: digestPrompt.task(digestFacts(circle, summary)),
      schema: digestPrompt.schema,
    },
    digestSchema,
  );
  return result ? { source: 'gemini', ...result } : { source: 'rules', ...templateDigest(circle, summary) };
}

/** A printable brief for a doctor's appointment. */
export async function visitBrief(deps: Deps, actor: Actor, apptId: string): Promise<VisitBriefResponse> {
  const appointment = await getAppointment(deps, actor, apptId);
  const [meds, summary] = await Promise.all([
    deps.repo.listMedications(actor.circle.id),
    adherence(deps, actor.circle, VISIT_BRIEF_DAYS),
  ]);
  const active = meds.filter((m) => m.status === 'active');
  const base = {
    appointment,
    medications: active.map(({ name, dose, times, withFood }) => ({ name, dose, times, withFood })),
    adherencePercent: percent(summary.overall.rate),
  };
  const result = await generate(
    deps,
    {
      system: visitBriefPrompt.system(actor.circle.language),
      prompt: visitBriefPrompt.task({
        doctor: appointment.doctor,
        speciality: appointment.speciality,
        appointmentNotes: appointment.notes,
        medications: medFacts(active),
        adherenceLast30Days: digestFacts(actor.circle, summary),
      }),
      schema: visitBriefPrompt.schema,
    },
    briefSchema,
  );
  return result
    ? { source: 'gemini', ...base, ...result }
    : { source: 'rules', ...base, ...templateBrief(actor.circle.elderName, active.length, summary) };
}
