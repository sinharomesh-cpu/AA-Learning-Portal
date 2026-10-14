import { afterEach, describe, expect, it, vi } from 'vitest';
import { clockNow } from './clock';

describe('demo clock', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the real clock by default', () => {
    const before = Date.now();
    expect(clockNow().getTime()).toBeGreaterThanOrEqual(before);
  });

  it('is pinned only in demo mode', () => {
    vi.stubEnv('AA_DEMO_CLOCK', '12:00');
    vi.stubEnv('AA_DEMO_MODE', 'false');
    expect(Math.abs(clockNow().getTime() - Date.now())).toBeLessThan(1000);
    vi.stubEnv('AA_DEMO_MODE', 'true');
    const pinned = clockNow();
    const hm = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(pinned);
    expect(hm).toBe('12:00');
  });

  it('ignores a malformed value', () => {
    vi.stubEnv('AA_DEMO_MODE', 'true');
    vi.stubEnv('AA_DEMO_CLOCK', '25:99');
    expect(Math.abs(clockNow().getTime() - Date.now())).toBeLessThan(1000);
  });
});
