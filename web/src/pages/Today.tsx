import { AlertTriangle, Siren, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AdherenceResponse, CircleResponse, TodayResponse } from '../../../shared/api';
import { localTime } from '../../../shared/time';
import type { Dose } from '../../../shared/types';
import { api } from '../api/client';
import { CircleStrip, ProgressRing, StatTiles } from '../components/Dashboard';
import { SkyArc, skyPhase } from '../components/SkyArc';
import { AllDoneCard, DoseTimeline, NextDoseCard, type DoseAction } from '../components/today/DoseCards';
import { NextVisitCard } from '../components/today/NextVisitCard';
import { ProposalCard, type Decision } from '../components/today/ProposalCard';
import { CheckInCard, HelpButton } from '../components/Wellbeing';
import { FormError, LoadState, PageHeading, Toast } from '../components/ui';
import { useAction } from '../hooks/useAction';
import { usePreferences } from '../hooks/usePreferences';
import { speechAvailable, useReadAloud } from '../hooks/useReadAloud';
import { useResource } from '../hooks/useResource';
import { canCallForHelp, canRecordDoses, isElder, useActiveSession } from '../hooks/useSession';
import { useI18n } from '../i18n';
import { formatDate, formatTime } from '../lib/format';
import { greetingKey, minutesOf, pickNextDose, speechFor, takenCount } from '../lib/today';

/** How often Today refreshes itself, so changes made by others appear. */
const REFRESH_MS = 2 * 60_000;
const NOON_MINUTES = 12 * 60;

/** The elder-first home screen: the next dose, the day's schedule, wellbeing and the next visit. */
export function Today() {
  const { t, locale, language } = useI18n();
  const { circle, member } = useActiveSession();
  const { announce } = usePreferences();
  const today = useResource(() => api.get<TodayResponse>('/today'), member.id);
  const week = useResource(() => api.get<AdherenceResponse>('/adherence?days=7'), member.id);
  const people = useResource(() => api.get<CircleResponse>('/circle'), member.id);
  const [toast, setToast] = useState<{ message: string; dose: Dose } | null>(null);
  const { error, run } = useAction();
  const reader = useReadAloud(language);
  const { reload } = today;
  const elderView = isElder(member);
  const recorder = canRecordDoses(member);

  useEffect(() => {
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const act = (dose: Dose, action: DoseAction) =>
    void run(async () => {
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
    });

  const decide = (id: string, decision: Decision) =>
    void run(async () => {
      await api.post(`/medications/${id}/${decision}`);
      await reload();
    });

  const clearToast = useCallback(() => setToast(null), []);
  const data = today.data;
  const nowMinutes = data ? minutesOf(localTime(data.now, circle.timezone)) : NOON_MINUTES;
  const greeting = t(greetingKey(nowMinutes), { name: member.name.split(' ')[0] ?? member.name });

  if (!data) {
    return (
      <div className="page">
        <PageHeading title={t('nav.today')} />
        <LoadState loading={today.loading} error={today.error} onRetry={() => void reload()} />
      </div>
    );
  }

  const next = pickNextDose(data.doses);
  const total = data.doses.length;
  const taken = takenCount(data.doses);
  const circleStrip = people.data && <CircleStrip members={people.data.members} selfId={member.id} />;

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
              {total > 0 ? t('today.summary', { taken, total }) : t('today.summaryNone')}
            </p>
          </div>
          <div className="today-hero-tools">
            {total > 0 && (
              <ProgressRing value={taken} total={total} label={t('today.ringLabel', { taken, total })} />
            )}
            {speechAvailable() && (
              <button
                type="button"
                className="btn"
                onClick={() => reader.toggle(speechFor(t, data, greeting, locale, circle.timezone))}
                aria-pressed={reader.speaking}
              >
                {reader.speaking ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
                {reader.speaking ? t('today.stopReading') : t('today.readAloud')}
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

      <FormError message={error} />

      {data.proposals.length > 0 && (
        <section aria-labelledby="proposals-title" className="stack">
          <h2 id="proposals-title">
            {elderView ? t('today.proposals') : t('today.proposalsOthers', { name: circle.elderName })}
          </h2>
          <ul className="list">
            {data.proposals.map((med) => (
              <ProposalCard
                key={med.id}
                med={med}
                elderView={elderView}
                elderName={circle.elderName}
                onDecide={decide}
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

      {next ? <NextDoseCard dose={next} canRecord={recorder} onAct={act} /> : total > 0 && <AllDoneCard />}

      <div className="grid-2">
        <CheckInCard
          checkIn={data.checkIn}
          elderView={elderView}
          elderName={circle.elderName}
          timeZone={circle.timezone}
          onSaved={() => void reload()}
        />
        {canCallForHelp(member) ? <HelpButton onSent={() => void reload()} /> : circleStrip}
      </div>

      <div className="grid-2">
        <DoseTimeline doses={data.doses} selfId={member.id} canRecord={recorder} onAct={act} />
        <div className="stack-l">
          <NextVisitCard appointment={data.nextAppointment} timeZone={circle.timezone} />
          {canCallForHelp(member) && circleStrip}
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          action={t('today.undo')}
          onAction={() => act(toast.dose, 'undo')}
          onDone={clearToast}
        />
      )}
    </div>
  );
}
