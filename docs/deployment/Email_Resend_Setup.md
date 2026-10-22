# Email with Resend (free plan only) — setup guide

Decision: OC-133. Budget: **₹0**. Status: code ready, **sending off** until the owner completes the
manual steps below and approves switching it on.

## 1. What the code does

AA Pro already queued every email in the `email_outbox` table and showed it in the test mailbox
(`/dev/mailbox`). Nothing was sent. Now, after a page that queues an email has answered the user,
the server sends queued emails through Resend's API (`src/server/email/`):

- **Same sign-in flow.** No new authentication system. Confirm-email, password-reset, set-password
  and account notices are the existing emails; only delivery is added.
- **Off by default.** Sending happens only when every setting in section 4 is present and valid.
  Anything missing or odd means off. The sample-data preview (`AA_DEMO_MODE=true`) never sends.
- **Test recipients only.** Only addresses in `EMAIL_ALLOWED_RECIPIENTS` are sent to. Emails to
  anyone else stay in the outbox untouched. Sending to everyone needs
  `EMAIL_ALLOW_ALL_RECIPIENTS=true` and the owner's written approval.
- **Within the free plan.** AA Pro stops itself at 90 a day and 2,900 a month (adjustable, never
  above 100 / 3,000). If Resend reports a quota, sending pauses until the next UTC day or month;
  emails stay queued. There is **no fallback** to another service and no paid plan.
- **Errors.**
  - Bad address / rejected email → marked `failed`, other emails continue.
  - Wrong key, unverified domain, testing-mode restriction → sending pauses for one hour.
  - Too many requests / Resend outage / network error → stops; emails stay queued and are tried
    again the next time something queues an email (there is no background scheduler yet).
  - Each email is sent with an `Idempotency-Key`, so a retry cannot send it twice.
  - Only one sender runs at a time (database lock).
- **Links and privacy.** A reset link is not sent after 30 minutes, a confirmation link after
  24 hours, others after 72 hours. After an email is sent or abandoned, its one-time link is
  removed from the outbox. The audit log records only the outbox id, template, outcome and
  Resend's message id: no address, no link, no token. Resend's error messages are not stored.
- **Secrets.** The API key is read on the server only and only placed in the request header.
  It is never logged or shown. It must never be a `NEXT_PUBLIC_` variable.

Watch it in **Admin → Audit log**: `Email sent`, `Email failed`, `Email not sent (link expired)`,
`Email sending paused` (with the reason and until when).

## 2. Resend free plan (checked 22 Oct 2026)

| Item | Free plan |
| --- | --- |
| Price | $0 |
| Emails | 3,000 a month, 100 a day (daily count resets at midnight UTC) |
| Domains | 3 custom domains |
| Data retention | 30 days |
| Over the limit | Sending is refused (HTTP 429 `daily_quota_exceeded` / `monthly_quota_exceeded`); no overage charge on the free plan |
| Rate limit | 10 requests per second per team |
| Card | Not stated as required for the free plan; **do not add a card** |

Sources: <https://resend.com/pricing>, <https://resend.com/docs/api-reference/errors>,
<https://resend.com/docs/api-reference/rate-limit>, <https://resend.com/docs/dashboard/domains/introduction>,
<https://resend.com/docs/dashboard/emails/send-test-emails>. Re-check before signing up: plans change.

## 3. Owner steps (manual; each needs your action)

1. **Create a Resend account** (free plan) with your own email. Do not add a payment card. Do not
   choose a paid plan.
2. **Test without a domain (optional, first).** Resend's shared sender `onboarding@resend.dev` can
   only send to the Resend account's own address. Use it with `EMAIL_ALLOWED_RECIPIENTS` set to that
   address only.
3. **Choose a sending domain.** Use a subdomain such as `mail.<your-domain>` of a domain you
   already own. Buying a domain costs money and needs separate approval. Must not be a P4Bpay
   domain (AA Pro stays independent).
4. **Add the domain in Resend** and copy the DNS records it shows into your DNS provider (needs your
   approval; it changes DNS). Typically:

   | Type | Name (host) | Value | Priority |
   | --- | --- | --- | --- |
   | MX | `send` (under your chosen domain) | `feedback-smtp.<region>.amazonses.com` (exact value from Resend) | 10 |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | – |
   | TXT | `resend._domainkey` | `p=…` (DKIM key from Resend) | – |
   | TXT (recommended) | `_dmarc` | `v=DMARC1; p=none;` (start with monitoring) | – |

   Always copy the exact values from Resend's dashboard. Wait until Resend shows **Verified**.
5. **Create an API key** in Resend with **Sending access** only, limited to that domain.
6. **Add settings in Vercel** → project `aa-pro-test` → Settings → Environment Variables,
   **Production only** (never Preview, never Development, never `aa-learning-portal` unless approved):

   | Name | Value |
   | --- | --- |
   | `EMAIL_PROVIDER` | `resend` |
   | `EMAIL_PROVIDER_API_KEY` | the `re_…` key (mark Sensitive) |
   | `EMAIL_FROM_ADDRESS` | `AA Pro <no-reply@mail.your-domain>` (or `onboarding@resend.dev` for step 2) |
   | `EMAIL_ALLOWED_RECIPIENTS` | your own test address(es), comma-separated |
   | `EMAIL_DAILY_LIMIT` / `EMAIL_MONTHLY_LIMIT` | optional; leave empty for 90 / 2,900 |
   | `EMAIL_SENDING` | `on` — only when you approve the first test |

   Do not set `EMAIL_ALLOW_ALL_RECIPIENTS`. Then redeploy the test site.
7. **First test.** On the test site use "Forgot password" for a test account whose email is in the
   list. Check the inbox and the audit log.
8. **Real users later.** Only with your written approval: set `EMAIL_ALLOW_ALL_RECIPIENTS=true`.
   Note that emails queued for unlisted addresses in the last 72 hours will then be sent too;
   clear or review the outbox first.

**To switch off:** set `EMAIL_SENDING` to `off` (or delete it) and redeploy. Emails go back to
being queued only.

## 4. Settings reference

See `.env.example` and `src/server/email/config.ts`. All are server-side only.

## 5. Not covered yet

- **Contact form**: AA Pro has none. Adding one needs a design and approval and must not change the
  approved home page (OC-110).
- **Class booking confirmations and reminders**: the booking flow and a reminder scheduler are not
  built. Vercel Hobby cron runs only daily, so the 15-minute reminder needs a different free
  scheduler decision.
- **Background retries**: emails held by a rate limit or outage wait for the next email-queuing
  request.
- **Magic sign-in links**: AA Pro signs in with a password; this is unchanged.
