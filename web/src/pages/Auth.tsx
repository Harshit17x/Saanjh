import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { LookupResponse, SessionResponse } from '../../../shared/api';
import type { Language } from '../../../shared/types';
import { api, ApiError, messageOf } from '../api/client';
import { LanguageControl, ThemeToggle } from '../components/AppShell';
import { LogoMark } from '../components/Logo';
import { PasscodeField } from '../components/PasscodeField';
import { Avatar, FormError, PageHeading, SelectField, TextField } from '../components/ui';
import { useSession } from '../hooks/useSession';
import { useI18n } from '../i18n';

function AuthLayout({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/">
            <LogoMark />
            <span className="brand-name">Saanjh</span>
          </a>
          <div className="topbar-tools">
            <LanguageControl />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="page page-narrow">
        <Link to="/" className="btn btn-ghost">
          <ArrowLeft aria-hidden="true" />
          {t('common.back')}
        </Link>
        <div className="card auth-card stack">
          <PageHeading title={title} />
          {lede && <p className="muted">{lede}</p>}
          {children}
        </div>
      </main>
    </>
  );
}

/** Field errors from the API, plus a general message for anything else. */
function useFormErrors() {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const capture = (error: unknown) => {
    if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
      setFields(error.fields);
      setGeneral(error.message);
    } else {
      setFields({});
      setGeneral(messageOf(error));
    }
  };
  const reset = () => {
    setFields({});
    setGeneral(null);
  };
  return { fields, general, capture, reset };
}

export const browserTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

/** Supported zones, always including `current` (runtimes may list a zone under an older alias). */
const timeZones = (current: string): string[] => {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = ['Asia/Kolkata', 'UTC'];
  }
  return zones.includes(current) ? zones : [current, ...zones];
};

export function StartCircle() {
  const { t, language } = useI18n();
  const { setSession } = useSession();
  const navigate = useNavigate();
  const errors = useFormErrors();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    elderName: '',
    email: '',
    timezone: browserTimeZone(),
    language,
    passcode: '',
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    errors.reset();
    setBusy(true);
    try {
      setSession(await api.post<SessionResponse>('/circles', form), null);
      void navigate('/circle?welcome=1');
    } catch (error) {
      errors.capture(error);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('start.title')} lede={t('start.lede')}>
      <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <FormError message={errors.general} />
        <TextField
          label={t('start.elderName')}
          value={form.elderName}
          onChange={(e) => setForm({ ...form, elderName: e.target.value })}
          error={errors.fields.elderName}
          required
          autoComplete="name"
          maxLength={60}
        />
        <TextField
          label={t('start.email')}
          hint={t('start.emailHint')}
          type="email"
          optional
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.fields.email}
          autoComplete="email"
        />
        <SelectField
          label={t('start.timezone')}
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          error={errors.fields.timezone}
        >
          {timeZones(form.timezone).map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('start.language')}
          value={form.language}
          onChange={(e) => setForm({ ...form, language: e.target.value as Language })}
        >
          <option value="en">English</option>
          <option value="hi" lang="hi">
            हिन्दी
          </option>
        </SelectField>
        <PasscodeField
          label={t('start.passcode')}
          hint={t('start.passcodeHint')}
          value={form.passcode}
          onChange={(passcode) => setForm({ ...form, passcode })}
          error={errors.fields.passcode}
          autoComplete="new-password"
        />
        <button type="submit" className="btn btn-primary btn-large btn-block" disabled={busy}>
          {t('start.submit')}
        </button>
      </form>
    </AuthLayout>
  );
}

export function JoinCircle() {
  const { t } = useI18n();
  const { setSession } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const errors = useFormErrors();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: params.get('code') ?? '',
    name: '',
    role: 'family',
    email: '',
    passcode: '',
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    errors.reset();
    setBusy(true);
    try {
      setSession(await api.post<SessionResponse>('/auth/join', form), null);
      void navigate('/today');
    } catch (error) {
      errors.capture(error);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('join.title')} lede={t('join.lede')}>
      <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <FormError message={errors.general} />
        <TextField
          label={t('join.code')}
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          error={errors.fields.code}
          required
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <TextField
          label={t('join.name')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.fields.name}
          required
          autoComplete="name"
          maxLength={60}
        />
        <fieldset>
          <legend>{t('join.role')}</legend>
          <div className="chips">
            {(['family', 'caretaker'] as const).map((role) => (
              <label key={role} className="chip-toggle">
                <input
                  type="radio"
                  name="role"
                  value={role}
                  checked={form.role === role}
                  onChange={() => setForm({ ...form, role })}
                />
                <span>{t(`role.${role}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <TextField
          label={t('join.email')}
          hint={t('join.emailHint')}
          type="email"
          optional
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.fields.email}
          autoComplete="email"
        />
        <PasscodeField
          label={t('join.passcode')}
          value={form.passcode}
          onChange={(passcode) => setForm({ ...form, passcode })}
          error={errors.fields.passcode}
          autoComplete="new-password"
        />
        <button type="submit" className="btn btn-primary btn-large btn-block" disabled={busy}>
          {t('join.submit')}
        </button>
      </form>
    </AuthLayout>
  );
}

export function SignIn() {
  const { t } = useI18n();
  const { setSession } = useSession();
  const navigate = useNavigate();
  const errors = useFormErrors();
  const [code, setCode] = useState('');
  const [circle, setCircle] = useState<LookupResponse | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const member = circle?.members.find((m) => m.id === memberId);

  const find = async (event: FormEvent) => {
    event.preventDefault();
    errors.reset();
    setBusy(true);
    try {
      setCircle(await api.post<LookupResponse>('/auth/lookup', { code }));
    } catch (error) {
      errors.capture(error);
    } finally {
      setBusy(false);
    }
  };

  const login = async (event: FormEvent) => {
    event.preventDefault();
    errors.reset();
    setBusy(true);
    try {
      setSession(await api.post<SessionResponse>('/auth/login', { code, memberId, passcode }), null);
      void navigate('/today');
    } catch (error) {
      errors.capture(error);
      setPasscode('');
      setBusy(false);
    }
  };

  if (!circle) {
    return (
      <AuthLayout title={t('signin.title')}>
        <form className="stack" onSubmit={(e) => void find(e)} noValidate>
          <FormError message={errors.general} />
          <TextField
            label={t('signin.code')}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={errors.fields.code}
            required
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary btn-large btn-block" disabled={busy}>
            {t('signin.find')}
          </button>
        </form>
      </AuthLayout>
    );
  }

  if (!member) {
    return (
      <AuthLayout title={t('signin.who', { name: circle.elderName })}>
        <div className="member-tiles">
          {circle.members.map((m) => (
            <button key={m.id} type="button" className="member-tile" onClick={() => setMemberId(m.id)}>
              <Avatar name={m.name} role={m.role} />
              <strong>{m.name}</strong>
              <span className="muted small">{t(`role.${m.role}`)}</span>
            </button>
          ))}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('signin.passcode', { name: member.name })}>
      <form className="stack" onSubmit={(e) => void login(e)} noValidate>
        <FormError message={errors.general} />
        <PasscodeField
          label={t('signin.passcode', { name: member.name })}
          value={passcode}
          onChange={setPasscode}
          error={errors.fields.passcode}
          autoComplete="current-password"
        />
        <button
          type="submit"
          className="btn btn-primary btn-large btn-block"
          disabled={busy || passcode.length !== 6}
        >
          {t('signin.submit')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setMemberId(null)}>
          {t('signin.other')}
        </button>
      </form>
    </AuthLayout>
  );
}
