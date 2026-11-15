import { useCallback, useState } from 'react';
import { ApiError, messageOf } from '../api/client';

const NO_FIELDS: Record<string, string> = {};

export interface ActionState {
  /** The last failure, ready to show in a FormError; null when the last run succeeded. */
  error: string | null;
  /** Per-field messages from a rejected form, keyed by field name. */
  fields: Record<string, string>;
  /** True while an action is running, for disabling buttons and aria-busy. */
  busy: boolean;
  /** Runs an async action, clearing old errors first and capturing new ones. Resolves true on success. */
  run: (action: () => Promise<unknown>) => Promise<boolean>;
}

/**
 * One place for the clear-errors / try / show-errors pattern used by every
 * button and form that calls the API.
 */
export function useAction(): ActionState {
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState(NO_FIELDS);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (action: () => Promise<unknown>) => {
    setError(null);
    setFields(NO_FIELDS);
    setBusy(true);
    try {
      await action();
      return true;
    } catch (err) {
      setError(messageOf(err));
      if (err instanceof ApiError) setFields(err.fields);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { error, fields, busy, run };
}
