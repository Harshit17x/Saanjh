import { timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { TriggerVerifier } from '../ports/services';

const bearer = (header: string | undefined): string | null =>
  header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;

/**
 * Accepts only Google-signed OIDC tokens issued to the Cloud Scheduler
 * service account for this service's URL.
 */
export function schedulerOidcVerifier(audience: string, serviceAccount: string): TriggerVerifier {
  const client = new OAuth2Client();
  return async (header) => {
    const token = bearer(header);
    if (!token) return false;
    try {
      const ticket = await client.verifyIdToken({ idToken: token, audience });
      const payload = ticket.getPayload();
      return payload?.email === serviceAccount && payload.email_verified === true;
    } catch {
      return false;
    }
  };
}

/** Accepts a shared secret, for local development only. */
export function sharedSecretVerifier(secret: string): TriggerVerifier {
  const expected = Buffer.from(secret);
  return (header) => {
    const token = bearer(header);
    if (!token) return Promise.resolve(false);
    const actual = Buffer.from(token);
    return Promise.resolve(actual.length === expected.length && timingSafeEqual(actual, expected));
  };
}

/** Rejects every request: used when no trigger credential is configured. */
export const denyAllVerifier: TriggerVerifier = () => Promise.resolve(false);
