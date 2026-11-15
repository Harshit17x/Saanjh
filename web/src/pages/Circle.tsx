import { Copy, LogOut, Mail, UserMinus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { ActivityResponse, CircleResponse, SessionResponse } from '../../../shared/api';
import type { Language, Permission } from '../../../shared/types';
import { api, ApiError, messageOf } from '../api/client';
import { Avatar, FormError, LoadState, PageHeading, SelectField, TextField } from '../components/ui';
import { usePreferences } from '../hooks/usePreferences';
import { useResource } from '../hooks/useResource';
import { isElder, useActiveSession, useSession } from '../hooks/useSession';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { displayCode, formatDateTime } from '../lib/format';

function Profile() {
  const { t } = useI18n();
  const { circle, member } = useActiveSession();
  const { setSession } = useSession();
  const { announce } = usePreferences();
  const [form, setForm] = useState({ name: member.name, email: member.email ?? '', notify: member.notify });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const next = await api.patch<SessionResponse>('/me', form);
      setSession({ ...next, circle });
      announce(t('meds.saved'));
    } catch (err) {
      if (err instanceof ApiError) setFields(err.fields);
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setError(null);
    try {
      await api.post('/me/test-email');
      announce(t('circle.testSent'));
      window.alert(t('circle.testSent'));
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <section className="card stack" aria-labelledby="profile-title">
      <h2 id="profile-title">{t('circle.profile')}</h2>
      <form className="stack" onSubmit={(e) => void save(e)} noValidate>
        <FormError message={error} />
        <TextField
          label={t('join.name')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={fields.name}
          required
          maxLength={60}
          autoComplete="name"
        />
        <TextField
          label={t('join.email')}
          type="email"
          optional
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={fields.email}
          autoComplete="email"
        />
        <label className="check">
          <input
            type="checkbox"
            checked={form.notify}
            onChange={(e) => setForm({ ...form, notify: e.target.checked })}
          />
          {t('circle.notify')}
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {t('common.save')}
          </button>
          <button type="button" className="btn" onClick={() => void sendTest()} disabled={!member.email}>
            <Mail aria-hidden="true" />
            {t('circle.testEmail')}
          </button>
        </div>
      </form>
    </section>
  );
}

function Settings({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();
  const { circle, member } = useActiveSession();
  const { setSession } = useSession();
  const { announce } = usePreferences();
  const [form, setForm] = useState({
    elderName: circle.elderName,
    language: circle.language,
    requireElderApproval: circle.requireElderApproval,
  });
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const { circle: next } = await api.patch<{ circle: SessionResponse['circle'] }>('/circle', form);
      setSession({ circle: next, member });
      announce(t('meds.saved'));
      onSaved();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <section className="card stack" aria-labelledby="settings-title">
      <h2 id="settings-title">{t('circle.settings')}</h2>
      <form className="stack" onSubmit={(e) => void save(e)} noValidate>
        <FormError message={error} />
        <TextField
          label={t('start.elderName')}
          value={form.elderName}
          onChange={(e) => setForm({ ...form, elderName: e.target.value })}
          required
          maxLength={60}
        />
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
        <label className="check">
          <input
            type="checkbox"
            checked={form.requireElderApproval}
            onChange={(e) => setForm({ ...form, requireElderApproval: e.target.checked })}
            aria-describedby="approval-hint"
          />
          {t('circle.approval')}
        </label>
        <p id="approval-hint" className="hint">
          {t('circle.approvalHint')}
        </p>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            {t('common.save')}
          </button>
        </div>
      </form>
    </section>
  );
}

export function Circle() {
  const { t, locale } = useI18n();
  const { circle, member } = useActiveSession();
  const { signOut } = useSession();
  const { announce } = usePreferences();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const data = useResource(() => api.get<CircleResponse>('/circle'), member.id);
  const activity = useResource(() => api.get<ActivityResponse>('/activity'), member.id);
  const [error, setError] = useState<string | null>(null);
  const elder = isElder(member);

  const copyInvite = async () => {
    const text = t('circle.inviteText', {
      name: circle.elderName,
      url: `${window.location.origin}/join?code=${circle.code}`,
      code: displayCode(circle.code),
    });
    try {
      await navigator.clipboard.writeText(text);
      announce(t('circle.copied'));
      window.alert(t('circle.copied'));
    } catch {
      window.prompt(t('circle.copy'), text);
    }
  };

  const setAccess = async (id: string, permission: Permission) => {
    setError(null);
    try {
      await api.patch(`/circle/members/${id}`, { permission });
      await Promise.all([data.reload(), activity.reload()]);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(t('circle.confirmRemove', { name }))) return;
    setError(null);
    try {
      await api.delete(`/circle/members/${id}`);
      await Promise.all([data.reload(), activity.reload()]);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <div className="page stack-l">
      <div className="page-header">
        <div>
          <PageHeading title={t('circle.title')} />
          <p>{t('circle.lede', { name: circle.elderName })}</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void signOut().then(() => navigate('/'));
          }}
        >
          <LogOut aria-hidden="true" />
          {t('tools.signOut')}
        </button>
      </div>
      <FormError message={error} />

      <div className="grid-2">
        <div className="stack-l">
          <section
            className={`card code-card stack${params.get('welcome') ? ' welcome' : ''}`}
            aria-labelledby="code-title"
          >
            <h2 id="code-title">{t('circle.code')}</h2>
            <p className="code-value">{displayCode(circle.code)}</p>
            <p>{t('circle.codeHint')}</p>
            <div>
              <button type="button" className="btn btn-large" onClick={() => void copyInvite()}>
                <Copy aria-hidden="true" />
                {t('circle.copy')}
              </button>
            </div>
          </section>

          <section className="card stack" aria-labelledby="members-title">
            <h2 id="members-title">{t('circle.members')}</h2>
            <LoadState
              loading={data.loading && !data.data}
              error={data.error}
              onRetry={() => void data.reload()}
            />
            <ul className="list">
              {data.data?.members.map((m) => (
                <li key={m.id} className="list-item">
                  <Avatar name={m.name} role={m.role} />
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {m.name} {m.id === member.id && <span className="badge">{t('circle.you')}</span>}
                    </div>
                    <div className="muted small">
                      {t(`role.${m.role}`)}
                      {m.role !== 'elder' && ` · ${t(`permission.${m.permission}`)}`}
                    </div>
                  </div>
                  {elder && m.role !== 'elder' && (
                    <div className="list-item-actions">
                      <select
                        aria-label={t('circle.access', { name: m.name })}
                        value={m.permission}
                        onChange={(e) => void setAccess(m.id, e.target.value as Permission)}
                      >
                        <option value="manage">{t('permission.manage')}</option>
                        <option value="view">{t('permission.view')}</option>
                      </select>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => void remove(m.id, m.name)}
                        aria-label={`${t('circle.remove')} ${m.name}`}
                      >
                        <UserMinus aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {elder && <Settings onSaved={() => void activity.reload()} />}
        </div>

        <div className="stack-l">
          <Profile />
          <section className="card stack" aria-labelledby="activity-title">
            <h2 id="activity-title">{t('circle.activity')}</h2>
            <LoadState
              loading={activity.loading && !activity.data}
              error={activity.error}
              onRetry={() => void activity.reload()}
            />
            {activity.data?.items.length === 0 && <p className="muted">{t('circle.noActivity')}</p>}
            <ul className="activity">
              {activity.data?.items.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.actorName}</strong>{' '}
                    {t(`activity.${item.action}` as MessageKey, { subject: item.subject })}
                    <time dateTime={new Date(item.at).toISOString()}>
                      {formatDateTime(item.at, circle.timezone, locale)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
