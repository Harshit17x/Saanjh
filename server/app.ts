import { existsSync } from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Deps } from './context';
import { AppError } from './errors';
import {
  authenticate,
  errorHandler,
  extraSecurityHeaders,
  noStore,
  requestId,
  sameOrigin,
} from './middleware';
import { aiRoutes } from './routes/ai';
import { careRoutes } from './routes/care';
import { circleRoutes } from './routes/circle';
import { internalRoutes } from './routes/internal';
import { publicRoutes } from './routes/public';

const JSON_LIMIT = '16kb';
const SCAN_JSON_LIMIT = '1.5mb';
const ONE_YEAR_SECONDS = 31_536_000;

export interface AppOptions {
  /** Directory of the built web client; omitted in API-only tests. */
  staticDir?: string;
  isProduction?: boolean;
}

/**
 * Builds the Express app from injected dependencies. No I/O happens here,
 * so tests construct it with in-memory fakes.
 */
export function createApp(deps: Deps, options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          ...(options.isProduction ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: options.isProduction ? { maxAge: ONE_YEAR_SECONDS, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(extraSecurityHeaders);
  app.use(compression());

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', noStore, sameOrigin);
  app.use('/api/ai/scan-prescription', express.json({ limit: SCAN_JSON_LIMIT }));
  app.use('/api', express.json({ limit: JSON_LIMIT }));
  app.use('/api/internal', internalRoutes(deps));
  app.use('/api', publicRoutes(deps));
  app.use('/api', authenticate(deps));
  app.use('/api', circleRoutes(deps));
  app.use('/api', careRoutes(deps));
  app.use('/api/ai', aiRoutes(deps));
  app.use('/api', (_req, _res, next) => {
    next(new AppError('not_found', 'No such endpoint'));
  });

  const staticDir = options.staticDir;
  if (staticDir && existsSync(staticDir)) {
    app.use(
      '/assets',
      express.static(path.join(staticDir, 'assets'), {
        immutable: true,
        maxAge: ONE_YEAR_SECONDS * 1000,
        index: false,
      }),
    );
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    // Single-page app: any other GET renders the client, which handles routing.
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(errorHandler(deps));
  return app;
}
