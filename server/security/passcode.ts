import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** scrypt cost parameters (N=2^15, r=8, p=1): about 50 ms per hash on Cloud Run. */
const PARAMS: ScryptOptions = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

function derive(passcode: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passcode, salt, KEY_LENGTH, PARAMS, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** Hashes a passcode with a random salt. Format: `scrypt$<salt>$<hash>` (base64url). */
export async function hashPasscode(passcode: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(passcode, salt);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** Checks a passcode against a stored hash in constant time. */
export async function verifyPasscode(passcode: string, stored: string): Promise<boolean> {
  const [scheme, saltText, hashText] = stored.split('$');
  if (scheme !== 'scrypt' || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const actual = await derive(passcode, Buffer.from(saltText, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Wrong attempts allowed before a member is locked out. */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60_000;
