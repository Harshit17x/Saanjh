import { CalendarHeart, CalendarPlus, FileText, MapPin, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { VisitBriefResponse } from '../../../shared/api';
import { localDate, localTime } from '../../../shared/time';
import type { Appointment } from '../../../shared/types';
import { api } from '../api/client';
import {
  AiNote,
  Dialog,
  FormError,
  LoadState,
  PageHeading,
  TextAreaField,
  TextField,
} from '../components/ui';
import { useAction } from '../hooks/useAction';
import { usePreferences } from '../hooks/usePreferences';
import { useResource } from '../hooks/useResource';
import { canManage, useActiveSession } from '../hooks/useSession';
import { useI18n } from '../i18n';
import { dateParts, formatDateTime, formatWallTime, googleCalendarUrl, googleMapsUrl } from '../lib/format';

interface ApptForm {
  doctor: string;
  speciality: string;
  place: string;
  date: string;
  time: string;
  notes: string;
}

function AppointmentForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: ApptForm;
  onSubmit: (v: ApptForm) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState(initial);
  const { error, fields, busy, run } = useAction();
  const set = (key: keyof ApptForm, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(() => onSubmit(values));
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <FormError message={error} />
      <TextField
        label={t('appts.doctor')}
        value={values.doctor}
        onChange={(e) => set('doctor', e.target.value)}
        error={fields.doctor}
        required
        maxLength={60}
      />
      <TextField
        label={t('appts.speciality')}
        optional
        value={values.speciality}
        onChange={(e) => set('speciality', e.target.value)}
        maxLength={60}
      />
      <TextField
        label={t('appts.place')}
        optional
        value={values.place}
        onChange={(e) => set('place', e.target.value)}
        maxLength={120}
        autoComplete="street-address"
      />
      <div className="grid-2">
        <TextField
          label={t('appts.date')}
          type="date"
          value={values.date}
          onChange={(e) => set('date', e.target.value)}
          error={fields.date}
          required
        />
        <TextField
          label={t('appts.time')}
          type="time"
          value={values.time}
          onChange={(e) => set('time', e.target.value)}
          error={fields.time}
          required
        />
      </div>
      <TextAreaField
        label={t('appts.notes')}
        optional
        value={values.notes}
        onChange={(e) => set('notes', e.target.value)}
        maxLength={500}
      />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-large" disabled={busy}>
          {t('common.save')}
        </button>
        <button type="button" className="btn btn-large" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

function AppointmentItem({
  appt,
  manager,
  onEdit,
  onDelete,
}: {
  appt: Appointment;
  manager: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, locale } = useI18n();
  const { circle } = useActiveSession();
  const { day, month } = dateParts(appt.at, circle.timezone, locale);
  return (
    <li className="list-item">
      <span className="appt-date" aria-hidden="true">
        <strong>{day}</strong>
        <span>{month}</span>
      </span>
      <div className="list-item-main">
        <h3 className="list-item-title">{appt.doctor}</h3>
        <p className="muted">
          {appt.speciality && `${appt.speciality} · `}
          {formatDateTime(appt.at, circle.timezone, locale)}
        </p>
        {appt.place && <p className="small">{appt.place}</p>}
        <div className="row small">
          <a
            className="btn btn-ghost"
            href={googleCalendarUrl(`${appt.doctor} – ${circle.elderName}`, appt.at, appt.notes, appt.place)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <CalendarPlus aria-hidden="true" />
            {t('appts.calendar')}
          </a>
          {appt.place && (
            <a
              className="btn btn-ghost"
              href={googleMapsUrl(appt.place)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin aria-hidden="true" />
              {t('appts.maps')}
            </a>
          )}
          <Link className="btn btn-ghost" to={`/appointments/${appt.id}/brief`}>
            <FileText aria-hidden="true" />
            {t('appts.brief')}
          </Link>
        </div>
      </div>
      {manager && (
        <div className="list-item-actions">
          <button
            type="button"
            className="btn"
            onClick={onEdit}
            aria-label={`${t('common.edit')} ${appt.doctor}`}
          >
            <Pencil aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onDelete}
            aria-label={`${t('common.delete')} ${appt.doctor}`}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}

export function Appointments() {
  const { t } = useI18n();
  const { circle, member } = useActiveSession();
  const { announce } = usePreferences();
  const appts = useResource(() => api.get<{ items: Appointment[] }>('/appointments'), member.id);
  const [editing, setEditing] = useState<{ appt: Appointment | null } | null>(null);
  const { error, run } = useAction();
  const manager = canManage(member);
  const [now] = useState(() => Date.now());
  const items = appts.data?.items ?? [];
  const upcoming = items.filter((a) => a.at >= now);
  const past = items.filter((a) => a.at < now).reverse();

  const save = async (values: ApptForm) => {
    if (editing?.appt) await api.put(`/appointments/${editing.appt.id}`, values);
    else await api.post('/appointments', values);
    setEditing(null);
    announce(t('meds.saved'));
    await appts.reload();
  };

  const remove = (appt: Appointment) => {
    if (!window.confirm(t('appts.confirmDelete', { name: appt.doctor }))) return;
    void run(async () => {
      await api.delete(`/appointments/${appt.id}`);
      await appts.reload();
    });
  };

  const formFor = (appt: Appointment | null): ApptForm =>
    appt
      ? {
          doctor: appt.doctor,
          speciality: appt.speciality,
          place: appt.place,
          notes: appt.notes,
          date: localDate(appt.at, circle.timezone),
          time: localTime(appt.at, circle.timezone),
        }
      : {
          doctor: '',
          speciality: '',
          place: '',
          notes: '',
          date: localDate(now + 86_400_000, circle.timezone),
          time: '10:00',
        };

  const renderList = (list: Appointment[]) => (
    <ul className="list">
      {list.map((appt) => (
        <AppointmentItem
          key={appt.id}
          appt={appt}
          manager={manager}
          onEdit={() => setEditing({ appt })}
          onDelete={() => void remove(appt)}
        />
      ))}
    </ul>
  );

  return (
    <div className="page stack-l">
      <div className="page-header">
        <div>
          <PageHeading title={t('appts.title')} />
          <p>{t('appts.lede')}</p>
        </div>
        {manager && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ appt: null })}>
            <Plus aria-hidden="true" />
            {t('appts.add')}
          </button>
        )}
      </div>
      <FormError message={error} />
      <LoadState
        loading={appts.loading && !appts.data}
        error={appts.error}
        onRetry={() => void appts.reload()}
      />
      {appts.data && items.length === 0 && (
        <div className="card empty">
          <CalendarHeart aria-hidden="true" />
          <p>{t('appts.empty')}</p>
        </div>
      )}
      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-title" className="stack">
          <h2 id="upcoming-title">{t('appts.upcoming')}</h2>
          {renderList(upcoming)}
        </section>
      )}
      {past.length > 0 && (
        <section aria-labelledby="past-title" className="stack">
          <h2 id="past-title">{t('appts.past')}</h2>
          {renderList(past)}
        </section>
      )}
      <Dialog
        open={editing !== null}
        title={editing?.appt ? t('appts.editTitle') : t('appts.addTitle')}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <AppointmentForm
            initial={formFor(editing.appt)}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

/** A printable one-page brief for a doctor's visit. */
export function VisitBrief() {
  const { t, locale } = useI18n();
  const { circle } = useActiveSession();
  const { id = '' } = useParams();
  const brief = useResource(
    () => api.get<VisitBriefResponse>(`/ai/visit-brief/${encodeURIComponent(id)}`),
    id,
  );
  const data = brief.data;

  return (
    <div className="page page-narrow stack">
      <div className="row no-print">
        <Link className="btn btn-ghost" to="/appointments">
          {t('common.back')}
        </Link>
        {data && (
          <button type="button" className="btn" onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            {t('brief.print')}
          </button>
        )}
      </div>
      <article className="card brief stack" aria-busy={brief.loading}>
        <PageHeading title={t('brief.title')}>
          {t('brief.title')} · {circle.elderName}
        </PageHeading>
        {!data &&
          (brief.loading ? (
            <p role="status">{t('brief.preparing')}</p>
          ) : (
            <LoadState loading={false} error={brief.error} onRetry={() => void brief.reload()} />
          ))}
        {data && (
          <>
            <p className="muted">
              {t('brief.forVisit', { doctor: data.appointment.doctor })}
              {data.appointment.speciality && ` (${data.appointment.speciality})`} ·{' '}
              {formatDateTime(data.appointment.at, circle.timezone, locale)}
            </p>
            <h2>{t('brief.overview')}</h2>
            <p>{data.overview}</p>
            <h2>{t('brief.meds')}</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('insights.medicine')}</th>
                  <th scope="col">{t('form.dose')}</th>
                  <th scope="col">{t('meds.times')}</th>
                </tr>
              </thead>
              <tbody>
                {data.medications.map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td>{m.dose}</td>
                    <td>
                      {m.times.map((time) => formatWallTime(time, locale)).join(', ')}
                      {m.withFood ? ` · ${t('today.withFood')}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.adherencePercent !== null && (
              <p>
                <strong>{t('brief.adherence')}:</strong> {data.adherencePercent}%
              </p>
            )}
            <h2>{t('brief.concerns')}</h2>
            {data.concerns.length > 0 ? (
              <ul>
                {data.concerns.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t('brief.none')}</p>
            )}
            <h2>{t('brief.questions')}</h2>
            <ul>
              {data.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <AiNote source={data.source} />
          </>
        )}
      </article>
    </div>
  );
}
