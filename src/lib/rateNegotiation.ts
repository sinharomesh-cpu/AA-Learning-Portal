import { describePrice, formatAmount, type Currency, type PriceModel } from './listing';

/**
 * Teacher rate negotiation (CR-13; FR-040; OC-99, OC-100). Shared by the server rules and the
 * parent and teacher screens (boards RN1–RN7). Safe in the browser.
 */

/** FR-040.11: at most six offers, counting the first proposal. */
export const OFFERS_MAX = 6;
/** FR-040.12: each new offer gives the other side this many days. */
export const ANSWER_DAYS = 14;
/** FR-040.15: after a decline by either side. */
export const DECLINE_WAIT_DAYS = 7;
/** Ended negotiations stay listed for this long; answers show as "New for you" for NOTICE_DAYS. */
export const ENDED_SHOWN_DAYS = 30;
export const NOTICE_DAYS = 7;
export const MESSAGE_MAX = 500;

/** FR-040.16 defaults; the Super Admin changes them (platform_settings). */
export const DEFAULT_RATE_LIMITS = { activePerParent: 5, newPerDay: 10 };
export const RATE_LIMIT_RANGES = {
  activePerParent: { min: 1, max: 50 },
  newPerDay: { min: 1, max: 100 },
};

export type NegotiationStatus = 'pending' | 'countered' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
export type Side = 'parent' | 'teacher';
export const isActiveStatus = (s: NegotiationStatus) => s === 'pending' || s === 'countered';

/**
 * Offer amounts (FR-040.8, OC-99 (8)): any positive amount in the price's currency, with at most
 * two decimal places. Commas are allowed as separators. Returns the smallest unit, or null.
 */
export function parseOfferAmount(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor >= 1 ? minor : null;
}

export interface OfferTerms {
  model: PriceModel;
  currency: Currency;
  amountMinor: number;
  sessions: number | null;
  minutes: number;
}

/** "₹3,400 a month · 8 lessons × 40 min". */
export const describeTerms = (t: OfferTerms) =>
  describePrice({ ...t }).replace(/sessions? ×/, (m) => (m.startsWith('session ') ? 'lesson ×' : 'lessons ×'));

export const amountText = (t: Pick<OfferTerms, 'currency' | 'amountMinor'>) => formatAmount(t.currency, t.amountMinor);

/** "a month", "per hour" … for form labels. */
export const PER_PERIOD: Record<PriceModel, string> = {
  hourly: 'per hour',
  weekly: 'a week',
  biweekly: 'every two weeks',
  monthly: 'a month',
};

export const LESSONS_LABEL: Record<Exclude<PriceModel, 'hourly'>, string> = {
  weekly: 'Lessons a week',
  biweekly: 'Lessons every two weeks',
  monthly: 'Lessons a month',
};

export const PAYMENT_NOTE = 'AA Pro does not collect or process payments. You and the teacher agree payment directly.';
