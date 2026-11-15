import {
  BellRing,
  Languages,
  MailCheck,
  ScanLine,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { DemoResponse } from '../../../shared/api';
import { api, messageOf } from '../api/client';
import { LanguageControl } from '../components/AppShell';
import { LogoMark } from '../components/Logo';
import { FormError, PageHeading } from '../components/ui';
import { useSession } from '../hooks/useSession';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';

const FEATURES: { Icon: LucideIcon; title: MessageKey; body: MessageKey }[] = [
  { Icon: UserCheck, title: 'landing.f1.title', body: 'landing.f1.body' },
  { Icon: MailCheck, title: 'landing.f2.title', body: 'landing.f2.body' },
  { Icon: BellRing, title: 'landing.f3.title', body: 'landing.f3.body' },
  { Icon: ScanLine, title: 'landing.f4.title', body: 'landing.f4.body' },
  { Icon: ShieldCheck, title: 'landing.f5.title', body: 'landing.f5.body' },
  { Icon: Languages, title: 'landing.f6.title', body: 'landing.f6.body' },
];

/** Decorative sunset over hills, echoing the name: saanjh means dusk. */
function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="hero-glow">
          <stop offset="0" stopColor="#ffe6a8" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#ffb35c" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffb35c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe08f" />
          <stop offset="1" stopColor="#f07a5a" />
        </linearGradient>
      </defs>
      <circle cx="200" cy="230" r="190" fill="url(#hero-glow)" />
      <path
        d="M40 260 A160 160 0 0 1 360 260"
        fill="none"
        stroke="#fff4dd"
        strokeOpacity="0.45"
        strokeWidth="3"
        strokeDasharray="2 12"
        strokeLinecap="round"
      />
      <circle cx="200" cy="250" r="88" fill="url(#hero-sun)" />
      {[
        [96, 156],
        [152, 118],
        [248, 118],
        [304, 156],
      ].map(([x, y], i) => (
        <g key={x} transform={`translate(${x} ${y})`}>
          <circle r="14" fill={i < 3 ? '#1d6b47' : '#fff8ec'} stroke="#fff8ec" strokeWidth="3" />
          {i < 3 && (
            <path
              d="M-6 0.5 L-1.5 5 L6 -4"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>
      ))}
      <path d="M0 300 Q 100 262 200 290 T 400 284 L400 400 L0 400 Z" fill="#2a2466" opacity="0.85" />
      <path d="M0 330 Q 120 300 230 326 T 400 318 L400 400 L0 400 Z" fill="#1d1838" />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={150 + i * 12}
          y={346 + i * 14}
          width={100 - i * 24}
          height="4"
          rx="2"
          fill="#f2a93b"
          opacity={0.7 - i * 0.2}
        />
      ))}
    </svg>
  );
}

export function Landing() {
  const { t } = useI18n();
  const { setSession } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDemo = async () => {
    setBusy(true);
    setError(null);
    try {
      const demo = await api.post<DemoResponse>('/demo');
      setSession(demo, { code: demo.code, passcode: demo.passcode });
      void navigate('/today');
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  return (
    <>
      <header className="hero">
        <div className="hero-nav">
          <a className="brand" href="/">
            <LogoMark />
            <span className="brand-name">Saanjh</span>
          </a>
          <div className="row">
            <LanguageControl />
            <Link className="btn" to="/signin">
              {t('landing.signIn')}
            </Link>
          </div>
        </div>
        <div className="hero-inner">
          <div>
            <span className="hero-eyebrow">{t('landing.eyebrow')}</span>
            <PageHeading title={t('app.tagline')}>
              {t('landing.title1')} <em>{t('landing.title2')}</em> {t('landing.title3')}
            </PageHeading>
            <p className="hero-lede">{t('landing.lede')}</p>
            <div className="hero-actions">
              <button
                type="button"
                className="btn btn-primary btn-large"
                onClick={() => void startDemo()}
                disabled={busy}
              >
                {busy ? t('landing.demoBusy') : t('landing.demo')}
              </button>
              <Link className="btn btn-large" to="/start">
                {t('landing.start')}
              </Link>
              <Link className="btn btn-large" to="/join">
                {t('landing.join')}
              </Link>
            </div>
            <div className="hero-actions">
              <FormError message={error} />
            </div>
          </div>
          <HeroArt />
        </div>
      </header>
      <main id="main" className="page">
        <div className="section-title">
          <h2>{t('landing.whyTitle')}</h2>
          <p>{t('landing.whyLede')}</p>
        </div>
        <ul className="feature-grid list">
          {FEATURES.map(({ Icon, title, body }) => (
            <li key={title} className="feature">
              <Icon aria-hidden="true" />
              <h3>{t(title)}</h3>
              <p>{t(body)}</p>
            </li>
          ))}
        </ul>
      </main>
      <footer className="footer">{t('landing.footer')}</footer>
    </>
  );
}
