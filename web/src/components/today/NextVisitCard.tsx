import { CalendarHeart } from 'lucide-react';
import { Link } from 'react-router';
import type { Appointment } from '../../../../shared/types';
import { useI18n } from '../../i18n';
import { formatDateTime } from '../../lib/format';

/** The next doctor's appointment, with a link to its visit brief. */
export function NextVisitCard({
  appointment,
  timeZone,
}: {
  appointment: Appointment | null;
  timeZone: string;
}) {
  const { t, locale } = useI18n();
  return (
    <section className="card" aria-labelledby="visit-title">
      <div className="card-head">
        <h2 id="visit-title">{t('today.nextVisit')}</h2>
        <CalendarHeart aria-hidden="true" />
      </div>
      {appointment ? (
        <div className="stack">
          <p className="list-item-title">{appointment.doctor}</p>
          <p className="muted">
            {appointment.speciality && `${appointment.speciality} · `}
            {formatDateTime(appointment.at, timeZone, locale)}
          </p>
          {appointment.place && <p>{appointment.place}</p>}
          <Link className="btn" to={`/appointments/${appointment.id}/brief`}>
            {t('appts.brief')}
          </Link>
        </div>
      ) : (
        <p className="muted">{t('today.noVisit')}</p>
      )}
    </section>
  );
}
