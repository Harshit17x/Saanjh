import { describe, expect, it } from 'vitest';
import { cleanDraft, MAX_CAUTIONS, ruleBasedCautions, templateBrief } from '../../server/services/aiFallback';
import type { AdherenceSummary } from '../../shared/adherence';
import { med } from '../shared/fixtures';

const draft = (overrides: Partial<Parameters<typeof cleanDraft>[0]> = {}) => ({
  name: 'Metformin',
  dose: ' 500 mg ',
  form: 'tablet',
  times: ['8:00', '20:00'],
  withFood: true,
  confidence: 0.9,
  ...overrides,
});

const summary = (
  rate: number | null,
  byMedication: AdherenceSummary['byMedication'] = [],
): AdherenceSummary => ({
  from: '2026-10-17',
  to: '2026-11-15',
  overall: { taken: 9, missed: 1, skipped: 0, pending: 0, rate },
  byDay: [],
  byMedication,
  byPeriod: [],
  streakDays: 0,
});

describe('cleanDraft', () => {
  it('pads, de-duplicates and sorts valid times, and trims the dose', () => {
    expect(cleanDraft(draft({ times: ['20:00', '8:00', '08:00', 'noon'] }))).toEqual({
      name: 'Metformin',
      dose: '500 mg',
      form: 'tablet',
      times: ['08:00', '20:00'],
      withFood: true,
      confidence: 0.9,
    });
  });

  it('falls back to a morning time, a known form and a 0–1 confidence', () => {
    const cleaned = cleanDraft(draft({ times: ['25:00'], form: 'spray', confidence: 7 }));
    expect(cleaned.times).toEqual(['09:00']);
    expect(cleaned.form).toBe('other');
    expect(cleaned.confidence).toBe(1);
    expect(cleanDraft(draft({ confidence: -2 })).confidence).toBe(0);
  });
});

describe('ruleBasedCautions', () => {
  it('flags a crowded dose time', () => {
    const meds = ['A', 'B', 'C', 'D'].map((name, i) => med({ id: `m${i}`, name, times: ['08:00'] }));
    const cautions = ruleBasedCautions(meds);
    expect(cautions).toHaveLength(1);
    expect(cautions[0]?.severity).toBe('info');
    expect(cautions[0]?.medsInvolved).toEqual(['A', 'B', 'C', 'D']);
  });

  it('never returns more than the limit', () => {
    const meds = Array.from({ length: 10 }, (_, i) =>
      med({ id: `m${i}`, name: 'Aspirin', times: [`0${i}:00`] }),
    );
    expect(ruleBasedCautions(meds)).toHaveLength(MAX_CAUTIONS);
  });
});

describe('templateBrief', () => {
  it('states the numbers and lists poorly taken medicines', () => {
    const brief = templateBrief(
      'Kamla',
      2,
      summary(0.9, [
        { medId: 'm', medName: 'Metformin', taken: 1, missed: 3, skipped: 0, pending: 0, rate: 0.25 },
      ]),
    );
    expect(brief.overview).toBe('Kamla takes 2 medicines. Over the last 30 days, 90% of doses were taken.');
    expect(brief.concerns).toEqual(['Metformin was taken 25% of the time.']);
    expect(brief.questions).toHaveLength(3);
  });

  it('uses the singular and omits the rate when nothing is recorded', () => {
    expect(templateBrief('Kamla', 1, summary(null)).overview).toBe('Kamla takes 1 medicine.');
  });
});
