import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { Caution, SafetyCheckResponse } from '../../../../shared/api';
import { api } from '../../api/client';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n';
import { AiNote, FormError } from '../ui';

const SEVERITY_BADGE: Record<Caution['severity'], string> = {
  warning: 'badge-bad',
  caution: 'badge-warn',
  info: '',
};

/**
 * Runs the Gemini safety check over the medicine list. A result is hidden
 * once the list changes (refreshKey moves on), so it is never out of date.
 */
export function SafetyPanel({ refreshKey }: { refreshKey: number }) {
  const { t } = useI18n();
  const [result, setResult] = useState<SafetyCheckResponse | null>(null);
  const [checkedKey, setCheckedKey] = useState<number | null>(null);
  const { error, busy, run } = useAction();

  const check = () =>
    void run(async () => {
      setResult(await api.post<SafetyCheckResponse>('/ai/safety-check'));
      setCheckedKey(refreshKey);
    });

  const fresh = result !== null && checkedKey === refreshKey;
  return (
    <section className="card stack" aria-labelledby="safety-title" aria-busy={busy}>
      <div className="card-head">
        <h2 id="safety-title">{t('safety.title')}</h2>
        <ShieldCheck aria-hidden="true" />
      </div>
      <p className="muted">{t('safety.lede')}</p>
      <button type="button" className="btn btn-accent" onClick={check} disabled={busy}>
        {busy ? t('safety.running') : t('safety.run')}
      </button>
      <FormError message={error} />
      {fresh && (
        <div className="stack" aria-live="polite">
          {result.cautions.length === 0 ? (
            <p>{t('safety.clear')}</p>
          ) : (
            <ul className="list">
              {result.cautions.map((c) => (
                <li
                  key={`${c.severity}-${c.medsInvolved.join('+')}`}
                  className="caution"
                  data-severity={c.severity}
                >
                  <span className={`badge ${SEVERITY_BADGE[c.severity]}`}>{t(`severity.${c.severity}`)}</span>{' '}
                  <strong>{c.medsInvolved.join(' + ')}</strong>
                  <p>{c.explanation}</p>
                  <p className="caution-question">
                    {t('safety.ask')} {c.questionForDoctor}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <AiNote source={result.source} />
        </div>
      )}
    </section>
  );
}
