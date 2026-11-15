import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  Caution,
  DigestResponse,
  DraftMedication,
  SafetyCheckResponse,
  ScanResponse,
  VisitBriefResponse,
} from '../../shared/api';
import { LOW_ADHERENCE_RATE, percent, type AdherenceSummary } from '../../shared/adherence';
import type { Circle, Medication } from '../../shared/types';
import { digestPrompt, safetyCheckPrompt, scanPrompt, visitBriefPrompt } from '../adapters/gemini/prompts';
import type { Actor, Deps } from '../context';
import type { AiImage, AiRequest } from '../ports/services';
import { requireManage } from './access';
import { getAppointment } from './appointments';
import { adherence } from './doses';

/**
 * AI features. The model reads, checks and explains; every number comes
 * from tested code. Output is schema-validated, retried once, and replaced
 * by a rule-based result if the model is unavailable or returns bad data.
 */

const ATTEMPTS = 2;
const VISIT_BRIEF_DAYS = 30;

const cautionSchema = z.object({
  severity: z.enum(['info', 'caution', 'warning']),
  medsInvolved: z.array(z.string().max(80)).max(4),
  explanation: z.string().min(1).max(400),
  questionForDoctor: z.string().min(1).max(300),
});
const safetySchema = z.object({ cautions: z.array(cautionSchema).max(6) });

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

const medFacts = (meds: Medication[]) =>
  meds.map((m) => ({
    name: m.name,
    dose: m.dose,
    form: m.form,
    times: m.times,
    withFood: m.withFood,
    notes: m.notes,
  }));

const normalise = (name: string): string => name.toLowerCase().replace(/[^a-z]/g, '');

/** Well-known interaction pairs used when the model is unavailable. Names are matched loosely. */
const KNOWN_INTERACTIONS: { a: string[]; b: string[]; explanation: string; question: string }[] = [
  {
    a: ['warfarin', 'apixaban', 'rivaroxaban', 'clopidogrel'],
    b: ['aspirin', 'ibuprofen', 'naproxen', 'diclofenac'],
    explanation:
      'A blood thinner together with aspirin or a pain reliever like ibuprofen can raise the risk of bleeding.',
    question: 'Is it safe to take these together, and what signs of bleeding should we watch for?',
  },
  {
    a: ['lisinopril', 'enalapril', 'ramipril', 'losartan', 'telmisartan'],
    b: ['spironolactone', 'potassium'],
    explanation: 'These two together can raise potassium levels in the blood.',
    question: 'Should potassium levels be checked with a blood test?',
  },
  {
    a: ['sildenafil', 'tadalafil'],
    b: ['nitroglycerin', 'isosorbide'],
    explanation: 'This combination can cause a sharp drop in blood pressure.',
    question: 'Can these two medicines be taken by the same person?',
  },
  {
    a: ['simvastatin', 'atorvastatin'],
    b: ['clarithromycin', 'erythromycin', 'itraconazole'],
    explanation: 'Some antibiotics and antifungals raise statin levels, which can affect the muscles.',
    question: 'Should the statin be paused while taking this other medicine?',
  },
  {
    a: ['levothyroxine', 'thyroxine'],
    b: ['calcium', 'iron', 'omeprazole', 'pantoprazole'],
    explanation: 'Thyroid medicine absorbs poorly when taken close to calcium, iron or acid reducers.',
    question: 'How many hours apart should these be taken?',
  },
];

const mentions = (names: string[], candidates: string[]): string[] =>
  names.filter((name) => candidates.some((c) => normalise(name).includes(c)));

/** Rule-based checks: duplicates, known pairs and crowded dose times. */
export function ruleBasedCautions(meds: Medication[]): Caution[] {
  const cautions: Caution[] = [];
  const names = meds.map((m) => m.name);
  const seen = new Map<string, string>();
  for (const name of names) {
    const key = normalise(name);
    const first = seen.get(key);
    if (first) {
      cautions.push({
        severity: 'caution',
        medsInvolved: [first, name],
        explanation: 'This medicine appears more than once in the list.',
        questionForDoctor: 'Is this medicine meant to be listed twice, or is it a duplicate?',
      });
    } else seen.set(key, name);
  }
  for (const pair of KNOWN_INTERACTIONS) {
    const a = mentions(names, pair.a);
    const b = mentions(names, pair.b);
    if (a.length > 0 && b.length > 0) {
      cautions.push({
        severity: 'warning',
        medsInvolved: [...a, ...b],
        explanation: pair.explanation,
        questionForDoctor: pair.question,
      });
    }
  }
  const byTime = new Map<string, string[]>();
  for (const med of meds)
    for (const time of med.times) byTime.set(time, [...(byTime.get(time) ?? []), med.name]);
  for (const [time, atTime] of byTime) {
    if (atTime.length >= 4) {
      cautions.push({
        severity: 'info',
        medsInvolved: atTime,
        explanation: `${atTime.length} medicines are due at ${time}. A busy dose time is easier to get wrong.`,
        questionForDoctor: 'Can some of these be taken at a different time of day?',
      });
    }
  }
  return cautions.slice(0, 6);
}

