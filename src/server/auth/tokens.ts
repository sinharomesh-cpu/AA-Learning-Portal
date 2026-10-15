import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Random tokens (session ids, one-time links, recovery codes) and keyed hashes.
 * Only hashes are stored in the database (migration 0001: 32-byte columns).
 */

/** 32 random bytes as URL-safe text, for cookies and one-time links. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 of a token, as stored in `sessions.id_hash` and `one_time_tokens.token_hash`. */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function authSecret(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AUTH_SECRET must be set to at least 32 characters.');
  }
  return Buffer.from(secret, 'utf8');
}

/**
 * Keyed hash used for sign-in throttling keys: the database never stores a submitted username,
 * email or client address, and the hash cannot be reversed without the server secret.
 */
export function keyedHash(purpose: string, value: string): Buffer {
  return createHmac('sha256', authSecret()).update(`${purpose}\u0000${value}`, 'utf8').digest();
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
