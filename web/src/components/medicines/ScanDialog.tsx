import { Camera } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import type { DraftMedication, ScanResponse } from '../../../../shared/api';
import { api } from '../../api/client';
import { useAction } from '../../hooks/useAction';
import { useI18n } from '../../i18n';
import { prepareImage } from '../../lib/image';
import { AiNote, Dialog, FormError } from '../ui';

interface ScanDialogProps {
  open: boolean;
  onClose: () => void;
  onUse: (draft: DraftMedication) => void;
}

/** Photograph a prescription; Gemini reads it into drafts that open in the form for review. */
export function ScanDialog({ open, onClose, onUse }: ScanDialogProps) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const { error, busy, run } = useAction();

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setResult(null);
    void run(async () =>
      setResult(await api.post<ScanResponse>('/ai/scan-prescription', await prepareImage(file))),
    );
  };

  return (
    <Dialog open={open} title={t('scan.title')} onClose={onClose}>
      <div className="stack" aria-busy={busy}>
        <p className="muted">{t('scan.lede')}</p>
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFile}
        />
        <button
          type="button"
          className="btn btn-primary btn-large"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          <Camera aria-hidden="true" />
          {busy ? t('scan.reading') : t('scan.choose')}
        </button>
        <FormError message={error} />
        {result && (
          <div className="stack" aria-live="polite">
            {result.medications.length === 0 ? (
              <p>{t('scan.none')}</p>
            ) : (
              <>
                <p>{t('scan.found', { count: result.medications.length })}</p>
                <ul className="drafts list">
                  {result.medications.map((draft, i) => (
                    <li key={`${draft.name}-${i}`} className="draft">
                      <div>
                        <strong>
                          {draft.name} {draft.dose}
                        </strong>
                        <div className="muted small">
                          {draft.times.join(', ')} ·{' '}
                          {t('scan.confidence', { pct: Math.round(draft.confidence * 100) })}
                        </div>
                      </div>
                      <button type="button" className="btn" onClick={() => onUse(draft)}>
                        {t('scan.use')}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <AiNote source={result.source} />
          </div>
        )}
      </div>
    </Dialog>
  );
}
