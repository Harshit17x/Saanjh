import { Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { MED_FORMS, type MedForm, type MedicationFields } from '../../../shared/types';
import { useAction } from '../hooks/useAction';
import { useI18n } from '../i18n';
import { FormError, SelectField, TextAreaField, TextField } from './ui';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
export const DAY_KEYS = ['day.0', 'day.1', 'day.2', 'day.3', 'day.4', 'day.5', 'day.6'] as const;

export function emptyMedication(today: string): MedicationFields {
  return {
    name: '',
    dose: '',
    form: 'tablet',
    times: ['09:00'],
    daysOfWeek: ALL_DAYS,
    withFood: false,
    startDate: today,
    endDate: null,
    stock: null,
    notes: '',
  };
}

interface Props {
  initial: MedicationFields;
  submitLabel: string;
  onSubmit: (values: MedicationFields) => Promise<void>;
  onCancel: () => void;
}

/** Add or edit a medication: name, strength, times, days, food, dates, stock and notes. */
export function MedicineForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const { t } = useI18n();
  const [values, setValues] = useState<MedicationFields>(initial);
  const { error, fields, busy, run } = useAction();
  const set = <K extends keyof MedicationFields>(key: K, value: MedicationFields[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const toggleDay = (day: number) =>
    set(
      'daysOfWeek',
      values.daysOfWeek.includes(day)
        ? values.daysOfWeek.filter((d) => d !== day)
        : [...values.daysOfWeek, day].sort(),
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(() => onSubmit(values));
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={error} />
      <TextField
        label={t('form.name')}
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        error={fields.name}
        required
        maxLength={60}
        autoComplete="off"
      />
      <div className="grid-2">
        <TextField
          label={t('form.dose')}
          hint={t('form.doseHint')}
          value={values.dose}
          onChange={(e) => set('dose', e.target.value)}
          error={fields.dose}
          maxLength={40}
          optional
        />
        <SelectField
          label={t('form.form')}
          value={values.form}
          onChange={(e) => set('form', e.target.value as MedForm)}
        >
          {MED_FORMS.map((form) => (
            <option key={form} value={form}>
              {t(`medForm.${form}`)}
            </option>
          ))}
        </SelectField>
      </div>

      <fieldset>
        <legend>{t('form.times')}</legend>
        <div className="time-rows">
          {values.times.map((time, index) => (
            <div className="time-row" key={index}>
              <input
                type="time"
                value={time}
                required
                aria-label={`${t('form.times')} ${index + 1}`}
                onChange={(e) =>
                  set(
                    'times',
                    values.times.map((v, i) => (i === index ? e.target.value : v)),
                  )
                }
              />
              {values.times.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost icon-btn"
                  aria-label={t('form.removeTime', { time })}
                  onClick={() =>
                    set(
                      'times',
                      values.times.filter((_, i) => i !== index),
                    )
                  }
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
        {values.times.length < 8 && (
          <button type="button" className="btn" onClick={() => set('times', [...values.times, '20:00'])}>
            <Plus aria-hidden="true" />
            {t('form.addTime')}
          </button>
        )}
        {fields.times && <span className="error-text">{fields.times}</span>}
      </fieldset>

      <fieldset>
        <legend>{t('form.days')}</legend>
        <div className="chips">
          {ALL_DAYS.map((day) => (
            <label key={day} className="chip-toggle">
              <input
                type="checkbox"
                checked={values.daysOfWeek.includes(day)}
                onChange={() => toggleDay(day)}
              />
              <span>{t(DAY_KEYS[day] ?? 'day.0')}</span>
            </label>
          ))}
        </div>
        {fields.daysOfWeek && <span className="error-text">{fields.daysOfWeek}</span>}
      </fieldset>

      <label className="check">
        <input
          type="checkbox"
          checked={values.withFood}
          onChange={(e) => set('withFood', e.target.checked)}
        />
        {t('form.withFood')}
      </label>

      <div className="grid-2">
        <TextField
          label={t('form.start')}
          type="date"
          value={values.startDate}
          onChange={(e) => set('startDate', e.target.value)}
          error={fields.startDate}
          required
        />
        <TextField
          label={t('form.end')}
          type="date"
          optional
          value={values.endDate ?? ''}
          onChange={(e) => set('endDate', e.target.value || null)}
          error={fields.endDate}
        />
      </div>
      <TextField
        label={t('form.stock')}
        hint={t('form.stockHint')}
        type="number"
        inputMode="numeric"
        min={0}
        max={10000}
        optional
        value={values.stock ?? ''}
        onChange={(e) =>
          set('stock', e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))))
        }
        error={fields.stock}
      />
      <TextAreaField
        label={t('form.notes')}
        optional
        value={values.notes}
        onChange={(e) => set('notes', e.target.value)}
        maxLength={500}
      />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-large" disabled={busy}>
          {submitLabel}
        </button>
        <button type="button" className="btn btn-large" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
