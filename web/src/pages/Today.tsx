import {
  AlertTriangle,
  CalendarHeart,
  Check,
  CircleSlash,
  Pill,
  PartyPopper,
  Siren,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { AdherenceResponse, CircleResponse, TodayResponse } from '../../../shared/api';
import { localTime } from '../../../shared/time';
import type { Dose, Medication } from '../../../shared/types';
import { api, messageOf } from '../api/client';
import { CircleStrip, ProgressRing, StatTiles } from '../components/Dashboard';
import { SkyArc, skyPhase } from '../components/SkyArc';
import { CheckInCard, HelpButton } from '../components/Wellbeing';
import { FormError, LoadState, PageHeading, StatusBadge, Toast } from '../components/ui';
import { usePreferences } from '../hooks/usePreferences';
import { useResource } from '../hooks/useResource';
import { canRecordDoses, isElder, useActiveSession } from '../hooks/useSession';
import { useI18n, type Translate } from '../i18n';
import { formatDate, formatDateTime, formatTime, formatWallTime } from '../lib/format';

const REFRESH_MS = 2 * 60_000;

const minutesOf = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function greetingKey(
  minutes: number,
): 'today.greeting.morning' | 'today.greeting.afternoon' | 'today.greeting.evening' {
  if (minutes < 12 * 60) return 'today.greeting.morning';
  if (minutes < 17 * 60) return 'today.greeting.afternoon';
  return 'today.greeting.evening';
}

/** The dose to put front and centre: the earliest one still due, else the earliest missed today. */
export function pickNextDose(doses: Dose[]): Dose | null {
  return doses.find((d) => d.status === 'pending') ?? doses.find((d) => d.status === 'missed') ?? null;
}

function speechFor(
  t: Translate,
  data: TodayResponse,
  greeting: string,
  locale: string,
  timeZone: string,
): string {
  const taken = data.doses.filter((d) => d.status === 'taken').length;
  const parts = [t('speech.intro', { greeting, total: data.doses.length, taken })];
  const next = pickNextDose(data.doses);
  if (next) {
    parts.push(
      t('speech.next', {
        med: next.medName,
        dose: next.medDose,
        time: formatWallTime(next.localTime, locale),
      }),
    );
    if (next.withFood) parts.push(t('speech.food'));
  } else if (data.doses.length > 0) parts.push(t('speech.done'));
  if (data.nextAppointment) {
    parts.push(
      t('speech.visit', {
        doctor: data.nextAppointment.doctor,
        when: formatDateTime(data.nextAppointment.at, timeZone, locale),
      }),
    );
  }
  return parts.join(' ');
}

function ProposalCard({
  med,
  elderView,
  elderName,
  onDecide,
}: {
  med: Medication;
  elderView: boolean;
  elderName: string;
  onDecide: (id: string, decision: 'approve' | 'reject') => void;
}) {
  const { t, locale } = useI18n();
  if (!med.pending) return null;
  const changes = med.pending.changes ?? med;
  return (
    <li className="card proposal stack">
      <p className="list-item-title">
        {t(`proposal.${med.pending.action}`, { by: med.pending.byName, med: med.name })}
      </p>
      <p className="muted">
        {changes.name} {changes.dose} · {changes.times.map((time) => formatWallTime(time, locale)).join(', ')}
        {changes.withFood ? ` · ${t('today.withFood')}` : ''}
        {changes.notes ? ` · ${changes.notes}` : ''}
      </p>
      {elderView ? (
        <div className="row">
          <button type="button" className="btn btn-ok" onClick={() => onDecide(med.id, 'approve')}>
            <Check aria-hidden="true" />
            {t('today.approve')}
          </button>
          <button type="button" className="btn" onClick={() => onDecide(med.id, 'reject')}>
            {t('today.decline')}
          </button>
        </div>
      ) : (
        <span className="badge badge-accent">{t('today.proposalsOthers', { name: elderName })}</span>
      )}
    </li>
  );
}

export function Today() {
  const { t, locale, language } = useI18n();
  const { circle, member } = useActiveSession();
  const { announce } = usePreferences();
  const today = useResource(() => api.get<TodayResponse>('/today'), member.id);
  const week = useResource(() => api.get<AdherenceResponse>('/adherence?days=7'), member.id);
  const people = useResource(() => api.get<CircleResponse>('/circle'), member.id);
  const [toast, setToast] = useState<{ message: string; dose: Dose } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const recorder = canRecordDoses(member);
  const { reload } = today;

  useEffect(() => {
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      window.speechSynthesis?.cancel();
    };
  }, [reload]);

  const act = async (dose: Dose, action: 'take' | 'skip' | 'undo') => {
    setActionError(null);
    try {
      await api.post(`/doses/${dose.id}/${action}`);
      if (action === 'undo') {
        setToast(null);
        announce(t('today.undo'));
      } else {
        const message = t(action === 'take' ? 'today.markedTaken' : 'today.markedSkipped', {
          name: dose.medName,
        });
        setToast({ message, dose });
        announce(message);
      }
      await Promise.all([reload(), week.reload()]);
    } catch (error) {
      setActionError(messageOf(error));
    }
  };

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setActionError(null);
    try {
      await api.post(`/medications/${id}/${decision}`);
      await reload();
    } catch (error) {
      setActionError(messageOf(error));
    }
  };

  const clearToast = useCallback(() => setToast(null), []);
  const data = today.data;
  const nowMinutes = data ? minutesOf(localTime(data.now, circle.timezone)) : 12 * 60;
  const greeting = t(greetingKey(nowMinutes), { name: member.name.split(' ')[0] ?? member.name });

  const toggleSpeech = () => {
    const synth = window.speechSynthesis;
    if (!data) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(speechFor(t, data, greeting, locale, circle.timezone));
    utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utterance);
    setSpeaking(true);
  };

  if (!data) {
    return (
      <div className="page">
        <PageHeading title={t('nav.today')} />
        <LoadState loading={today.loading} error={today.error} onRetry={() => void reload()} />
      </div>
    );
  }

  const next = pickNextDose(data.doses);
  const taken = data.doses.filter((d) => d.status === 'taken').length;
  const speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

  return (
    <div className="page stack-l">
      <section className="today-hero" data-phase={skyPhase(nowMinutes)} aria-labelledby="today-title">
        <div className="today-hero-top">
          <div>
            <PageHeading title={t('nav.today')}>
              <span id="today-title">{greeting}</span>
            </PageHeading>
            <p className="muted">
              {formatDate(data.now, circle.timezone, locale)} ·{' '}
              {data.doses.length > 0
                ? t('today.summary', { taken, total: data.doses.length })
                : t('today.summaryNone')}
            </p>
          </div>
          <div className="today-hero-tools">
            {data.doses.length > 0 && (
              <ProgressRing
                value={taken}
                total={data.doses.length}
                label={t('today.ringLabel', { taken, total: data.doses.length })}
              />
            )}
            {speechAvailable && (
              <button type="button" className="btn" onClick={toggleSpeech} aria-pressed={speaking}>
                {speaking ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
                {speaking ? t('today.stopReading') : t('today.readAloud')}
              </button>
            )}
          </div>
        </div>
        <SkyArc doses={data.doses} nowMinutes={nowMinutes} label={t('today.sky')} />
      </section>

      {data.helpRequest && (
        <div className="notice notice-bad help-banner" role="alert">
          <Siren aria-hidden="true" />
          <p>
            <strong>
              {t('help.banner', {
                name: data.helpRequest.byName,
                time: formatTime(data.helpRequest.at, circle.timezone, locale),
              })}
            </strong>
          </p>
        </div>
      )}

      <StatTiles today={data} week={week.data} />

      <FormError message={actionError} />

      {data.proposals.length > 0 && (
        <section aria-labelledby="proposals-title" className="stack">
          <h2 id="proposals-title">
            {isElder(member) ? t('today.proposals') : t('today.proposalsOthers', { name: circle.elderName })}
          </h2>
          <ul className="list">
            {data.proposals.map((med) => (
              <ProposalCard
                key={med.id}
                med={med}
                elderView={isElder(member)}
                elderName={circle.elderName}
                onDecide={(id, d) => void decide(id, d)}
              />
            ))}
          </ul>
        </section>
      )}

      {data.lowStock.map((item) => (
        <div key={item.medId} className="notice">
          <AlertTriangle aria-hidden="true" />
          <p>{t('today.lowStock', { name: item.medName, days: item.daysLeft })}</p>
        </div>
      ))}

      {next ? (
        <section className="next-dose" aria-labelledby="next-title">
          <div className="next-dose-pill">
            <Pill aria-hidden="true" />
          </div>
          <div>
            <h2 id="next-title" className="next-dose-label">
              {t('today.next')}
            </h2>
            <p className="next-dose-name">{next.medName}</p>
            <p className="next-dose-meta">
              {next.medDose && <strong>{next.medDose}</strong>}
              <span>
                {t(next.status === 'missed' ? 'today.overdue' : 'today.dueAt', {
                  time: formatWallTime(next.localTime, locale),
                })}
              </span>
              {next.withFood && <span>{t('today.withFood')}</span>}
            </p>
          </div>
          {recorder && (
            <div className="next-dose-actions">
              <button type="button" className="btn btn-ok" onClick={() => void act(next, 'take')}>
                <Check aria-hidden="true" />
                {t('today.took')}
              </button>
              <button type="button" className="btn" onClick={() => void act(next, 'skip')}>
                <CircleSlash aria-hidden="true" />
                {t('today.skip')}
              </button>
            </div>
          )}
        </section>
      ) : (
        data.doses.length > 0 && (
          <section className="card all-done">
            <PartyPopper aria-hidden="true" />
            <h2>{t('today.allDone')}</h2>
            <p className="muted">{t('today.allDoneBody')}</p>
          </section>
        )
      )}

      <div className="grid-2">
        <CheckInCard
          checkIn={data.checkIn}
          elderView={isElder(member)}
          elderName={circle.elderName}
          timeZone={circle.timezone}
          onSaved={() => void reload()}
        />
        {isElder(member) || member.role === 'caretaker' ? (
          <HelpButton onSent={() => void reload()} />
        ) : (
          people.data && <CircleStrip members={people.data.members} selfId={member.id} />
        )}
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="schedule-title">
          <h2 id="schedule-title">{t('today.schedule')}</h2>
          {data.doses.length === 0 ? (
            <p className="muted">{t('today.summaryNone')}</p>
          ) : (
            <ol className="timeline">
              {data.doses.map((dose) => (
                <li key={dose.id} className="timeline-item">
                  <span className="timeline-time">{formatWallTime(dose.localTime, locale)}</span>
                  <span className="timeline-dot" data-status={dose.status} aria-hidden="true" />
                  <div>
                    <div className="timeline-name">
                      {dose.medName} <span className="muted">{dose.medDose}</span>
                    </div>
                    <div className="row small">
                      <StatusBadge status={dose.status} />
                      {dose.actedByName && dose.actedBy !== member.id && (
                        <span className="muted">{t('today.recordedBy', { name: dose.actedByName })}</span>
                      )}
                    </div>
                  </div>
                  {recorder &&
                    (dose.status === 'pending' || dose.status === 'missed' ? (
                      <div className="row">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void act(dose, 'take')}
                          aria-label={`${t('today.took')}: ${dose.medName} ${formatWallTime(dose.localTime, locale)}`}
                        >
                          <Check aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void act(dose, 'skip')}
                          aria-label={`${t('today.skip')}: ${dose.medName} ${formatWallTime(dose.localTime, locale)}`}
                        >
                          <CircleSlash aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => void act(dose, 'undo')}
                        aria-label={`${t('today.undo')}: ${dose.medName} ${formatWallTime(dose.localTime, locale)}`}
                      >
                        <Undo2 aria-hidden="true" />
                      </button>
                    ))}
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="stack-l">
          <section className="card" aria-labelledby="visit-title">
            <div className="card-head">
              <h2 id="visit-title">{t('today.nextVisit')}</h2>
              <CalendarHeart aria-hidden="true" />
            </div>
            {data.nextAppointment ? (
              <div className="stack">
                <p className="list-item-title">{data.nextAppointment.doctor}</p>
                <p className="muted">
                  {data.nextAppointment.speciality && `${data.nextAppointment.speciality} · `}
                  {formatDateTime(data.nextAppointment.at, circle.timezone, locale)}
                </p>
                {data.nextAppointment.place && <p>{data.nextAppointment.place}</p>}
                <Link className="btn" to={`/appointments/${data.nextAppointment.id}/brief`}>
                  {t('appts.brief')}
                </Link>
              </div>
            ) : (
              <p className="muted">{t('today.noVisit')}</p>
            )}
          </section>
          {(isElder(member) || member.role === 'caretaker') && people.data && (
            <CircleStrip members={people.data.members} selfId={member.id} />
          )}
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          action={t('today.undo')}
          onAction={() => void act(toast.dose, 'undo')}
          onDone={clearToast}
        />
      )}
    </div>
  );
}
