import { createHmac, timingSafeEqual } from 'node:crypto';
import { newId } from './ids';

export type LinkAction = 'take' | 'skip';

export interface LinkPayload {
  /** Dose id. */
  d: string;
  /** Member the link was sent to; actions are recorded as theirs. */
  m: string;
  a: LinkAction;
  /** Expiry, epoch ms. */
  exp: number;
  /** Unique id, so each link works once. */
  j: string;
}

export const LINK_TTL_MS = 12 * 60 * 60_000;

/**
 * Signs the one-tap links in reminder emails: `<payload>.<hmac>`, both
 * base64url. Links are bound to one dose, one member and one action.
 */
export class ActionLinkSigner {
  constructor(private readonly secret: string) {}

  private mac(payload: string): Buffer {
    return createHmac('sha256', this.secret).update(payload).digest();
  }

  sign(doseId: string, memberId: string, action: LinkAction, nowMs: number): string {
    const payload: LinkPayload = { d: doseId, m: memberId, a: action, exp: nowMs + LINK_TTL_MS, j: newId() };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.mac(encoded).toString('base64url')}`;
  }

  /** The payload of an authentic, unexpired token, or null. */
  verify(token: string, nowMs: number): LinkPayload | null {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;
    const expected = this.mac(encoded);
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<LinkPayload>;
      if (
        typeof payload.d !== 'string' ||
        typeof payload.m !== 'string' ||
        (payload.a !== 'take' && payload.a !== 'skip') ||
        typeof payload.exp !== 'number' ||
        typeof payload.j !== 'string'
      ) {
        return null;
      }
      return payload.exp > nowMs ? (payload as LinkPayload) : null;
    } catch {
      return null;
    }
  }
}
