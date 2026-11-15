import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiErrorBody } from '../../shared/api';
import type { Actor, Deps } from '../context';
import { AppError } from '../errors';
import { readCookie, SESSION_COOKIE } from '../security/session';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    actor?: Actor;
  }
}

/** Gives each request an id, echoed in a header and in error bodies for support. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

/** Headers Helmet does not set. */
export const extraSecurityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
};

/** API responses hold personal health data: never cache them. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rejects state-changing requests from other sites. Together with
 * SameSite=Strict cookies this blocks cross-site request forgery.
 */
export const sameOrigin: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('host');
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost !== host) return next(new AppError('forbidden', 'Cross-site request blocked'));
  }
  next();
};

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter keyed by client IP. In-memory per instance,
 * which is enough to blunt guessing and abuse at this scale.
 */
export function rateLimit(
  name: string,
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
): RequestHandler {
  const windows = new Map<string, Window>();
  return (req, res, next) => {
    const time = now();
    const key = `${name}:${req.ip ?? 'unknown'}`;
    let window = windows.get(key);
    if (!window || window.resetAt <= time) {
      window = { count: 0, resetAt: time + windowMs };
      windows.set(key, window);
      if (windows.size > 10_000) for (const [k, w] of windows) if (w.resetAt <= time) windows.delete(k);
    }
    window.count += 1;
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - window.count)));
    if (window.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((window.resetAt - time) / 1000)));
      return next(new AppError('rate_limited', 'Too many requests. Please wait a moment.'));
    }
    next();
  };
}

/** Loads the signed-in member fresh on every request, so access changes apply at once. */
export function authenticate(deps: Deps): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = readCookie(req.get('cookie'), SESSION_COOKIE);
    const claims = token ? await deps.sessions.verify(token, deps.clock.now()) : null;
    if (!claims) return next(new AppError('unauthenticated', 'Please sign in'));
    const [circle, member] = await Promise.all([
      deps.repo.getCircle(claims.circleId),
      deps.repo.getMember(claims.circleId, claims.memberId),
    ]);
    if (!circle || !member) return next(new AppError('unauthenticated', 'Please sign in'));
    req.actor = { circle, member };
    next();
  };
}

/** The authenticated actor. Only call on routes behind `authenticate`. */
export function actorOf(req: Request): Actor {
  if (!req.actor) throw new AppError('unauthenticated', 'Please sign in');
  return req.actor;
}

/** Turns any error into the API's single error shape; internals never leak to the client. */
export function errorHandler(deps: Deps): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    let appError: AppError;
    if (error instanceof AppError) appError = error;
    else if ((error as { type?: string }).type === 'entity.too.large') {
      appError = new AppError('payload_too_large', 'That is too large to upload');
    } else if ((error as { type?: string }).type === 'entity.parse.failed') {
      appError = new AppError('invalid_input', 'The request could not be read');
    } else {
      appError = new AppError('internal', 'Something went wrong. Please try again.');
      deps.logger.error('unhandled error', { requestId: req.id, path: req.path, error: String(error) });
    }
    const body: ApiErrorBody = {
      error: {
        code: appError.code,
        message: appError.message,
        requestId: req.id,
        ...(appError.fields ? { fields: appError.fields } : {}),
      },
    };
    res.status(appError.status).json(body);
  };
}
