import { CalendarDays, Flame, Moon, Sparkles, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { AdherenceResponse, DigestResponse } from '../../../shared/api';
import {
  LOW_ADHERENCE_RATE,
  percent,
  type DayPeriod,
  type DayTally,
  type PeriodTally,
} from '../../../shared/adherence';
import { api } from '../api/client';
import { AiNote, LoadState, PageHeading } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { useActiveSession } from '../hooks/useSession';
import { useI18n } from '../i18n';
import { formatShortDate } from '../lib/format';

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function Ring({ value, label }: { value: number | null; label: string }) {
  const fraction = value ?? 0;
  return (
    <svg className="ring" viewBox="0 0 128 128" role="img" aria-label={label}>
      <circle className="ring-track" cx="64" cy="64" r={RING_RADIUS} fill="none" strokeWidth="14" />
      <circle
        className="ring-value"
        cx="64"
        cy="64"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - fraction)}
        transform="rotate(-90 64 64)"
      />
      <text x="64" y="72" textAnchor="middle" fontSize="28">
        {value === null ? '–' : `${percent(value)}%`}
      </text>
    </svg>
  );
}

const BAR_W = 600;
const BAR_H = 180;

/** Stacked daily bars: taken, missed, skipped. Hidden from screen readers; the table carries the data. */
function DayBars({ days, locale }: { days: DayTally[]; locale: string }) {
  const max = Math.max(1, ...days.map((d) => d.taken + d.missed + d.skipped + d.pending));
  const slot = BAR_W / days.length;
  const width = Math.min(28, slot * 0.6);
  const scale = (BAR_H - 30) / max;
  const labelEvery = days.length > 10 ? 5 : 1;
  return (
    <svg className="bars" viewBox={`0 0 ${BAR_W} ${BAR_H}`} aria-hidden="true" focusable="false">
      {days.map((day, i) => {
        const x = i * slot + (slot - width) / 2;
        let y = BAR_H - 22;
        const segments: [string, number][] = [
          ['bar-taken', day.taken],
          ['bar-missed', day.missed],
          ['bar-skipped', day.skipped],
          ['bar-pending', day.pending],
        ];
        return (
          <g key={day.date}>
            {segments.map(([className, count]) => {
              const h = count * scale;
              y -= h;
              return h > 0 ? (
                <rect key={className} className={className} x={x} y={y} width={width} height={h} rx="4" />
              ) : null;
            })}
            {i % labelEvery === 0 && (
              <text x={x + width / 2} y={BAR_H - 6} textAnchor="middle">
                {formatShortDate(day.date, locale)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Digest() {
  const { t } = useI18n();
  const { member } = useActiveSession();
  const digest = useResource(() => api.get<DigestResponse>('/ai/digest'), member.id);
  return (
    <section className="card digest stack" aria-labelledby="digest-title" aria-busy={digest.loading}>
      <div className="card-head">
        <h2 id="digest-title">{t('insights.digest')}</h2>
        <Sparkles aria-hidden="true" />
      </div>
      {digest.data ? (
        <>
          <p className="digest-headline">{digest.data.headline}</p>
          <p>{digest.data.summary}</p>
          <p>
            <strong>{digest.data.encouragement}</strong>
          </p>
          <AiNote source={digest.data.source} />
        </>
      ) : digest.loading ? (
        <p role="status">{t('insights.digestLoading')}</p>
      ) : (
        <LoadState loading={false} error={digest.error} onRetry={() => void digest.reload()} />
      )}
    </section>
  );
}

const PERIOD_ICON: Record<DayPeriod, LucideIcon> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: Moon,
};

/** Adherence by part of the day, naming the weakest period so the family knows when to help. */
function TimeOfDay({ periods }: { periods: PeriodTally[] }) {
  const { t } = useI18n();
  const decided = periods.filter((p) => p.rate !== null);
  const weakest = [...decided].sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1))[0];
  const flagged = weakest && weakest.rate !== null && weakest.rate < LOW_ADHERENCE_RATE ? weakest : null;
  return (
    <section className="card stack" aria-labelledby="period-title">
      <div className="card-head">
        <h2 id="period-title">{t('insights.byPeriod')}</h2>
        <Sun aria-hidden="true" />
      </div>
      <p className="muted">{t('insights.periodHint')}</p>
      <ul className="periods list">
        {periods.map((p) => {
          const Icon = PERIOD_ICON[p.period];
          const pct = percent(p.rate);
          return (
            <li key={p.period} className="period" data-low={p === flagged}>
              <span className="period-icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="period-name">{t(`period.${p.period}`)}</span>
              <span className="meter" data-low={p === flagged} aria-hidden="true">
                <span style={{ width: `${pct ?? 0}%` }} />
              </span>
              <span className="period-pct">{pct === null ? '–' : `${pct}%`}</span>
            </li>
          );
        })}
      </ul>
      {decided.length > 0 && (
        <p className={flagged ? 'notice' : 'notice notice-ok'}>
          {flagged ? t('insights.weakest', { period: t(`period.${flagged.period}`) }) : t('insights.allGood')}
        </p>
      )}
    </section>
  );
}

/** A 30-day calendar: one square per day, shaded by the share of doses taken. */
function CalendarHeatmap({ days }: { days: DayTally[] }) {
  const { t, locale } = useI18n();
  const level = (rate: number | null): number =>
    rate === null ? 0 : rate >= 0.99 ? 4 : rate >= 0.75 ? 3 : rate >= 0.5 ? 2 : 1;
  return (
    <section className="card stack" aria-labelledby="calendar-title">
      <div className="card-head">
        <h2 id="calendar-title">{t('insights.calendar')}</h2>
        <CalendarDays aria-hidden="true" />
      </div>
      <p className="muted small">{t('insights.calendarHint')}</p>
      <ol className="heatmap list">
        {days.map((day) => {
          const pct = percent(day.rate);
          const label = `${formatShortDate(day.date, locale)}: ${pct === null ? t('insights.noDoses') : `${pct}%`}`;
          return (
            <li key={day.date} className="heat" data-level={level(day.rate)} title={label}>
              <span className="visually-hidden">{label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Insights() {
  const { t, locale } = useI18n();
  const [days, setDays] = useState<7 | 30>(7);
  const summary = useResource(() => api.get<AdherenceResponse>(`/adherence?days=${days}`), String(days));
  const month = useResource(() => api.get<AdherenceResponse>('/adherence?days=30'), 'month');
  const data = summary.data;
  const decided = data ? data.overall.taken + data.overall.missed + data.overall.skipped : 0;

  return (
    <div className="page stack-l">
      <div className="page-header">
        <div>
          <PageHeading title={t('insights.title')} />
          <p>{t('insights.lede')}</p>
        </div>
        <div className="segmented" role="group" aria-label={t('insights.range')}>
          <button type="button" aria-pressed={days === 7} onClick={() => setDays(7)}>
            {t('insights.week')}
          </button>
          <button type="button" aria-pressed={days === 30} onClick={() => setDays(30)}>
            {t('insights.month')}
          </button>
        </div>
      </div>

      <LoadState
        loading={summary.loading && !data}
        error={summary.error}
        onRetry={() => void summary.reload()}
      />

      {data && (
        <div className="grid-2">
          <div className="stack-l">
            <section className="card stack" aria-labelledby="overall-title">
              <h2 id="overall-title">{t('insights.adherence')}</h2>
              {decided === 0 ? (
                <p className="muted">{t('insights.noData')}</p>
              ) : (
                <div className="row" style={{ gap: 'var(--space-5)' }}>
                  <Ring
                    value={data.overall.rate}
                    label={`${t('insights.adherence')}: ${percent(data.overall.rate) ?? 0}%`}
                  />
                  <div className="stat-row" style={{ flex: 1 }}>
                    <div className="stat">
                      <div className="stat-value">
                        <Flame
                          aria-hidden="true"
                          size={22}
                          style={{ display: 'inline', color: 'var(--accent)' }}
                        />{' '}
                        {data.streakDays}
                      </div>
                      <div className="stat-label">{t('insights.streak')}</div>
                    </div>
                    <div className="stat">
                      <div className="stat-value">{data.overall.taken}</div>
                      <div className="stat-label">{t('insights.taken')}</div>
                    </div>
                    <div className="stat">
                      <div className="stat-value">{data.overall.missed}</div>
                      <div className="stat-label">{t('insights.missed')}</div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="card stack" aria-labelledby="days-title">
              <h2 id="days-title">{t('insights.byDay')}</h2>
              <p className="visually-hidden">{t('insights.chartLabel')}</p>
              <DayBars days={data.byDay} locale={locale} />
              <div className="legend" aria-hidden="true">
                <span>
                  <i style={{ background: 'var(--ok)' }} />
                  {t('insights.taken')}
                </span>
                <span>
                  <i style={{ background: 'var(--bad)' }} />
                  {t('insights.missed')}
                </span>
                <span>
                  <i style={{ background: 'var(--line-strong)' }} />
                  {t('insights.skipped')}
                </span>
              </div>
              <details>
                <summary>{t('insights.showTable')}</summary>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('insights.date')}</th>
                      <th scope="col" className="num">
                        {t('insights.taken')}
                      </th>
                      <th scope="col" className="num">
                        {t('insights.missed')}
                      </th>
                      <th scope="col" className="num">
                        {t('insights.skipped')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byDay.map((day) => (
                      <tr key={day.date}>
                        <th scope="row">{formatShortDate(day.date, locale)}</th>
                        <td className="num">{day.taken}</td>
                        <td className="num">{day.missed}</td>
                        <td className="num">{day.skipped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
          </div>

          <div className="stack-l">
            <Digest />
            <TimeOfDay periods={data.byPeriod} />
            {month.data && <CalendarHeatmap days={month.data.byDay} />}
            <section className="card stack" aria-labelledby="meds-title">
              <h2 id="meds-title">{t('insights.byMed')}</h2>
              {data.byMedication.length === 0 ? (
                <p className="muted">{t('insights.noData')}</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('insights.medicine')}</th>
                      <th scope="col">{t('insights.rate')}</th>
                      <th scope="col" className="num">
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byMedication.map((m) => {
                      const pct = percent(m.rate);
                      return (
                        <tr key={m.medId}>
                          <th scope="row">{m.medName}</th>
                          <td>
                            <div
                              className="meter"
                              data-low={m.rate !== null && m.rate < LOW_ADHERENCE_RATE}
                              aria-hidden="true"
                            >
                              <span style={{ width: `${pct ?? 0}%` }} />
                            </div>
                          </td>
                          <td className="num">{pct === null ? '–' : `${pct}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
