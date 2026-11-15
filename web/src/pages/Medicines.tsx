import { Camera, Pause, Pencil, Pill, Play, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import type { DraftMedication, SafetyCheckResponse, ScanResponse } from '../../../shared/api';
import { daysOfSupply, needsRefill } from '../../../shared/refill';
import { localDate } from '../../../shared/time';
import { MED_FORMS, type MedForm, type Medication, type MedicationFields } from '../../../shared/types';
import { api, messageOf } from '../api/client';
import { DAY_KEYS, emptyMedication, MedicineForm } from '../components/MedicineForm';
import { AiNote, Dialog, FormError, LoadState, PageHeading } from '../components/ui';
import { usePreferences } from '../hooks/usePreferences';
import { useResource } from '../hooks/useResource';
import { canManage, isElder, useActiveSession } from '../hooks/useSession';
import { useI18n } from '../i18n';
import { prepareImage } from '../lib/image';
import { formatWallTime } from '../lib/format';

type Editing = { mode: 'add'; initial: MedicationFields } | { mode: 'edit'; med: Medication } | null;

const toFields = (med: Medication): MedicationFields => ({
  name: med.name,
  dose: med.dose,
  form: med.form,
  times: med.times,
  daysOfWeek: med.daysOfWeek,
  withFood: med.withFood,
  startDate: med.startDate,
  endDate: med.endDate,
  stock: med.stock,
  notes: med.notes,
});

function SafetyPanel({ refreshKey }: { refreshKey: number }) {
  const { t } = useI18n();
  const [result, setResult] = useState<SafetyCheckResponse | null>(null);
  const [checkedKey, setCheckedKey] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.post<SafetyCheckResponse>('/ai/safety-check'));
      setCheckedKey(refreshKey);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const stale = result !== null && checkedKey !== refreshKey;
  return (
    <section className="card stack" aria-labelledby="safety-title" aria-busy={busy}>
      <div className="card-head">
        <h2 id="safety-title">{t('safety.title')}</h2>
        <ShieldCheck aria-hidden="true" />
      </div>
      <p className="muted">{t('safety.lede')}</p>
      <button type="button" className="btn btn-accent" onClick={() => void run()} disabled={busy}>
        {busy ? t('safety.running') : t('safety.run')}
      </button>
      <FormError message={error} />
      {result && !stale && (
        <div className="stack" aria-live="polite">
          {result.cautions.length === 0 ? (
            <p>{t('safety.clear')}</p>
          ) : (
            <ul className="list">
              {result.cautions.map((c, i) => (
                <li key={i} className="caution" data-severity={c.severity}>
                  <span
                    className={`badge ${c.severity === 'warning' ? 'badge-bad' : c.severity === 'caution' ? 'badge-warn' : ''}`}
                  >
                    {t(`severity.${c.severity}`)}
                  </span>{' '}
                  <strong>{c.medsInvolved.join(' + ')}</strong>
                  <p>{c.explanation}</p>
                  <p className="caution-question">
                    {t('safety.ask')} {c.questionForDoctor}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <AiNote source={result.source} />
        </div>
      )}
    </section>
  );
}

function ScanDialog({
  open,
  onClose,
  onUse,
}: {
  open: boolean;
  onClose: () => void;
  onUse: (draft: DraftMedication) => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.post<ScanResponse>('/ai/scan-prescription', await prepareImage(file)));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} title={t('scan.title')} onClose={onClose}>
      <div className="stack" aria-busy={busy}>
        <p className="muted">{t('scan.lede')}</p>
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void onFile(e)}
        />
        <button
          type="button"
          className="btn btn-primary btn-large"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          <Camera aria-hidden="true" />
          {busy ? t('scan.reading') : t('scan.choose')}
        </button>
        <FormError message={error} />
        {result && (
          <div className="stack" aria-live="polite">
            {result.medications.length === 0 ? (
              <p>{t('scan.none')}</p>
            ) : (
              <>
                <p>{t('scan.found', { count: result.medications.length })}</p>
                <ul className="drafts list">
                  {result.medications.map((draft, i) => (
                    <li key={i} className="draft">
                      <div>
                        <strong>
                          {draft.name} {draft.dose}
                        </strong>
                        <div className="muted small">
                          {draft.times.join(', ')} ·{' '}
                          {t('scan.confidence', { pct: Math.round(draft.confidence * 100) })}
                        </div>
                      </div>
                      <button type="button" className="btn" onClick={() => onUse(draft)}>
                        {t('scan.use')}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <AiNote source={result.source} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function Medicines() {
  const { t, locale } = useI18n();
  const { circle, member } = useActiveSession();
  const { announce } = usePreferences();
  const meds = useResource(() => api.get<{ items: Medication[] }>('/medications'), member.id);
  const [editing, setEditing] = useState<Editing>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [changes, setChanges] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const manager = canManage(member);
  const elder = isElder(member);
  const [today] = useState(() => localDate(Date.now(), circle.timezone));

  const afterChange = async (result: Medication | null | undefined) => {
    const proposed = result?.pending && !elder;
    announce(proposed ? t('meds.sentForApproval', { name: circle.elderName }) : t('meds.saved'));
    setChanges((n) => n + 1);
    await meds.reload();
  };

  const save = async (values: MedicationFields) => {
    const result =
      editing?.mode === 'edit'
        ? await api.put<Medication>(`/medications/${editing.med.id}`, values)
        : await api.post<Medication>('/medications', values);
    setEditing(null);
    await afterChange(result);
  };

  const run = async (action: () => Promise<Medication | null | undefined>) => {
    setActionError(null);
    try {
      await afterChange(await action());
    } catch (err) {
      setActionError(messageOf(err));
    }
  };

  const remove = (med: Medication) => {
    if (!window.confirm(t('meds.confirmDelete', { name: med.name }))) return;
    void run(() => api.delete<Medication | undefined>(`/medications/${med.id}`));
  };

  const applyDraft = (draft: DraftMedication) => {
    setScanOpen(false);
    setEditing({
      mode: 'add',
      initial: {
        ...emptyMedication(today),
        name: draft.name,
        dose: draft.dose,
        form: (MED_FORMS as readonly string[]).includes(draft.form) ? (draft.form as MedForm) : 'other',
        times: draft.times,
        withFood: draft.withFood,
      },
    });
  };

  const items = meds.data?.items ?? [];
  return (
    <div className="page stack-l">
      <div className="page-header">
        <div>
          <PageHeading title={t('meds.title')} />
          <p>{t('meds.lede', { name: circle.elderName })}</p>
        </div>
        {manager && (
          <div className="row">
            <button type="button" className="btn" onClick={() => setScanOpen(true)}>
              <Camera aria-hidden="true" />
              {t('meds.scan')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditing({ mode: 'add', initial: emptyMedication(today) })}
            >
              <Plus aria-hidden="true" />
              {t('meds.add')}
            </button>
          </div>
        )}
      </div>

      {!manager && <p className="notice">{t('meds.viewOnly', { name: circle.elderName })}</p>}
      {manager && !elder && circle.requireElderApproval && (
        <p className="notice">{t('meds.proposedNote', { name: circle.elderName })}</p>
      )}
      <FormError message={actionError} />
      <LoadState loading={meds.loading && !meds.data} error={meds.error} onRetry={() => void meds.reload()} />

      <div className="grid-2">
        <section aria-label={t('meds.title')}>
          {meds.data && items.length === 0 ? (
            <div className="card empty">
              <Pill aria-hidden="true" />
              <p>{t('meds.empty')}</p>
            </div>
          ) : (
            <ul className="list">
              {items.map((med) => {
                const days = daysOfSupply(med);
                return (
                  <li key={med.id} className="list-item med-card" data-status={med.status}>
                    <span className="med-icon" aria-hidden="true">
                      <Pill />
                    </span>
                    <div className="list-item-main">
                      <h2 className="list-item-title">
                        {med.name} <span className="muted">{med.dose}</span>
                      </h2>
                      <div className="med-times">
                        {med.times.map((time) => (
                          <span key={time} className="badge badge-primary">
                            {formatWallTime(time, locale)}
                          </span>
                        ))}
                        {med.withFood && <span className="badge">{t('today.withFood')}</span>}
                        {med.status !== 'active' && (
                          <span className="badge badge-accent">{t(`status.${med.status}`)}</span>
                        )}
                        {med.pending && med.status !== 'proposed' && (
                          <span className="badge badge-accent">{t('status.proposed')}</span>
                        )}
                        {days !== null && (
                          <span className={`badge ${needsRefill(med) ? 'badge-warn' : ''}`}>
                            {t('meds.daysLeft', { days })}
                          </span>
                        )}
                      </div>
                      <p className="muted small">
                        {med.daysOfWeek.length === 7
                          ? t('meds.everyDay')
                          : med.daysOfWeek.map((d) => t(DAY_KEYS[d] ?? 'day.0')).join(', ')}
                        {med.notes && ` · ${med.notes}`}
                      </p>
                    </div>
                    {manager && (
                      <div className="list-item-actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setEditing({ mode: 'edit', med })}
                          aria-label={`${t('common.edit')} ${med.name}`}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                        {med.status !== 'proposed' && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() =>
                              void run(() =>
                                api.post<Medication>(
                                  `/medications/${med.id}/${med.status === 'paused' ? 'resume' : 'pause'}`,
                                ),
                              )
                            }
                            aria-label={`${med.status === 'paused' ? t('meds.resume') : t('meds.pause')} ${med.name}`}
                          >
                            {med.status === 'paused' ? (
                              <Play aria-hidden="true" />
                            ) : (
                              <Pause aria-hidden="true" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => remove(med)}
                          aria-label={`${t('common.delete')} ${med.name}`}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <SafetyPanel refreshKey={changes} />
      </div>

      <Dialog
        open={editing !== null}
        title={
          editing?.mode === 'edit' ? t('form.editTitle', { name: editing.med.name }) : t('form.addTitle')
        }
        onClose={() => setEditing(null)}
      >
        {editing && (
          <MedicineForm
            initial={editing.mode === 'edit' ? toFields(editing.med) : editing.initial}
            submitLabel={t('common.save')}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
      <ScanDialog open={scanOpen} onClose={() => setScanOpen(false)} onUse={applyDraft} />
    </div>
  );
}
