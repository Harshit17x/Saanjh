import type { Logger } from './ports/services';

type Severity = 'INFO' | 'WARNING' | 'ERROR';

/**
 * One JSON line per entry, the format Cloud Logging parses into structured
 * logs with a severity. Callers never pass passcodes, tokens or health data.
 */
export function jsonLogger(
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const log = (severity: Severity, message: string, fields: Record<string, unknown> = {}): void => {
    write(JSON.stringify({ severity, message, time: new Date().toISOString(), ...fields }));
  };
  return {
    info: (message, fields) => log('INFO', message, fields),
    warn: (message, fields) => log('WARNING', message, fields),
    error: (message, fields) => log('ERROR', message, fields),
  };
}
