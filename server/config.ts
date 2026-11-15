import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const MIN_SECRET_LENGTH = 32;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  APP_URL: z.url().default('http://localhost:5173'),
  DATA_BACKEND: z.enum(['memory', 'firestore']).default('memory'),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-flash-lite-latest'),
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  LINK_SECRET: z.string().optional(),
  SCHEDULER_SA: z.string().optional(),
  TICK_SECRET: z.string().optional(),
});

export interface Config {
  isProduction: boolean;
  port: number;
  appUrl: string;
  dataBackend: 'memory' | 'firestore';
  gemini: { apiKey: string | null; model: string; fallbackModel: string };
  gmail: { user: string; appPassword: string } | null;
  sessionSecret: string;
  linkSecret: string;
  schedulerServiceAccount: string | null;
  tickSecret: string | null;
}

function secret(name: string, value: string | undefined, isProduction: boolean): string {
  if (value && value.length >= MIN_SECRET_LENGTH) return value;
  if (isProduction) throw new Error(`${name} must be set to at least ${MIN_SECRET_LENGTH} characters`);
  // Local development: a random per-process secret, so nothing weak is ever hard-coded.
  return randomBytes(48).toString('base64url');
}

const blankToUndefined = (env: NodeJS.ProcessEnv): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === '' ? undefined : v]));

/** Reads and validates configuration from the environment. Fails fast in production. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(blankToUndefined(env));
  const isProduction = parsed.NODE_ENV === 'production';
  return {
    isProduction,
    port: parsed.PORT,
    appUrl: parsed.APP_URL.replace(/\/$/, ''),
    dataBackend: parsed.DATA_BACKEND,
    gemini: {
      apiKey: parsed.GEMINI_API_KEY ?? null,
      model: parsed.GEMINI_MODEL,
      fallbackModel: parsed.GEMINI_FALLBACK_MODEL,
    },
    gmail:
      parsed.GMAIL_USER && parsed.GMAIL_APP_PASSWORD
        ? { user: parsed.GMAIL_USER, appPassword: parsed.GMAIL_APP_PASSWORD }
        : null,
    sessionSecret: secret('SESSION_SECRET', parsed.SESSION_SECRET, isProduction),
    linkSecret: secret('LINK_SECRET', parsed.LINK_SECRET, isProduction),
    schedulerServiceAccount: parsed.SCHEDULER_SA ?? null,
    tickSecret: parsed.TICK_SECRET ?? null,
  };
}
