import { describe, expect, it } from 'vitest';
import { describeTerms, parseOfferAmount } from './rateNegotiation';

describe('offer amounts (FR-040.8, T-RN-9)', () => {
  it('accepts any positive amount with up to two decimals, with or without commas', () => {
    expect(parseOfferAmount('3400')).toBe(340000);
    expect(parseOfferAmount('3,400.50')).toBe(340050);
    expect(parseOfferAmount(' 0.01 ')).toBe(1);
    expect(parseOfferAmount('99,99,99,999.99')).toBe(99999999999);
  });

  it('refuses zero, negative, malformed and over-precise amounts', () => {
    for (const bad of ['0', '0.00', '-1', '12.345', 'abc', '', '1e3', '.5', '5.', '1 000']) {
      expect(parseOfferAmount(bad)).toBeNull();
    }
  });
});

describe('describing terms', () => {
  it('uses lessons for periodic prices', () => {
    expect(describeTerms({ model: 'monthly', currency: 'INR', amountMinor: 340000, sessions: 8, minutes: 40 })).toBe(
      '₹3,400 a month · 8 lessons × 40 min',
    );
    expect(describeTerms({ model: 'weekly', currency: 'USD', amountMinor: 2000, sessions: 1, minutes: 30 })).toBe(
      'US$20 a week · 1 lesson × 30 min',
    );
    expect(describeTerms({ model: 'hourly', currency: 'SGD', amountMinor: 4550, sessions: null, minutes: 40 })).toBe(
      'S$45.50 per hour · 40-minute sessions',
    );
  });
});
