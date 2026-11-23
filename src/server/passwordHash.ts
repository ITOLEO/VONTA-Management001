import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

/**
 * Generates a salted adaptive scrypt password hash stored only on the server.
 * Format: scrypt$N$r$p$<saltHex>$<derivedHex>
 */
export function hashProjectPassword(plainPassword: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plainPassword, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString('hex');

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived}`;
}

/**
 * Verifies a plaintext password against a stored salted scrypt hash in constant time.
 */
export function verifyProjectPassword(plainPassword: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expectedHex = parts[5];

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !salt || !expectedHex) {
    return false;
  }

  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const derived = scryptSync(plainPassword, salt, expected.length, { N, r, p });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
