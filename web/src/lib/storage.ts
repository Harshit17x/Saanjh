/**
 * Per-device preferences in localStorage. Storage can be unavailable
 * (private mode, blocked site data), so every access is guarded and the
 * app works without it.
 */
const PREFIX = 'saanjh.';

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Preference simply is not remembered.
  }
}
