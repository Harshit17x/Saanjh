import { CalendarHeart, HeartHandshake, LineChart, LogOut, Pill, Sun } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import type { CircleResponse, SessionResponse } from '../../../shared/api';
import { DEMO_PASSCODE } from '../../../shared/demo';
import type { Language } from '../../../shared/types';
import { api, messageOf } from '../api/client';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { displayCode } from '../lib/format';
import { usePreferences, type TextSize } from '../hooks/usePreferences';
import { useResource } from '../hooks/useResource';
import { useActiveSession, useSession } from '../hooks/useSession';
import { LogoMark } from './Logo';

const NAV: { to: string; key: MessageKey; Icon: typeof Sun }[] = [
  { to: '/today', key: 'nav.today', Icon: Sun },
  { to: '/medicines', key: 'nav.medicines', Icon: Pill },
  { to: '/appointments', key: 'nav.appointments', Icon: CalendarHeart },
  { to: '/insights', key: 'nav.insights', Icon: LineChart },
  { to: '/circle', key: 'nav.circle', Icon: HeartHandshake },
];

const SIZES: { size: TextSize; label: string }[] = [
  { size: 0, label: 'A' },
  { size: 1, label: 'A+' },
  { size: 2, label: 'A++' },
];

function TextSizeControl() {
  const { t } = useI18n();
  const { textSize, setTextSize } = usePreferences();
  return (
    <div className="segmented" role="group" aria-label={t('tools.textSize')}>
      {SIZES.map(({ size, label }) => (
        <button key={size} type="button" aria-pressed={textSize === size} onClick={() => setTextSize(size)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function LanguageControl() {
  const { t, language, setLanguage } = useI18n();
  const options: { value: Language; label: string; lang: string }[] = [
    { value: 'en', label: 'EN', lang: 'en' },
    { value: 'hi', label: 'हि', lang: 'hi' },
  ];
  return (
    <div className="segmented" role="group" aria-label={t('tools.language')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          lang={o.lang}
          aria-pressed={language === o.value}
          onClick={() => setLanguage(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** In a demo circle: shows the code and passcode, and switches between members' views. */
function DemoBanner({ session }: { session: SessionResponse }) {
  const { t } = useI18n();
  const { setSession } = useSession();
  const { announce } = usePreferences();
  const members = useResource(() => api.get<CircleResponse>('/circle'), session.circle.id);
  const [error, setError] = useState<string | null>(null);

  const switchTo = async (id: string) => {
    try {
      const next = await api.post<SessionResponse>(`/demo/switch/${id}`);
      setSession(next);
      announce(`${t('demo.viewing')} ${next.member.name}`);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <div className="demo-banner">
      <div className="demo-banner-inner">
        <strong>{t('demo.label')}</strong>
        <span>
          {t('demo.credentials', { code: displayCode(session.circle.code), passcode: DEMO_PASSCODE })}
        </span>
        <span className="demo-viewing">{t('demo.viewing')}</span>
        <div className="segmented" role="group" aria-label={t('demo.viewing')}>
          {members.data?.members.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={m.id === session.member.id}
              onClick={() => void switchTo(m.id)}
            >
              {m.name.split(' ')[0]}
              <span className="demo-role"> · {t(`role.${m.role}`)}</span>
            </button>
          ))}
        </div>
        {error && <span role="alert">{error}</span>}
      </div>
    </div>
  );
}

/** Header, navigation and page frame for signed-in pages. */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const session = useActiveSession();
  const { signOut } = useSession();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    void navigate('/');
  };

  return (
    <>
      <a className="skip-link" href="#main">
        {t('app.skip')}
      </a>
      {session.circle.demo && <DemoBanner session={session} />}
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/today">
            <LogoMark />
            <span className="brand-name">Saanjh</span>
            <span className="brand-circle">{session.circle.elderName}</span>
          </a>
          <nav className="mainnav" aria-label={t('nav.main')}>
            {NAV.map(({ to, key, Icon }) => (
              <NavLink key={to} to={to}>
                <Icon aria-hidden="true" size={18} />
                {t(key)}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-tools">
            <TextSizeControl />
            <LanguageControl />
            <button
              type="button"
              className="btn btn-ghost icon-btn"
              onClick={() => void handleSignOut()}
              aria-label={t('tools.signOut')}
              title={t('tools.signOut')}
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <nav className="bottomnav" aria-label={t('nav.bottom')}>
        {NAV.map(({ to, key, Icon }) => (
          <NavLink key={to} to={to}>
            <Icon aria-hidden="true" />
            {t(key)}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
