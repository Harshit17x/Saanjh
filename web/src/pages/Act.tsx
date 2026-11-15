import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import type { ActPreviewResponse } from '../../../shared/api';
import { api } from '../api/client';
import { useAction } from '../hooks/useAction';
import { LogoMark } from '../components/Logo';
import { FormError, LoadState, PageHeading } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { useI18n } from '../i18n';
import { formatShortDate, formatWallTime } from '../lib/format';

/**
 * Landing page for the one-tap links in reminder emails. The token sits in
 * the URL fragment, so it never reaches server logs, and nothing happens until
 * the person presses the button (email scanners that open links do no harm).
 */
export function Act() {
  const { t, locale } = useI18n();
  const token = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  const preview = useResource(
    () =>
      token
        ? api.post<ActPreviewResponse>('/act/preview', { token })
        : Promise.reject(new Error(t('act.invalid'))),
    token,
  );
  const [done, setDone] = useState(false);
  const { error, busy, run } = useAction();
  const data = preview.data;

  const confirm = () =>
    void run(async () => {
      await api.post('/act', { token });
      setDone(true);
    });

  return (
    <main id="main" className="page page-narrow">
      <div className="card act stack">
        <LogoMark className="act-icon" />
        {done && data ? (
          <>
            <CheckCircle2 className="act-icon" aria-hidden="true" />
            <PageHeading title={data.action === 'take' ? t('act.doneTake') : t('act.doneSkip')} />
          </>
        ) : (
          <>
            <PageHeading
              title={
                data
                  ? t(data.action === 'take' ? 'act.take' : 'act.skip', { name: data.medName })
                  : t('act.title')
              }
            />
            <LoadState
              loading={preview.loading}
              error={preview.error}
              onRetry={() => void preview.reload()}
            />
            {data && (
              <>
                <p className="muted">
                  {t('act.when', {
                    dose: data.medDose,
                    time: formatWallTime(data.localTime, locale),
                    date: formatShortDate(data.localDate, locale),
                  })}
                </p>
                <FormError message={error} />
                <button
                  type="button"
                  className={`btn btn-large btn-block ${data.action === 'take' ? 'btn-ok' : 'btn-primary'}`}
                  onClick={confirm}
                  disabled={busy}
                >
                  {data.action === 'take' ? t('act.confirmTake') : t('act.confirmSkip')}
                </button>
              </>
            )}
          </>
        )}
        <a className="btn btn-ghost" href="/today">
          {t('act.open')}
        </a>
      </div>
    </main>
  );
}
