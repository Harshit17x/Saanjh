import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'saanjh_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const ISSUER = 'saanjh';

export interface SessionClaims {
  circleId: string;
  memberId: string;
}

/** Signs and verifies session tokens (HS256 JWT) carried in an HttpOnly cookie. */
export class SessionSigner {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  sign(claims: SessionClaims, nowMs: number): Promise<string> {
    const iat = Math.floor(nowMs / 1000);
    return new SignJWT({ cid: claims.circleId, mid: claims.memberId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setIssuedAt(iat)
      .setExpirationTime(iat + SESSION_TTL_SECONDS)
      .sign(this.key);
  }

  /** Returns the claims of a valid token, or null for anything else. */
  async verify(token: string, nowMs: number): Promise<SessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: ['HS256'],
        currentDate: new Date(nowMs),
      });
      const { cid, mid } = payload;
      if (typeof cid !== 'string' || typeof mid !== 'string') return null;
      return { circleId: cid, memberId: mid };
    } catch {
      return null;
    }
  }
}

/** Cookie header value for a session token. */
export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearedSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

/** Reads one cookie from a Cookie header. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}
