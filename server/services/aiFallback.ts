import type { Caution, DigestResponse, DraftMedication, VisitBriefResponse } from '../../shared/api';
import { LOW_ADHERENCE_RATE, percent, type AdherenceSummary } from '../../shared/adherence';
import type { Circle, Medication } from '../../shared/types';

/**
 * Deterministic answers used whenever Gemini is unavailable or returns bad
 * data, so every AI feature still works without the model.
 */

/** Most cautions shown at once, matching the model's own limit. */
export const MAX_CAUTIONS = 6;
/** This many medicines due at the same minute is flagged as a busy dose time. */
const CROWDED_DOSE_COUNT = 4;
/** Time used when a scanned draft has no readable time. */
const DEFAULT_DOSE_TIME = '09:00';

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MED_FORMS = new Set(['tablet', 'capsule', 'liquid', 'injection', 'drops', 'inhaler', 'other']);

interface KnownInteraction {
  a: string[];
  b: string[];
  explanation: string;
  question: string;
}

/** Well-known interaction pairs. Names are matched loosely. */
const KNOWN_INTERACTIONS: KnownInteraction[] = [
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

const normalise = (name: string): string => name.toLowerCase().replace(/[^a-z]/g, '');

const mentions = (names: string[], candidates: string[]): string[] =>
  names.filter((name) => candidates.some((c) => normalise(name).includes(c)));

function duplicateCautions(names: string[]): Caution[] {
  const seen = new Map<string, string>();
  const cautions: Caution[] = [];
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
  return cautions;
}

function interactionCautions(names: string[]): Caution[] {
  return KNOWN_INTERACTIONS.flatMap((pair) => {
    const a = mentions(names, pair.a);
    const b = mentions(names, pair.b);
    if (a.length === 0 || b.length === 0) return [];
    return [
      {
        severity: 'warning' as const,
        medsInvolved: [...a, ...b],
        explanation: pair.explanation,
        questionForDoctor: pair.question,
      },
    ];
  });
}

function crowdedTimeCautions(meds: Medication[]): Caution[] {
  const byTime = new Map<string, string[]>();
  for (const med of meds)
    for (const time of med.times) byTime.set(time, [...(byTime.get(time) ?? []), med.name]);
  return [...byTime]
    .filter(([, atTime]) => atTime.length >= CROWDED_DOSE_COUNT)
    .map(([time, atTime]) => ({
      severity: 'info' as const,
      medsInvolved: atTime,
      explanation: `${atTime.length} medicines are due at ${time}. A busy dose time is easier to get wrong.`,
      questionForDoctor: 'Can some of these be taken at a different time of day?',
    }));
}

/** Rule-based checks: duplicates, known pairs and crowded dose times. */
export function ruleBasedCautions(meds: Medication[]): Caution[] {
  const names = meds.map((m) => m.name);
  return [...duplicateCautions(names), ...interactionCautions(names), ...crowdedTimeCautions(meds)].slice(
    0,
    MAX_CAUTIONS,
  );
}

/** Tidies a model-read draft: valid HH:MM times only, a known form, confidence within 0–1. */
export function cleanDraft(draft: {
  name: string;
  dose: string;
  form: string;
  times: string[];
  withFood: boolean;
  confidence: number;
}): DraftMedication {
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
    times: times.length > 0 ? times : [DEFAULT_DOSE_TIME],
    withFood: draft.withFood,
    confidence: Math.min(1, Math.max(0, draft.confidence)),
  };
}

const lowAdherenceMeds = (summary: AdherenceSummary) =>
  summary.byMedication.filter((m) => m.rate !== null && m.rate < LOW_ADHERENCE_RATE);

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
  const weakest = lowAdherenceMeds(summary).map((m) => m.medName);
  const { taken, missed } = summary.overall;
  const streak = summary.streakDays;
  if (hindi) {
    return {
      headline: `इस सप्ताह ${pct}% खुराक ली गईं`,
      summary: `${circle.elderName} ने ${taken} खुराक लीं और ${missed} छूट गईं।${weakest.length > 0 ? ` ${weakest.join(', ')} पर ध्यान दें।` : ''}`,
      encouragement: streak > 0 ? `लगातार ${streak} दिन — बहुत बढ़िया!` : 'हर दिन एक नई शुरुआत है।',
    };
  }
  return {
    headline: `${pct}% of doses taken this week`,
    summary: `${circle.elderName} took ${taken} doses and ${missed} were missed.${weakest.length > 0 ? ` ${weakest.join(', ')} could use a little extra attention.` : ''}`,
    encouragement: streak > 0 ? `A ${streak}-day streak. Well done!` : 'Every day is a fresh start.',
  };
}

/** The written part of a visit brief, built from the numbers alone. */
export function templateBrief(
  elderName: string,
  activeCount: number,
  summary: AdherenceSummary,
): Pick<VisitBriefResponse, 'overview' | 'concerns' | 'questions'> {
  const adherencePercent = percent(summary.overall.rate);
  return {
    overview: `${elderName} takes ${activeCount} medicine${activeCount === 1 ? '' : 's'}.${adherencePercent === null ? '' : ` Over the last 30 days, ${adherencePercent}% of doses were taken.`}`,
    concerns: lowAdherenceMeds(summary).map((m) => `${m.medName} was taken ${percent(m.rate)}% of the time.`),
    questions: [
      'Are all of these medicines still needed?',
      'Can the daily routine be made simpler?',
      'Are there side effects we should watch for?',
    ],
  };
}
