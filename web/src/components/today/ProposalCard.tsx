import { Check } from 'lucide-react';
import type { Medication } from '../../../../shared/types';
import { useI18n } from '../../i18n';
import { formatWallTime } from '../../lib/format';

export type Decision = 'approve' | 'reject';

interface ProposalCardProps {
  med: Medication;
  elderView: boolean;
  elderName: string;
  onDecide: (id: string, decision: Decision) => void;
}

/** A change someone proposed to a medicine; only the elder can approve or decline it. */
export function ProposalCard({ med, elderView, elderName, onDecide }: ProposalCardProps) {
  const { t, locale } = useI18n();
  if (!med.pending) return null;
  const changes = med.pending.changes ?? med;
  const details = [
    `${changes.name} ${changes.dose}`,
    changes.times.map((time) => formatWallTime(time, locale)).join(', '),
    changes.withFood ? t('today.withFood') : '',
    changes.notes ?? '',
  ].filter(Boolean);
  return (
    <li className="card proposal stack">
      <p className="list-item-title">
        {t(`proposal.${med.pending.action}`, { by: med.pending.byName, med: med.name })}
      </p>
      <p className="muted">{details.join(' · ')}</p>
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
