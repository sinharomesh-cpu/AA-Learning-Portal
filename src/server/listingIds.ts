import 'server-only';
import { randomBytes } from 'node:crypto';

/** Public address /teachers/t-…: random, never the account id (P2-R3 §11.5). */
export function newPublicId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(10);
  return `t-${Array.from(bytes, (b) => alphabet[b % 36]).join('')}`;
}
