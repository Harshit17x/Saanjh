import {
  useEffect,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, Check, CircleSlash, Clock, Info, Sparkles, X } from 'lucide-react';
import type { AiSource } from '../../../shared/api';
import type { DoseStatus, Role } from '../../../shared/types';
import { useI18n } from '../i18n';
import { initial } from '../lib/format';

/** Sets the document title and focuses the page heading, so screen readers hear each new page. */
export function PageHeading({
  title,
  children,
  as = 'h1',
}: {
  title: string;
  children?: ReactNode;
  as?: 'h1' | 'h2';
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} · Saanjh`;
    ref.current?.focus({ preventScroll: true });
  }, [title]);
  const Tag = as;
  return (
    <Tag ref={ref} tabIndex={-1}>
      {children ?? title}
    </Tag>
  );
}

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (ids: { inputId: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Visible label, hint and error, all wired to the control for assistive technology. */
export function FieldShell({ label, hint, error, optional, children }: FieldShellProps) {
  const { t } = useI18n();
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={inputId}>
        {label}
        {optional && <span className="muted"> ({t('common.optional')})</span>}
      </label>
      {hint && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}
      {children({ inputId, describedBy, invalid: Boolean(error) })}
      {error && (
        <span id={errorId} className="error-text">
          {error}
        </span>
      )}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
};

export function TextField({ label, hint, error, optional, ...input }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional}>
      {({ inputId, describedBy, invalid }) => (
        <input id={inputId} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...input} />
      )}
    </FieldShell>
  );
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function SelectField({ label, hint, error, children, ...select }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ inputId, describedBy, invalid }) => (
        <select id={inputId} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...select}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  error?: string;
  optional?: boolean;
};

export function TextAreaField({ label, error, optional, ...area }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} error={error} optional={optional}>
      {({ inputId, describedBy, invalid }) => (
        <textarea id={inputId} aria-describedby={describedBy} aria-invalid={invalid || undefined} {...area} />
      )}
    </FieldShell>
  );
}

/** A form-level error, announced when it appears. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="notice notice-bad" role="alert">
      <AlertTriangle aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

/** Loading and error states for a page section. */
export function LoadState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (error) {
    return (
      <div className="notice notice-bad" role="alert">
        <AlertTriangle aria-hidden="true" />
        <div>
          <p>{error}</p>
          <button type="button" className="btn" onClick={onRetry}>
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <p className="muted" role="status">
        {t('common.loading')}
      </p>
    );
  }
  return null;
}

const STATUS_STYLE: Record<DoseStatus, { className: string; Icon: typeof Check }> = {
  pending: { className: 'badge', Icon: Clock },
  taken: { className: 'badge badge-ok', Icon: Check },
  skipped: { className: 'badge', Icon: CircleSlash },
  missed: { className: 'badge badge-bad', Icon: X },
};

/** Dose status as icon and word, never colour alone. */
export function StatusBadge({ status }: { status: DoseStatus }) {
  const { t } = useI18n();
  const { className, Icon } = STATUS_STYLE[status];
  return (
    <span className={className}>
      <Icon aria-hidden="true" />
      {t(`status.${status}`)}
    </span>
  );
}

export function Avatar({ name, role, small }: { name: string; role: Role; small?: boolean }) {
  return (
    <span className={`avatar${small ? ' avatar-small' : ''}`} data-role={role} aria-hidden="true">
      {initial(name)}
    </span>
  );
}

/** Says whether an AI result came from Gemini or the rule-based fallback, plus the safety note. */
export function AiNote({ source }: { source: AiSource }) {
  const { t } = useI18n();
  return (
    <div className="stack-tight">
      <span className="ai-tag">
        {source === 'gemini' ? <Sparkles aria-hidden="true" /> : <Info aria-hidden="true" />}
        {source === 'gemini' ? t('common.aiBadge') : t('common.rulesBadge')}
      </span>
      <p className="disclaimer">
        <Info aria-hidden="true" />
        {t('common.notMedicalAdvice')}
      </p>
    </div>
  );
}

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Native modal dialog: focus is trapped and restored by the browser, Escape closes it. */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      {open && (
        <>
          <div className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              className="btn btn-ghost icon-btn"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="dialog-body">{children}</div>
        </>
      )}
    </dialog>
  );
}

/** Short confirmation with an optional action, e.g. Undo. */
export function Toast({
  message,
  action,
  onAction,
  onDone,
}: {
  message: string;
  action?: string;
  onAction?: () => void;
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, 6000);
    return () => clearTimeout(timer);
  }, [message, onDone]);
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {action && onAction && (
        <button type="button" className="btn" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
