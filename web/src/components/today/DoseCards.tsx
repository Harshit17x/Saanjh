import { Check, CircleSlash, PartyPopper, Pill, Undo2 } from 'lucide-react';
import type { Dose } from '../../../../shared/types';
import { useI18n } from '../../i18n';
import { formatWallTime } from '../../lib/format';
import { StatusBadge } from '../ui';

export type DoseAction = 'take' | 'skip' | 'undo';
type OnAct = (dose: Dose, action: DoseAction) => void;

const isOpen = (dose: Dose): boolean => dose.status === 'pending' || dose.status === 'missed';

/** The next dose, large, with Taken and Skip buttons for those allowed to record doses. */
export function NextDoseCard({ dose, canRecord, onAct }: { dose: Dose; canRecord: boolean; onAct: OnAct }) {
  const { t, locale } = useI18n();
  return (
    <section className="next-dose" aria-labelledby="next-title">
      <div className="next-dose-pill">
        <Pill aria-hidden="true" />
      </div>
      <div>
        <h2 id="next-title" className="next-dose-label">
          {t('today.next')}
        </h2>
        <p className="next-dose-name">{dose.medName}</p>
        <p className="next-dose-meta">
          {dose.medDose && <strong>{dose.medDose}</strong>}
          <span>
            {t(dose.status === 'missed' ? 'today.overdue' : 'today.dueAt', {
              time: formatWallTime(dose.localTime, locale),
            })}
          </span>
          {dose.withFood && <span>{t('today.withFood')}</span>}
        </p>
      </div>
      {canRecord && (
        <div className="next-dose-actions">
          <button type="button" className="btn btn-ok" onClick={() => onAct(dose, 'take')}>
            <Check aria-hidden="true" />
            {t('today.took')}
          </button>
          <button type="button" className="btn" onClick={() => onAct(dose, 'skip')}>
            <CircleSlash aria-hidden="true" />
            {t('today.skip')}
          </button>
        </div>
      )}
    </section>
  );
}

/** Shown once every dose for the day has been dealt with. */
export function AllDoneCard() {
  const { t } = useI18n();
  return (
    <section className="card all-done">
      <PartyPopper aria-hidden="true" />
      <h2>{t('today.allDone')}</h2>
      <p className="muted">{t('today.allDoneBody')}</p>
    </section>
  );
}

function DoseButtons({ dose, onAct }: { dose: Dose; onAct: OnAct }) {
  const { t, locale } = useI18n();
  const label = (verb: string) => `${verb}: ${dose.medName} ${formatWallTime(dose.localTime, locale)}`;
  if (!isOpen(dose)) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onAct(dose, 'undo')}
        aria-label={label(t('today.undo'))}
      >
        <Undo2 aria-hidden="true" />
      </button>
    );
  }
  return (
    <div className="row">
      <button
        type="button"
        className="btn"
        onClick={() => onAct(dose, 'take')}
        aria-label={label(t('today.took'))}
      >
        <Check aria-hidden="true" />
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => onAct(dose, 'skip')}
        aria-label={label(t('today.skip'))}
      >
        <CircleSlash aria-hidden="true" />
      </button>
    </div>
  );
}

interface TimelineProps {
  doses: Dose[];
  selfId: string;
  canRecord: boolean;
  onAct: OnAct;
}

/** The whole day's doses in order, with status, who recorded each, and per-dose actions. */
export function DoseTimeline({ doses, selfId, canRecord, onAct }: TimelineProps) {
  const { t, locale } = useI18n();
  return (
    <section className="card" aria-labelledby="schedule-title">
      <h2 id="schedule-title">{t('today.schedule')}</h2>
      {doses.length === 0 ? (
        <p className="muted">{t('today.summaryNone')}</p>
      ) : (
        <ol className="timeline">
          {doses.map((dose) => (
            <li key={dose.id} className="timeline-item">
              <span className="timeline-time">{formatWallTime(dose.localTime, locale)}</span>
              <span className="timeline-dot" data-status={dose.status} aria-hidden="true" />
              <div>
                <div className="timeline-name">
                  {dose.medName} <span className="muted">{dose.medDose}</span>
                </div>
                <div className="row small">
                  <StatusBadge status={dose.status} />
                  {dose.actedByName && dose.actedBy !== selfId && (
                    <span className="muted">{t('today.recordedBy', { name: dose.actedByName })}</span>
                  )}
                </div>
              </div>
              {canRecord && <DoseButtons dose={dose} onAct={onAct} />}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
