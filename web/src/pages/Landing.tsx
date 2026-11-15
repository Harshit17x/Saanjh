import {
  BellRing,
  Check,
  HandHeart,
  HeartHandshake,
  Languages,
  MailCheck,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { DemoResponse } from '../../../shared/api';
import { api, messageOf } from '../api/client';
import { LanguageControl, ThemeToggle } from '../components/AppShell';
import { LogoMark } from '../components/Logo';
import { FormError, PageHeading } from '../components/ui';
import { useSession } from '../hooks/useSession';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';

const TRUST: { Icon: LucideIcon; key: MessageKey }[] = [
  { Icon: ShieldCheck, key: 'landing.trust1' },
  { Icon: Languages, key: 'landing.trust2' },
  { Icon: Smartphone, key: 'landing.trust3' },
];

const STATS: { value: string; key: MessageKey }[] = [
  { value: '1', key: 'landing.stat1' },
  { value: '60', key: 'landing.stat2' },
  { value: '3', key: 'landing.stat3' },
  { value: '0', key: 'landing.stat4' },
];

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: 'landing.how1.title', body: 'landing.how1.body' },
  { title: 'landing.how2.title', body: 'landing.how2.body' },
  { title: 'landing.how3.title', body: 'landing.how3.body' },
];

const PERSONAS: { Icon: LucideIcon; tone: string; title: MessageKey; body: MessageKey }[] = [
  { Icon: UserRound, tone: 'elder', title: 'landing.forElder.title', body: 'landing.forElder.body' },
  { Icon: HeartHandshake, tone: 'family', title: 'landing.forFamily.title', body: 'landing.forFamily.body' },
  {
    Icon: HandHeart,
    tone: 'caretaker',
    title: 'landing.forCaretaker.title',
    body: 'landing.forCaretaker.body',
  },
];

const ALIGNMENT: MessageKey[] = [
  'landing.align1',
  'landing.align2',
  'landing.align3',
  'landing.align4',
  'landing.align5',
  'landing.align6',
];

const BUILT_WITH = ['Gemini', 'Google Calendar', 'Google Maps', 'Google Cloud', 'Firestore', 'Gmail'];

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

