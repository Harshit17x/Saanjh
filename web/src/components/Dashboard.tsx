import { CalendarHeart, Flame, Package, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import type { AdherenceResponse, TodayResponse } from '../../../shared/api';
import { percent } from '../../../shared/adherence';
import type { PublicMember } from '../../../shared/types';
import { useI18n } from '../i18n';
import { Avatar } from './ui';

const DAY_MS = 86_400_000;

/** A small progress ring, e.g. doses taken today. */
export function ProgressRing({ value, total, label }: { value: number; total: number; label: string }) {
  const radius = 34;
  const length = 2 * Math.PI * radius;
  const fraction = total === 0 ? 0 : value / total;
  return (
    <svg className="progress-ring" viewBox="0 0 84 84" role="img" aria-label={label}>
      <circle cx="42" cy="42" r={radius} fill="none" strokeWidth="9" className="progress-ring-track" />
      <circle
        cx="42"
        cy="42"
        r={radius}
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        className="progress-ring-value"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - fraction)}
        transform="rotate(-90 42 42)"
      />
      <text x="42" y="48" textAnchor="middle" fontSize="20">
        {value}/{total}
      </text>
    </svg>
  );
}

function visitText(t: ReturnType<typeof useI18n>['t'], at: number, now: number): string {
  const days = Math.floor((at - now) / DAY_MS);
  if (days <= 0) return t('today.todayWord');
  if (days === 1) return t('today.tomorrow');
  return t('today.inDays', { days });
}

/** Four at-a-glance tiles: weekly adherence, streak, next visit and refills. */
export function StatTiles({ today, week }: { today: TodayResponse; week: AdherenceResponse | null }) {
  const { t } = useI18n();
  const rate = week ? percent(week.overall.rate) : null;
  const tiles = [
    {
      key: 'rate',
      Icon: TrendingUp,
      label: t('today.weekRate'),
      value: rate === null ? '–' : `${rate}%`,
      tone: rate !== null && rate < 80 ? 'warn' : 'ok',
    },
    {
      key: 'streak',
      Icon: Flame,
      label: t('today.streak'),
      value: String(week?.streakDays ?? 0),
      tone: 'accent',
    },
    {
      key: 'visit',
      Icon: CalendarHeart,
      label: t('today.nextVisitIn'),
      value: today.nextAppointment
        ? visitText(t, today.nextAppointment.at, today.now)
        : t('today.noVisitShort'),
      tone: 'primary',
    },
    {
      key: 'refill',
      Icon: Package,
      label: t('today.refills'),
      value:
        today.lowStock.length === 0
          ? t('today.refillsNone')
          : t('today.refillsSome', { count: today.lowStock.length }),
      tone: today.lowStock.length === 0 ? 'ok' : 'warn',
    },
  ];
  return (
    <ul className="stat-tiles list">
      {tiles.map(({ key, Icon, label, value, tone }) => (
        <li key={key} className="stat-tile" data-tone={tone}>
          <span className="stat-tile-icon" aria-hidden="true">
            <Icon />
          </span>
          <span className="stat-tile-value">{value}</span>
          <span className="stat-tile-label">{label}</span>
        </li>
      ))}
    </ul>
  );
}

/** The people in the circle, shown as avatars, with a link to manage them. */
export function CircleStrip({ members, selfId }: { members: PublicMember[]; selfId: string }) {
  const { t } = useI18n();
  return (
    <section className="card circle-strip" aria-labelledby="circle-strip-title">
      <div className="card-head">
        <h2 id="circle-strip-title">{t('circleStrip.title')}</h2>
        <Link to="/circle" className="btn btn-ghost">
          {t('circleStrip.manage')}
        </Link>
      </div>
      <ul className="circle-strip-list list">
        {members.map((m) => (
          <li key={m.id}>
            <Avatar name={m.name} role={m.role} />
            <span className="circle-strip-name">
              {m.name.split(' ')[0]}
              {m.id === selfId && <span className="muted"> ({t('circle.you')})</span>}
            </span>
            <span className="badge">{t(`role.${m.role}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
