import { describe, expect, it } from 'vitest';
import { describeAllowance } from './aiAllowance';

// Sat 17 Oct 2026, 18:00 in India.
const NOW = new Date('2026-10-17T12:30:00Z');
const TZ = 'Asia/Kolkata';

describe('AI Tutor allowance in words (OC-89(4))', () => {
  it('says when the next class is available, in the viewer’s time zone', () => {
    expect(describeAllowance({ canStart: true, active: null, nextAvailableAt: NOW }, TZ, NOW)).toBe('Available now');
    expect(
      describeAllowance({ canStart: false, active: null, nextAvailableAt: new Date('2026-10-18T11:45:00Z') }, TZ, NOW),
    ).toBe('Next: tomorrow at 5:15 pm');
    expect(
      describeAllowance({ canStart: false, active: null, nextAvailableAt: new Date('2026-10-17T15:00:00Z') }, TZ, NOW),
    ).toBe('Next: today at 8:30 pm');
    expect(
      describeAllowance(
        { canStart: false, active: { endsAt: new Date('2026-10-17T12:40:00Z') }, nextAvailableAt: NOW },
        TZ,
        NOW,
      ),
    ).toBe('Running now, ends at 6:10 pm');
  });
});
