import 'server-only';

/**
 * Email sending switch (OC-133: Resend, free plan only, ₹0). Off unless every setting below is
 * present and valid; anything missing or odd means "off", never "send anyway".
 *
 *  EMAIL_PROVIDER=resend                 the only provider supported
 *  EMAIL_PROVIDER_API_KEY=re_…           server-side only; never NEXT_PUBLIC_
 *  EMAIL_FROM_ADDRESS="AA Pro <no-reply@example.com>"   on a domain verified in Resend
 *                                        (or onboarding@resend.dev while testing with the list)
 *  EMAIL_SENDING=on                      the deliberate on-switch
 *  EMAIL_ALLOWED_RECIPIENTS=a@example.com,b@example.org   test recipients; others are not sent
 *  EMAIL_ALLOW_ALL_RECIPIENTS=true       only with the owner's written approval (real users)
 *  EMAIL_DAILY_LIMIT / EMAIL_MONTHLY_LIMIT   AA Pro's own caps, below Resend's free 100 / 3,000
 */
export const FREE_PLAN = { perDay: 100, perMonth: 3000 } as const;
export const DEFAULT_LIMITS = { perDay: 90, perMonth: 2900 } as const;

export type EmailConfig =
  | { mode: 'off'; reason: string }
  | {
      mode: 'resend';
      apiKey: string;
      from: string;
      /** null = every recipient (owner-approved); otherwise only these, lower-cased. */
      allowedRecipients: ReadonlySet<string> | null;
      perDay: number;
      perMonth: number;
    };

type Env = Record<string, string | undefined>;

const off = (reason: string): EmailConfig => ({ mode: 'off', reason });
const EMAIL = /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/;

function limit(raw: string | undefined, fallback: number, max: number): number | null {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

export function readEmailConfig(env: Env = process.env): EmailConfig {
  // The sample-data preview never sends (it refuses to start with a key set anyway).
  if (env.AA_DEMO_MODE === 'true') return off('Sample-data preview: email is never sent.');
  if ((env.EMAIL_PROVIDER ?? '') === '') return off('No email provider set.');
  if (env.EMAIL_PROVIDER !== 'resend') return off(`Unsupported email provider "${env.EMAIL_PROVIDER}".`);
  if (env.EMAIL_SENDING !== 'on') return off('Email sending is switched off (EMAIL_SENDING is not "on").');
  const apiKey = env.EMAIL_PROVIDER_API_KEY ?? '';
  if (!/^re_[A-Za-z0-9_]{8,}$/.test(apiKey)) return off('The email provider API key is missing or not a Resend key.');
  const from = (env.EMAIL_FROM_ADDRESS ?? '').trim();
  const address = from.match(/<([^>]+)>\s*$/)?.[1] ?? from;
  if (!EMAIL.test(address) || /[\r\n]/.test(from)) return off('EMAIL_FROM_ADDRESS is missing or not an email address.');
  const perDay = limit(env.EMAIL_DAILY_LIMIT, DEFAULT_LIMITS.perDay, FREE_PLAN.perDay);
  const perMonth = limit(env.EMAIL_MONTHLY_LIMIT, DEFAULT_LIMITS.perMonth, FREE_PLAN.perMonth);
  if (perDay === null || perMonth === null) {
    return off(
      `Email limits must be whole numbers within the free plan (${FREE_PLAN.perDay} a day, ${FREE_PLAN.perMonth} a month).`,
    );
  }
  let allowedRecipients: Set<string> | null;
  if (env.EMAIL_ALLOW_ALL_RECIPIENTS === 'true') {
    allowedRecipients = null;
  } else {
    const list = (env.EMAIL_ALLOWED_RECIPIENTS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!list.length || list.some((a) => !EMAIL.test(a))) {
      return off('Set EMAIL_ALLOWED_RECIPIENTS to the test addresses, or get approval to send to everyone.');
    }
    allowedRecipients = new Set(list);
  }
  // Resend's shared test sender (onboarding@resend.dev) only reaches the Resend account's own
  // address, so it is allowed for testing with a recipient list, never for real users.
  if (/@resend\.dev$/i.test(address) && allowedRecipients === null) {
    return off(
      'The resend.dev test sender can only be used with EMAIL_ALLOWED_RECIPIENTS; verify your own domain first.',
    );
  }
  return { mode: 'resend', apiKey, from, allowedRecipients, perDay, perMonth };
}
