import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Password hashing and policy (OC-35 = D-23a + D-37, G1-08 §3.1).
 *
 * - Argon2id with at least the OWASP baseline (19 MiB, 2 iterations, parallelism 1).
 * - Adults (parent, teacher, admins): at least 12 characters. Children: at least 8 (set by the
 *   parent). Everyone: at most 64. Spaces and passphrases allowed. No composition rules.
 * - Every password is checked against a list of common and leaked passwords that ships with
 *   the app, so no password ever leaves the server.
 * - Passwords are never logged, stored in plain text, or put in audit records.
 */
export const ARGON2_OPTIONS = {
  // Algorithm.Argon2id; the library's enum is a `const enum`, which isolated modules can't read.
  algorithm: 2 as Algorithm,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export type CredentialOwner = 'adult' | 'child';
export const MIN_LENGTH: Record<CredentialOwner, number> = { adult: 12, child: 8 };
export const MAX_LENGTH = 64;

export type CredentialProblem = 'too_short' | 'too_long' | 'common' | 'repeated';

let commonPasswords: Set<string> | null = null;
function commonList(): Set<string> {
  if (!commonPasswords) {
    const file = path.join(process.cwd(), 'src/server/auth/data/common-passwords.txt');
    commonPasswords = new Set(readFileSync(file, 'utf8').split('\n').filter(Boolean));
  }
  return commonPasswords;
}

/** Length is counted in characters as a person sees them, not bytes. */
export function passwordLength(password: string): number {
  return [...password.normalize('NFC')].length;
}

/** Returns the first problem with a new password, or null when it is acceptable. */
export function checkNewPassword(password: string, owner: CredentialOwner): CredentialProblem | null {
  const length = passwordLength(password);
  if (length < MIN_LENGTH[owner]) return 'too_short';
  if (length > MAX_LENGTH) return 'too_long';
  const normalised = password.normalize('NFC').toLowerCase();
  if (/^(.)\1*$/u.test(normalised)) return 'repeated';
  if (commonList().has(normalised) || commonList().has(normalised.trim())) return 'common';
  return null;
}

/** Plain-language message for each problem (copy from boards 59 and 62). */
export function passwordProblemMessage(problem: CredentialProblem, owner: CredentialOwner): string {
  switch (problem) {
    case 'too_short':
      return `Use at least ${MIN_LENGTH[owner]} characters. A phrase with spaces is fine.`;
    case 'too_long':
      return `Use no more than ${MAX_LENGTH} characters.`;
    case 'repeated':
    case 'common':
      return 'This password is too common or has appeared in a data leak. Please choose another one.';
  }
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password.normalize('NFC'), ARGON2_OPTIONS);
}

/** A real hash of a random value, so unknown accounts take as long to check as real ones. */
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hash(`dummy-${Math.random()}`, ARGON2_OPTIONS);
  return dummyHash;
}

/**
 * Checks a password against a stored hash. When there is no hash (unknown account, or a
 * teacher who has not set a password yet), a dummy hash is checked instead and the result is
 * always false, so the response time does not reveal whether the account exists (G1-08 §3.2).
 */
export async function verifyPassword(storedHash: string | null | undefined, password: string): Promise<boolean> {
  if (!storedHash) {
    await verify(await getDummyHash(), password.normalize('NFC')).catch(() => false);
    return false;
  }
  try {
    return await verify(storedHash, password.normalize('NFC'));
  } catch {
    return false;
  }
}
