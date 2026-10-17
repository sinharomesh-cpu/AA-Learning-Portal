import type { UsualTime } from './usualTimes';

/**
 * "Looking for students" listings (PR-D2, board D5): shared types and wording, safe in the
 * browser and on the server.
 */

export const PRICE_MODELS = ['hourly', 'weekly', 'biweekly', 'monthly'] as const;
export type PriceModel = (typeof PRICE_MODELS)[number];
export const CURRENCIES = ['INR', 'SGD', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const PRICES_MAX = 3;
/** Sessions are at most 40 minutes (Zoom basic, K-5). */
export const SESSION_MINUTES_MAX = 40;
export const SESSION_MINUTES_MIN = 10;

export const PRICE_MODEL_LABEL: Record<PriceModel, string> = {
  hourly: 'Hourly',
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
};

export interface ListingPrice {
  model: PriceModel;
  currency: Currency;
  /** Smallest unit (paise, cents). */
  amountMinor: number;
  /** Sessions included; null for hourly. */
  sessions: number | null;
  /** Minutes per session, 10–40. */
  minutes: number;
}

/**
 * Exactly what the public sees on a listing: the teacher agrees to these details when they
 * publish (OC-77(1)). Never contact details, accounts or anything about children.
 */
export interface ListingSnapshot {
  name: string;
  subjects: string[];
  grades: number[];
  curricula: string[];
  experienceYears: number | null;
  bio: string;
  timeZone: string;
  usualTimes: UsualTime[];
  prices: ListingPrice[];
  /** An approved photo the teacher agreed to show, or null for their initial. */
  photoId: string | null;
}

const SYMBOL: Record<Currency, string> = { INR: '₹', SGD: 'S$', USD: 'US$' };

/** "₹4,000", "S$45.50", "US$30": always the listing's own currency, never converted (OC-76(4)). */
export function formatAmount(currency: Currency, amountMinor: number): string {
  const whole = amountMinor % 100 === 0;
  const n = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
  return `${SYMBOL[currency]}${n}`;
}

/** "₹600 per hour · 40-minute sessions", "₹4,000 a month · 8 sessions × 40 min". */
export function describePrice(p: ListingPrice): string {
  const amount = formatAmount(p.currency, p.amountMinor);
  if (p.model === 'hourly') return `${amount} per hour · ${p.minutes}-minute sessions`;
  const period = { weekly: 'a week', biweekly: 'every two weeks', monthly: 'a month' }[p.model];
  const sessions = `${p.sessions} ${p.sessions === 1 ? 'session' : 'sessions'}`;
  return `${amount} ${period} · ${sessions} × ${p.minutes} min`;
}

export type PriceProblem = 'count' | 'model' | 'currency' | 'amount' | 'sessions' | 'minutes';

export function checkPrices(prices: ListingPrice[]): PriceProblem | null {
  if (prices.length > PRICES_MAX) return 'count';
  for (const p of prices) {
    if (!(PRICE_MODELS as readonly string[]).includes(p.model)) return 'model';
    if (!(CURRENCIES as readonly string[]).includes(p.currency)) return 'currency';
    if (!Number.isInteger(p.amountMinor) || p.amountMinor < 1 || p.amountMinor > 100_000_000) return 'amount';
    if (
      p.model === 'hourly'
        ? p.sessions !== null
        : !(Number.isInteger(p.sessions) && p.sessions! >= 1 && p.sessions! <= 31)
    )
      return 'sessions';
    if (!Number.isInteger(p.minutes) || p.minutes < SESSION_MINUTES_MIN || p.minutes > SESSION_MINUTES_MAX)
      return 'minutes';
  }
  return null;
}

/** "600", "45.5" → smallest unit; null when not a positive amount with at most 2 decimals. */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return minor >= 1 ? minor : null;
}

/** Stable text of a snapshot, for "has anything public changed?" checks. */
export function snapshotKey(s: ListingSnapshot): string {
  return JSON.stringify([
    s.name,
    [...s.subjects].sort(),
    [...s.grades].sort((a, b) => a - b),
    s.curricula,
    s.experienceYears,
    s.bio,
    s.timeZone,
    s.usualTimes.map((u) => [u.weekday, u.start, u.end]),
    s.prices.map((p) => [p.model, p.currency, p.amountMinor, p.sessions, p.minutes]),
    s.photoId,
  ]);
}

/** Days shown, renewal and reminder (L-2). */
export const LISTING_DAYS = 60;
export const REMINDER_DAYS = 7;
