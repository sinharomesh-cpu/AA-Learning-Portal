import { describe, expect, it } from 'vitest';
import { checkNewPassword, hashPassword, MAX_LENGTH, passwordProblemMessage, verifyPassword } from './password';

/** OC-35 (D-37) password policy and Argon2id hashing. */
describe('password policy', () => {
  it('adults need at least 12 characters, children at least 8', () => {
    expect(checkNewPassword('blue kite 7', 'adult')).toBe('too_short'); // 11
    expect(checkNewPassword('blue kite 72', 'adult')).toBeNull(); // 12
    expect(checkNewPassword('kite 7a', 'child')).toBe('too_short'); // 7
    expect(checkNewPassword('kite 72a', 'child')).toBeNull(); // 8
  });

  it('allows at most 64 characters and counts characters, not bytes', () => {
    expect(checkNewPassword('a b'.repeat(22).slice(0, MAX_LENGTH), 'adult')).toBeNull();
    expect(checkNewPassword('x y'.repeat(30), 'adult')).toBe('too_long');
    expect(checkNewPassword('मेरी पढ़ाई की किताब', 'adult')).toBeNull(); // Hindi passphrase, 19 characters
  });

  it('accepts passphrases with spaces and has no composition rules', () => {
    expect(checkNewPassword('our family reads books', 'adult')).toBeNull();
    expect(checkNewPassword('alllowercaseletters', 'adult')).toBeNull();
  });

  it('refuses common and leaked passwords, ignoring case', () => {
    expect(checkNewPassword('password', 'child')).toBe('common');
    expect(checkNewPassword('PASSWORD1', 'child')).toBe('common');
    expect(checkNewPassword('qwertyuiop', 'child')).toBe('common');
  });

  it('refuses one character repeated', () => {
    expect(checkNewPassword('aaaaaaaaaaaa', 'adult')).toBe('repeated');
  });

  it('explains each problem in plain words', () => {
    expect(passwordProblemMessage('too_short', 'adult')).toMatch(/at least 12/);
    expect(passwordProblemMessage('too_short', 'child')).toMatch(/at least 8/);
    expect(passwordProblemMessage('common', 'adult')).toMatch(/too common or has appeared in a data leak/);
  });
});

describe('hashing', () => {
  it('uses Argon2id with the OWASP baseline and verifies correctly', async () => {
    const stored = await hashPassword('our family reads books');
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(stored).not.toContain('our family');
    expect(await verifyPassword(stored, 'our family reads books')).toBe(true);
    expect(await verifyPassword(stored, 'our family reads book')).toBe(false);
  });

  it('a missing hash never verifies, but still does the same work', async () => {
    expect(await verifyPassword(null, 'anything at all')).toBe(false);
    expect(await verifyPassword(undefined, '')).toBe(false);
  });

  it('two hashes of the same password differ (salted)', async () => {
    expect(await hashPassword('same passphrase here')).not.toBe(await hashPassword('same passphrase here'));
  });
});
