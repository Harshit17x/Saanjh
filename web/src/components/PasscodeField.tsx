import { Delete } from 'lucide-react';
import { useI18n } from '../i18n';
import { FieldShell } from './ui';

const LENGTH = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface Props {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'new-password' | 'current-password';
}

/**
 * Six-digit passcode: a normal labelled input for keyboards and password
 * managers, plus a large on-screen keypad for people who find small keys hard.
 */
export function PasscodeField({ label, hint, error, value, onChange, autoComplete }: Props) {
  const { t } = useI18n();
  const press = (digit: string) => {
    if (value.length < LENGTH) onChange(value + digit);
  };
  return (
    <div className="stack">
      <FieldShell label={label} hint={hint} error={error}>
        {({ inputId, describedBy, invalid }) => (
          <input
            id={inputId}
            className="passcode-input"
            type="password"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={LENGTH}
            autoComplete={autoComplete}
            required
            value={value}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, LENGTH))}
          />
        )}
      </FieldShell>
      <div className="keypad" role="group" aria-label={label}>
        {KEYS.map((key) => (
          <button key={key} type="button" onClick={() => press(key)}>
            {key}
          </button>
        ))}
        <button type="button" onClick={() => onChange('')} aria-label={t('passcode.clear')}>
          <span aria-hidden="true">C</span>
        </button>
        <button type="button" onClick={() => press('0')}>
          0
        </button>
        <button type="button" onClick={() => onChange(value.slice(0, -1))} aria-label={t('passcode.delete')}>
          <Delete aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
