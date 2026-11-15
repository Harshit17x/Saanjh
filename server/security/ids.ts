import { randomBytes, randomInt } from 'node:crypto';

/** Circle-code alphabet without look-alike characters (no 0/O, 1/I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CIRCLE_CODE_LENGTH = 8;

/** Random URL-safe id. */
export function newId(): string {
  return randomBytes(12).toString('base64url');
}

/** Random circle code such as `K7QM4XPA`, shown to people as `K7QM-4XPA`. */
export function newCircleCode(): string {
  let code = '';
  for (let i = 0; i < CIRCLE_CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
