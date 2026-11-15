import { Pause, Pencil, Pill, Play, Trash2 } from 'lucide-react';
import { daysOfSupply, needsRefill } from '../../../../shared/refill';
import type { Medication } from '../../../../shared/types';
import { useI18n } from '../../i18n';
import { formatWallTime } from '../../lib/format';
import { DAY_KEYS } from '../MedicineForm';

/** A month's supply fills the supply bar. */
const SUPPLY_FULL_DAYS = 30;
const ALL_WEEK = 7;

/** Width of the supply bar, as a percentage of a month's supply. */
export const supplyPercent = (days: number): number =>
  Math.min(100, Math.round((days / SUPPLY_FULL_DAYS) * 100));

interface MedicineCardProps {
  med: Medication;
  canEdit: boolean;
  onEdit: (med: Medication) => void;
  onTogglePause: (med: Medication) => void;
  onDelete: (med: Medication) => void;
}

/** One medicine: times, schedule, supply left and, for managers, edit, pause and delete. */
export function MedicineCard({ med, canEdit, onEdit, onTogglePause, onDelete }: MedicineCardProps) {
  const { t, locale } = useI18n();
  const days = daysOfSupply(med);
  const low = needsRefill(med);
  const paused = med.status === 'paused';
  return (
    <li className="list-item med-card" data-status={med.status}>
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
          {med.status !== 'active' && <span className="badge badge-accent">{t(`status.${med.status}`)}</span>}
          {med.pending && med.status !== 'proposed' && (
            <span className="badge badge-accent">{t('status.proposed')}</span>
          )}
          {days !== null && (
            <span className={`badge ${low ? 'badge-warn' : ''}`}>{t('meds.daysLeft', { days })}</span>
          )}
        </div>
        <p className="muted small">
          {med.daysOfWeek.length === ALL_WEEK
            ? t('meds.everyDay')
            : med.daysOfWeek.map((d) => t(DAY_KEYS[d] ?? 'day.0')).join(', ')}
          {med.notes && ` · ${med.notes}`}
        </p>
        {days !== null && (
          <div className="supply">
            <span className="small muted">{t('meds.supply')}</span>
            <span className="meter" data-low={low} aria-hidden="true">
              <span style={{ width: `${supplyPercent(days)}%` }} />
            </span>
          </div>
        )}
      </div>
      {canEdit && (
        <div className="list-item-actions">
          <button
            type="button"
            className="btn"
            onClick={() => onEdit(med)}
            aria-label={`${t('common.edit')} ${med.name}`}
          >
            <Pencil aria-hidden="true" />
          </button>
          {med.status !== 'proposed' && (
            <button
              type="button"
              className="btn"
              onClick={() => onTogglePause(med)}
              aria-label={`${paused ? t('meds.resume') : t('meds.pause')} ${med.name}`}
            >
              {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onDelete(med)}
            aria-label={`${t('common.delete')} ${med.name}`}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}