/** A static phone-sized preview of the Today screen, so visitors see the product before trying it. */
function PhonePreview() {
  const { t } = useI18n();
  return (
    <div className="phone" aria-hidden="true">
      <div className="phone-notch" />
      <div className="phone-screen">
        <div className="phone-sky">
          <span className="phone-greeting">{t('today.greeting.evening', { name: 'Kamla' })}</span>
          <svg viewBox="0 0 200 80" className="phone-arc">
            <path
              d="M10 72 A90 62 0 0 1 190 72"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeWidth="2"
              strokeDasharray="1 6"
              strokeLinecap="round"
            />
            <path
              d="M10 72 A90 62 0 0 1 150 26"
              fill="none"
              stroke="#f2a93b"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="150" cy="26" r="7" fill="#ffb347" stroke="#fff3d6" strokeWidth="2" />
            <circle cx="32" cy="46" r="5" fill="#1d6b47" />
            <circle cx="60" cy="24" r="5" fill="#1d6b47" />
            <circle cx="176" cy="54" r="5" fill="#fffdf8" stroke="#2e2a6b" strokeWidth="2" />
          </svg>
        </div>
        <div className="phone-card">
          <span className="phone-label">{t('today.next')}</span>
          <strong className="phone-med">Metformin</strong>
          <span className="phone-meta">500 mg · 8:30 pm · {t('today.withFood')}</span>
          <span className="phone-btn">
            <Check size={14} /> {t('today.took')}
          </span>
        </div>
        <ul className="phone-list">
          {[
            ['8:00 am', 'Amlodipine', true],
            ['8:30 am', 'Metformin', true],
            ['10:00 am', 'Vitamin D3', true],
            ['9:30 pm', 'Atorvastatin', false],
          ].map(([time, name, done]) => (
            <li key={String(name)}>
              <span className={done ? 'phone-dot phone-dot-done' : 'phone-dot'} />
              <span className="phone-time">{time}</span>
              <span>{name}</span>
            </li>
          ))}
        </ul>
        <div className="phone-row">
          <span className="phone-chip phone-chip-ok">93%</span>
          <span className="phone-chip">🔥 4</span>
          <span className="phone-chip phone-chip-help">{t('help.button')}</span>
        </div>
      </div>
    </div>
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

  const demoButton = (className: string) => (
    <button type="button" className={className} onClick={() => void startDemo()} disabled={busy}>
      <Sparkles aria-hidden="true" />
      {busy ? t('landing.demoBusy') : t('landing.demo')}
    </button>
  );

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
            <ThemeToggle />
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
              {demoButton('btn btn-primary btn-large')}
              <Link className="btn btn-large" to="/start">
                {t('landing.start')}
              </Link>
              <Link className="btn btn-large" to="/join">
                {t('landing.join')}
              </Link>
            </div>
            <ul className="trust-list list">
              {TRUST.map(({ Icon, key }) => (
                <li key={key}>
                  <Icon aria-hidden="true" />
                  {t(key)}
                </li>
              ))}
            </ul>
            <div className="hero-actions">
              <FormError message={error} />
            </div>
          </div>
          <HeroArt />
        </div>
      </header>

      <main id="main">
        <div className="stats-band">
          <ul className="stats-band-inner list">
            {STATS.map(({ value, key }) => (
              <li key={key}>
                <span className="stats-value">{value}</span>
                <span className="stats-label">{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="page landing-sections">
          <section aria-labelledby="how-title">
            <div className="section-title">
              <span className="eyebrow">{t('landing.howEyebrow')}</span>
              <h2 id="how-title">{t('landing.howTitle')}</h2>
            </div>
            <ol className="steps list">
              {STEPS.map(({ title, body }, i) => (
                <li key={title} className="step">
                  <span className="step-number" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{t(title)}</h3>
                  <p>{t(body)}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="preview" aria-labelledby="preview-title">
            <div className="preview-text">
              <span className="eyebrow">{t('landing.previewEyebrow')}</span>
              <h2 id="preview-title">{t('landing.previewTitle')}</h2>
              <p className="muted">{t('landing.previewBody')}</p>
              <ul className="check-list list">
                {(['landing.previewPoint1', 'landing.previewPoint2', 'landing.previewPoint3'] as const).map(
                  (key) => (
                    <li key={key}>
                      <Check aria-hidden="true" />
                      {t(key)}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <PhonePreview />
          </section>

          <section aria-labelledby="why-title">
            <div className="section-title">
              <span className="eyebrow">{t('landing.eyebrow')}</span>
              <h2 id="why-title">{t('landing.whyTitle')}</h2>
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
          </section>

          <section aria-labelledby="for-title">
            <div className="section-title">
              <span className="eyebrow">{t('landing.forEyebrow')}</span>
              <h2 id="for-title">{t('landing.forTitle')}</h2>
            </div>
            <ul className="personas list">
              {PERSONAS.map(({ Icon, tone, title, body }) => (
                <li key={title} className="persona" data-tone={tone}>
                  <span className="persona-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <h3>{t(title)}</h3>
                  <p>{t(body)}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="align card" aria-labelledby="align-title">
            <div>
              <span className="eyebrow">{t('landing.alignEyebrow')}</span>
              <h2 id="align-title">{t('landing.alignTitle')}</h2>
            </div>
            <ul className="align-grid list">
              {ALIGNMENT.map((key) => (
                <li key={key}>
                  <span className="align-check" aria-hidden="true">
                    <Check />
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>
          </section>

          <section className="built-with" aria-labelledby="built-title">
            <h2 id="built-title" className="eyebrow">
              {t('landing.builtWith')}
            </h2>
            <ul className="built-list list">
              {BUILT_WITH.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </section>

          <section className="cta-band" aria-labelledby="cta-title">
            <Users aria-hidden="true" className="cta-icon" />
            <h2 id="cta-title">{t('landing.ctaTitle')}</h2>
            <p>{t('landing.ctaBody')}</p>
            {demoButton('btn btn-large cta-button')}
          </section>
        </div>
      </main>
      <footer className="footer">{t('landing.footer')}</footer>
    </>
  );
}
