import { describe, expect, it } from 'vitest';
import { isTestEnvironment, testEnvGateError } from './testEnv';

describe('hosted test environment gate (OC-57)', () => {
  it('is off unless switched on', () => {
    expect(isTestEnvironment({})).toBe(false);
    expect(testEnvGateError({})).toBeNull();
  });
  it('needs an access password of at least 16 characters', () => {
    expect(testEnvGateError({ AA_TEST_ENVIRONMENT: 'true' })).toMatch(/AA_TEST_ACCESS_PASSWORD/);
    expect(testEnvGateError({ AA_TEST_ENVIRONMENT: 'true', AA_TEST_ACCESS_PASSWORD: 'x'.repeat(5) })).toMatch(/16/);
    expect(testEnvGateError({ AA_TEST_ENVIRONMENT: 'true', AA_TEST_ACCESS_PASSWORD: 'x'.repeat(16) })).toBeNull();
  });
  it('cannot be combined with demo mode', () => {
    expect(
      testEnvGateError({ AA_TEST_ENVIRONMENT: 'true', AA_DEMO_MODE: 'true', AA_TEST_ACCESS_PASSWORD: 'x'.repeat(20) }),
    ).toMatch(/demo/i);
  });
});