/** Reviews the circle's current and proposed medications for things to ask a pharmacist about. */
export async function safetyCheck(deps: Deps, actor: Actor): Promise<SafetyCheckResponse> {
  const meds = (await deps.repo.listMedications(actor.circle.id)).filter((m) => m.status !== 'paused');
  if (meds.length === 0) return { source: 'rules', cautions: [] };
  const facts = medFacts(meds).sort((a, b) => a.name.localeCompare(b.name));
  const key = `safety_${createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 40)}`;
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

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MED_FORMS = new Set(['tablet', 'capsule', 'liquid', 'injection', 'drops', 'inhaler', 'other']);

function cleanDraft(draft: z.infer<typeof draftSchema>): DraftMedication {
  const times = [
    ...new Set(
      draft.times.flatMap((t) => {
        const match = TIME_PATTERN.exec(t.trim());
        return match ? [`${match[1]?.padStart(2, '0')}:${match[2]}`] : [];
      }),
    ),
  ].sort();
  return {
    name: draft.name,
    dose: draft.dose.trim(),
    form: MED_FORMS.has(draft.form) ? draft.form : 'other',
    times: times.length > 0 ? times : ['09:00'],
    withFood: draft.withFood,
    confidence: Math.min(1, Math.max(0, draft.confidence)),
  };
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

/** Template digest used without the model. */
export function templateDigest(circle: Circle, summary: AdherenceSummary): Omit<DigestResponse, 'source'> {
  const pct = percent(summary.overall.rate);
  const hindi = circle.language === 'hi';
  if (pct === null) {
    return hindi
      ? {
          headline: 'अभी कोई खुराक दर्ज नहीं',
          summary: 'इस सप्ताह अभी तक कोई खुराक दर्ज नहीं हुई है।',
          encouragement: 'दवाइयाँ जोड़ें और Saanjh याद दिलाएगा।',
        }
      : {
          headline: 'No doses recorded yet',
          summary: 'No doses have been recorded this week yet.',
          encouragement: 'Add medicines and Saanjh will send reminders.',
        };
  }
  const weakest = summary.byMedication
    .filter((m) => m.rate !== null && m.rate < LOW_ADHERENCE_RATE)
    .map((m) => m.medName);
  if (hindi) {
    return {
      headline: `इस सप्ताह ${pct}% खुराक ली गईं`,
      summary: `${circle.elderName} ने ${summary.overall.taken} खुराक लीं और ${summary.overall.missed} छूट गईं।${weakest.length > 0 ? ` ${weakest.join(', ')} पर ध्यान दें।` : ''}`,
      encouragement:
        summary.streakDays > 0 ? `लगातार ${summary.streakDays} दिन — बहुत बढ़िया!` : 'हर दिन एक नई शुरुआत है।',
    };
  }
  return {
    headline: `${pct}% of doses taken this week`,
    summary: `${circle.elderName} took ${summary.overall.taken} doses and ${summary.overall.missed} were missed.${weakest.length > 0 ? ` ${weakest.join(', ')} could use a little extra attention.` : ''}`,
    encouragement:
      summary.streakDays > 0
        ? `A ${summary.streakDays}-day streak. Well done!`
        : 'Every day is a fresh start.',
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
  const medications = active.map(({ name, dose, times, withFood }) => ({ name, dose, times, withFood }));
  const adherencePercent = percent(summary.overall.rate);
  const facts = {
    doctor: appointment.doctor,
    speciality: appointment.speciality,
    appointmentNotes: appointment.notes,
    medications: medFacts(active),
    adherenceLast30Days: digestFacts(actor.circle, summary),
  };
  const result = await generate(
    deps,
    {
      system: visitBriefPrompt.system(actor.circle.language),
      prompt: visitBriefPrompt.task(facts),
      schema: visitBriefPrompt.schema,
    },
    briefSchema,
  );
  if (result) return { source: 'gemini', appointment, medications, adherencePercent, ...result };

  const lowMeds = summary.byMedication.filter((m) => m.rate !== null && m.rate < LOW_ADHERENCE_RATE);
  return {
    source: 'rules',
    appointment,
    medications,
    adherencePercent,
    overview: `${actor.circle.elderName} takes ${active.length} medicine${active.length === 1 ? '' : 's'}.${adherencePercent === null ? '' : ` Over the last 30 days, ${adherencePercent}% of doses were taken.`}`,
    concerns: lowMeds.map((m) => `${m.medName} was taken ${percent(m.rate)}% of the time.`),
    questions: [
      'Are all of these medicines still needed?',
      'Can the daily routine be made simpler?',
      'Are there side effects we should watch for?',
    ],
  };
}
