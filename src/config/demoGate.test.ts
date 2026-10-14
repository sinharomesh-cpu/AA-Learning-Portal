import { describe, expect, it } from 'vitest';
import { demoEnabled, demoGateError, isHostedDemo, REAL_SERVICE_SETTINGS } from './demoGate';

describe('demo-mode gate (OC-27, OC-34)', () => {
  it('is off unless AA_DEMO_MODE=true', () => {
    expect(demoEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(demoGateError({ NODE_ENV: 'production' })).toBeNull();
  });

  it('allows local development and tests', () => {
    expect(demoEnabled({ NODE_ENV: 'development', AA_DEMO_MODE: 'true' })).toBe(true);
  });

  it('refuses a production build without the approved hosted-demo flag', () => {
    const env = { NODE_ENV: 'production', AA_DEMO_MODE: 'true' };
    expect(demoGateError(env)).toMatch(/not allowed in a production build/);
    expect(demoEnabled(env)).toBe(false);
    expect(demoEnabled({ ...env, AA_HOSTED_DEMO: 'yes' })).toBe(false);
  });

  it('allows the approved hosted demo preview', () => {
    const env = { NODE_ENV: 'production', AA_DEMO_MODE: 'true', AA_HOSTED_DEMO: 'true' };
    expect(demoGateError(env)).toBeNull();
    expect(demoEnabled(env)).toBe(true);
    expect(isHostedDemo(env)).toBe(true);
  });

  it('the hosted flag alone does nothing', () => {
    expect(demoEnabled({ NODE_ENV: 'production', AA_HOSTED_DEMO: 'true' })).toBe(false);
  });

  it.each(REAL_SERVICE_SETTINGS)('refuses demo mode when %s is set', (name) => {
    for (const NODE_ENV of ['development', 'production']) {
      const env = { NODE_ENV, AA_DEMO_MODE: 'true', AA_HOSTED_DEMO: 'true', [name]: 'x' };
      expect(demoGateError(env)).toContain(name);
      expect(demoEnabled(env)).toBe(false);
    }
  });

  it('ignores empty real-service settings', () => {
    expect(demoEnabled({ NODE_ENV: 'development', AA_DEMO_MODE: 'true', DATABASE_URL: '' })).toBe(true);
  });
});
