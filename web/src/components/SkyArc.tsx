import { useId } from 'react';
import type { Dose } from '../../../shared/types';

/** The arc spans the waking day, 06:00 to 22:00. */
const DAY_START_MIN = 6 * 60;
const DAY_END_MIN = 22 * 60;
const CX = 300;
const BASE_Y = 196;
const RX = 260;
const RY = 156;

export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';

/** Which sky to paint for a local hour. */
export function skyPhase(minutes: number): SkyPhase {
  if (minutes >= 5 * 60 && minutes < 8 * 60) return 'dawn';
  if (minutes >= 8 * 60 && minutes < 16 * 60 + 30) return 'day';
  if (minutes >= 16 * 60 + 30 && minutes < 19 * 60 + 30) return 'dusk';
  return 'night';
}

const minutesOf = (time: string): number => {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Point on the arc for a minute of the day. */
export function arcPoint(minutes: number): { x: number; y: number } {
  const f = Math.min(1, Math.max(0, (minutes - DAY_START_MIN) / (DAY_END_MIN - DAY_START_MIN)));
  const angle = f * Math.PI;
  return { x: CX - RX * Math.cos(angle), y: BASE_Y - RY * Math.sin(angle) };
}

function arcPath(toMinutes: number): string {
  const end = arcPoint(toMinutes);
  // The swept angle never exceeds 180°, so the small-arc flag is always correct.
  return `M ${CX - RX} ${BASE_Y} A ${RX} ${RY} 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

const TICKS: { min: number; label: string }[] = [
  { min: 6 * 60, label: '6' },
  { min: 12 * 60, label: '12' },
  { min: 18 * 60, label: '6' },
  { min: 22 * 60, label: '10' },
];

interface Props {
  doses: Dose[];
  nowMinutes: number;
  label: string;
}

/**
 * Today's signature visual: the day drawn as the sun's path from dawn to
 * dusk, with each dose placed at its time. The schedule list below repeats
 * the same information as text, so the drawing is summarised by one label.
 */
export function SkyArc({ doses, nowMinutes, label }: Props) {
  const id = `sky${useId().replace(/[^\w-]/g, '')}`;
  const sun = arcPoint(nowMinutes);
  const night = nowMinutes < DAY_START_MIN || nowMinutes > DAY_END_MIN;
  return (
    <svg className="sky-arc" viewBox="0 0 600 236" role="img" aria-label={label}>
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="#ffe3a3" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#ffb85c" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffb85c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-hill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e2a6b" stopOpacity="0.28" />
          <stop offset="1" stopColor="#2e2a6b" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      <path
        d={arcPath(DAY_END_MIN)}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="3"
        strokeDasharray="2 9"
        strokeLinecap="round"
      />
      {!night && (
        <path d={arcPath(nowMinutes)} fill="none" stroke="#f2a93b" strokeWidth="4" strokeLinecap="round" />
      )}

      {night ? (
        <g transform={`translate(520 50)`}>
          <circle r="16" fill="#f6efe2" />
          <circle r="16" cx="7" cy="-5" fill="#262058" />
        </g>
      ) : (
        <g>
          <circle cx={sun.x} cy={sun.y} r="46" fill={`url(#${id}-glow)`} />
          <circle cx={sun.x} cy={sun.y} r="15" fill="#ffb347" stroke="#fff3d6" strokeWidth="3" />
        </g>
      )}

      {doses.map((dose) => {
        const p = arcPoint(minutesOf(dose.localTime));
        return (
          <g
            key={dose.id}
            className={`sky-dose sky-dose-${dose.status}`}
            transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
          >
            <circle r="11" />
            {dose.status === 'taken' && (
              <path
                d="M-5 0.5 L-1.5 4 L5 -3.5"
                fill="none"
                stroke="#fff"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {dose.status === 'missed' && (
              <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
            )}
          </g>
        );
      })}

      <path d="M0 236 L0 206 Q 90 186 180 202 T 360 198 T 600 204 L600 236 Z" fill={`url(#${id}-hill)`} />
      <line
        x1="20"
        y1={BASE_Y}
        x2="580"
        y2={BASE_Y}
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2"
      />
      {TICKS.map((tick) => {
        const p = arcPoint(tick.min);
        return (
          <text
            key={tick.min}
            x={p.x}
            y={BASE_Y + 26}
            textAnchor="middle"
            fontSize="15"
            fill="currentColor"
            fillOpacity="0.75"
          >
            {tick.label}
          </text>
        );
      })}
    </svg>
  );
}
