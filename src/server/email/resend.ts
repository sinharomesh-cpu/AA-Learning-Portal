import 'server-only';

/**
 * Resend's send-email API, called with fetch (no SDK). Free plan only (OC-133). The API key is
 * read from the server environment and only ever placed in the Authorization header; it is
 * never logged, returned or shown. Each email carries its outbox id as the Idempotency-Key, so
 * a retry after a timeout cannot send it twice.
 */
export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}

export type SendResult =
  | { ok: true; providerId: string }
  /** Daily quota (resets at midnight UTC) or monthly quota: stop sending until then. */
  | { ok: false; kind: 'quota_daily' | 'quota_monthly' }
  /** Too many requests per second, or the service is briefly unavailable: try again later. */
  | { ok: false; kind: 'retry'; retryAfterSeconds: number | null }
  /** This email can't be sent as it is (bad address, unverified sender): give up on it. */
  | { ok: false; kind: 'rejected'; error: string }
  /** The key is wrong or suspended, or the sender domain isn't verified: stop until fixed. */
  | { ok: false; kind: 'auth'; error: string };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Only Resend's short error name is kept; messages can echo addresses, so they are dropped. */
async function errorName(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { name?: unknown };
    return typeof body.name === 'string' ? body.name.slice(0, 60) : `http_${res.status}`;
  } catch {
    return `http_${res.status}`;
  }
}

export async function sendWithResend(
  apiKey: string,
  email: OutgoingEmail,
  fetchImpl: Fetch = fetch,
): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': email.idempotencyKey,
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, kind: 'retry', retryAfterSeconds: null };
  }
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: unknown };
    return { ok: true, providerId: typeof body.id === 'string' ? body.id.slice(0, 100) : '' };
  }
  const name = await errorName(res);
  if (res.status === 429) {
    if (name === 'daily_quota_exceeded') return { ok: false, kind: 'quota_daily' };
    if (name === 'monthly_quota_exceeded') return { ok: false, kind: 'quota_monthly' };
    const after = Number(res.headers.get('retry-after'));
    return { ok: false, kind: 'retry', retryAfterSeconds: Number.isFinite(after) && after > 0 ? after : null };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, kind: 'auth', error: name };
  }
  // 409: the same idempotency key is still being processed; try again later.
  if (res.status >= 500 || res.status === 409) return { ok: false, kind: 'retry', retryAfterSeconds: null };
  return { ok: false, kind: 'rejected', error: name };
}
