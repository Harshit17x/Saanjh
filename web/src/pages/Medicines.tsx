import { Camera, Pill, Plus } from 'lucide-react';
import { useState } from 'react';
import type { DraftMedication } from '../../../shared/api';
import { localDate } from '../../../shared/time';
import { MED_FORMS, type MedForm, type Medication, type MedicationFields } from '../../../shared/types';
import { api } from '../api/client';
import { MedicineCard } from '../components/medicines/MedicineCard';
import { SafetyPanel } from '../components/medicines/SafetyPanel';
import { ScanDialog } from '../components/medicines/ScanDialog';
import { emptyMedication, MedicineForm } from '../components/MedicineForm';
import { Dialog, FormError, LoadState, PageHeading } from '../components/ui';
import { useAction } from '../hooks/useAction';
import { usePreferences } from '../hooks/usePreferences';
import { useResource } from '../hooks/useResource';
import { canManage, isElder, useActiveSession } from '../hooks/useSession';
import { useI18n } from '../i18n';

type Editing = { mode: 'add'; initial: MedicationFields } | { mode: 'edit'; med: Medication } | null;

const toFields = ({
  name,
  dose,
  form,
  times,
  daysOfWeek,
  withFood,
  startDate,
  endDate,
  stock,
  notes,
}: Medication): MedicationFields => ({
  name,
  dose,
  form,
  times,
  daysOfWeek,
  withFood,
  startDate,
  endDate,
  stock,
  notes,
});

const isMedForm = (form: string): form is MedForm => (MED_FORMS as readonly string[]).includes(form);

/** The medicine list, with add, edit, pause, delete, prescription scan and the safety check. */
export function Medicines() {
  const { t } = useI18n();
  const { circle, member } = useActiveSession();
  const { announce } = usePreferences();
  const meds = useResource(() => api.get<{ items: Medication[] }>('/medications'), member.id);
  const [editing, setEditing] = useState<Editing>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [changes, setChanges] = useState(0);
  const { error, run } = useAction();
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

  const change = (request: () => Promise<Medication | null | undefined>) =>
    void run(async () => afterChange(await request()));

  const togglePause = (med: Medication) =>
    change(() =>
      api.post<Medication>(`/medications/${med.id}/${med.status === 'paused' ? 'resume' : 'pause'}`),
    );

  const remove = (med: Medication) => {
    if (!window.confirm(t('meds.confirmDelete', { name: med.name }))) return;
    change(() => api.delete<Medication | undefined>(`/medications/${med.id}`));
  };

  const applyDraft = (draft: DraftMedication) => {
    setScanOpen(false);
    setEditing({
      mode: 'add',
      initial: {
        ...emptyMedication(today),
        name: draft.name,
        dose: draft.dose,
        form: isMedForm(draft.form) ? draft.form : 'other',
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
      <FormError message={error} />
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
              {items.map((med) => (
                <MedicineCard
                  key={med.id}
                  med={med}
                  canEdit={manager}
                  onEdit={(m) => setEditing({ mode: 'edit', med: m })}
                  onTogglePause={togglePause}
                  onDelete={remove}
                />
              ))}
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
