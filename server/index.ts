import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FirestoreRepository } from './adapters/firestore/repository';
import { GeminiClient, unavailableAi } from './adapters/gemini/client';
import { GmailMailer, LogMailer } from './adapters/gmail/mailer';
import { MemoryRepository } from './adapters/memory/repository';
import { createApp } from './app';
import { loadConfig } from './config';
import type { Deps } from './context';
import { jsonLogger } from './logger';
import { systemClock } from './ports/services';
import { ActionLinkSigner } from './security/actionLinks';
import { SessionSigner } from './security/session';
import { denyAllVerifier, schedulerOidcVerifier, sharedSecretVerifier } from './security/trigger';

/** Process entry point: wires real adapters from configuration and starts listening. */
const config = loadConfig();
const logger = jsonLogger();

const deps: Deps = {
  repo:
    config.dataBackend === 'firestore'
      ? new FirestoreRepository(process.env.GOOGLE_CLOUD_PROJECT)
      : new MemoryRepository(),
  clock: systemClock,
  mailer: config.gmail ? new GmailMailer(config.gmail.user, config.gmail.appPassword) : new LogMailer(logger),
  ai: config.gemini.apiKey
    ? new GeminiClient(config.gemini.apiKey, [config.gemini.model, config.gemini.fallbackModel], logger)
    : unavailableAi,
  sessions: new SessionSigner(config.sessionSecret),
  links: new ActionLinkSigner(config.linkSecret),
  verifyTrigger: config.schedulerServiceAccount
    ? schedulerOidcVerifier(`${config.appUrl}/api/internal`, config.schedulerServiceAccount)
    : config.tickSecret
      ? sharedSecretVerifier(config.tickSecret)
      : denyAllVerifier,
  logger,
  appUrl: config.appUrl,
  secureCookies: config.isProduction,
};

const here = path.dirname(fileURLToPath(import.meta.url));
const app = createApp(deps, { staticDir: path.resolve(here, '../web'), isProduction: config.isProduction });

const server = app.listen(config.port, () => {
  logger.info('saanjh listening', {
    port: config.port,
    storage: config.dataBackend,
    gemini: deps.ai.available,
    email: config.gmail ? 'gmail' : 'log',
  });
});

// Cloud Run sends SIGTERM before stopping an instance: finish in-flight requests first.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info('shutting down', { signal });
    server.close(() => process.exit(0));
  });
}
