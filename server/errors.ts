import type { z } from 'zod';

export type ErrorCode =
  | 'invalid_input'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'locked'
  | 'rate_limited'
  | 'payload_too_large'
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  locked: 423,
  rate_limited: 429,
  payload_too_large: 413,
  internal: 500,
};

/** The one error type services throw. The error middleware turns it into a response. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS[code];
  }
}

export const notFound = (what: string): AppError => new AppError('not_found', `${what} not found`);
export const forbidden = (message = 'You do not have permission to do that'): AppError =>
  new AppError('forbidden', message);

/** Parses input with a schema, or throws a 400 listing each invalid field. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'body';
    fields[key] ??= issue.message;
  }
  throw new AppError('invalid_input', 'Some details need fixing', fields);
}
