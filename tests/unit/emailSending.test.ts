// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { EmailTemplate } from '@/server/auth/outbox';
import { DEFAULT_LIMITS, readEmailConfig } from '@/server/email/config';
import { RESEND_ENDPOINT, sendWithResend } from '@/server/email/resend';
import { renderEmail } from '@/server/email/templates';

/** OC-133: Resend free plan, ₹0. Synthetic addresses and a fake API only; nothing is sent. */
const KEY = 're_test_000000000000';
const BASE = {
  EMAIL_PROVIDER: 'resend',
  EMAIL_SENDING: 'on',
  EMAIL_PROVIDER_API_KEY: KEY,
  EMAIL_FROM_ADDRESS: 'AA Pro <no-reply@send.aapro-sample.org>',
  EMAIL_ALLOWED_RECIPIENTS: 'delivered@resend.dev, Bounced@resend.dev',
};

describe('sending switch', () => {
  it('is off unless every setting is present and valid', () => {
    expect(readEmailConfig({}).mode).toBe('off');
    expect(readEmailConfig({ ...BASE, EMAIL_SENDING: '' }).mode).toBe('off');
    expect(readEmailConfig({ ...BASE, EMAIL_PROVIDER: 'sendgrid' }).mode).toBe('off');
    expect(readEmailConfig({ ...BASE, EMAIL_PROVIDER_API_KEY: '' }).mode).toBe('off');
    expect(readEmailConfig({ ...BASE, EMAIL_PROVIDER_API_KEY: 'sk_live_x' }).mode).toBe('off');
    expect(readEmailConfig({ ...BASE, EMAIL_FROM_ADDRESS: 'nobody' }).mode).toBe('off');
    expect(readEmailConfig({ ...BASE, EMAIL_ALLOWED_RECIPIENTS: '' }).mode).toBe('off');
    expect(readEmailConfig({ ...BASE, EMAIL_ALLOWED_RECIPIENTS: 'not-an-address' }).mode).toBe('off');
    // The sample-data preview never sends.
    expect(readEmailConfig({ ...BASE, AA_DEMO_MODE: 'true', NODE_ENV: 'development' }).mode).toBe('off');
  });

  it('keeps AA Pro under the free plan and to the test list by default', () => {
    const c = readEmailConfig(BASE);
    if (c.mode !== 'resend') throw new Error(c.reason);
    expect(c.perDay).toBe(DEFAULT_LIMITS.perDay);
    expect(c.perMonth).toBe(DEFAULT_LIMITS.perMonth);
    expect([...(c.allowedRecipients ?? [])]).toEqual(['delivered@resend.dev', 'bounced@resend.dev']);
    expect(readEmailConfig({ ...BASE, EMAIL_DAILY_LIMIT: '101' }).mode).toBe('off');
    expect(readEmailConfig({ ...BASE, EMAIL_MONTHLY_LIMIT: '3001' }).mode).toBe('off');
    expect(readEmailConfig({ ...BASE, EMAIL_DAILY_LIMIT: '5' })).toMatchObject({ perDay: 5 });
    expect(readEmailConfig({ ...BASE, EMAIL_ALLOW_ALL_RECIPIENTS: 'true' })).toMatchObject({ allowedRecipients: null });
  });

  it("Resend's shared test sender works only with a test list", () => {
    const testing = { ...BASE, EMAIL_FROM_ADDRESS: 'onboarding@resend.dev' };
    expect(readEmailConfig(testing).mode).toBe('resend');
    expect(readEmailConfig({ ...testing, EMAIL_ALLOW_ALL_RECIPIENTS: 'true' }).mode).toBe('off');
  });
});

const ALL: EmailTemplate[] = [
  'confirm_email',
  'account_exists',
  'password_reset',
  'password_changed',
  'teacher_added_by_parent',
  'teacher_approved_set_password',
  'parent_teacher_approved',
  'parent_teacher_not_approved',
  'teacher_linked_to_child',
  'teacher_link_request',
  'parent_link_request_accepted',
  'parent_link_request_declined',
  'parent_link_request_expired',
  'rate_proposal_received',
  'rate_counter_offer',
  'rate_proposal_accepted',
  'rate_proposal_declined',
  'rate_proposal_withdrawn',
  'rate_proposal_expired',
  'child_locked',
  'child_password_reset',
  'owner_set_password',
  'admin_invite',
  'account_created_set_password',
  'account_email_changed',
  'teacher_approved',
  'teacher_not_approved',
  'teacher_changes_requested',
  'teacher_profile_change_approved',
  'teacher_profile_change_declined',
  'parent_teacher_link_ended',
  'parent_teacher_subjects_reduced',
  'listing_expiry_reminder',
  'enquiry_received',
  'enquiry_accepted',
  'enquiry_declined',
];

describe('email words', () => {
  it('every queued template has a subject, text and HTML', () => {
    for (const t of ALL) {
      const r = renderEmail(t, {
        name: 'Sample Parent',
        link: 'https://aapro-sample.org/x',
        when: '2026-10-22T03:00:00Z',
      });
      expect(r, t).not.toBeNull();
      expect(r!.subject.length, t).toBeGreaterThan(5);
      expect(r!.text, t).toContain('AA Pro');
      expect(r!.html, t).toContain('<html');
    }
    expect(renderEmail('nope', {})).toBeNull();
  });

  it('a reset link is the button, with its lifetime; dates in India time', () => {
    const r = renderEmail('password_reset', {
      name: 'Asha',
      link: 'https://aapro-sample.org/reset-password?token=abc',
    })!;
    expect(r.text).toContain('Choose a new password: https://aapro-sample.org/reset-password?token=abc');
    expect(r.text).toContain('30 minutes');
    expect(renderEmail('password_changed', { name: 'A', when: '2026-10-22T03:00:00Z' })!.text).toContain(
      '22 October 2026 at 08:30 (India time)',
    );
  });

  it('escapes everything in the HTML and never links anything but http(s)', () => {
    const r = renderEmail('enquiry_accepted', {
      name: '<script>alert(1)</script>',
      teacher: 'Ms "Quote" & Co',
      link: 'javascript:alert(1)',
    })!;
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.html).toContain('Ms &quot;Quote&quot; &amp; Co');
    expect(r.html).not.toContain('javascript:');
    expect(r.text).not.toContain('javascript:');
    expect(renderEmail('enquiry_accepted', { teacher: 'X\r\nBcc: someone' })!.subject).not.toMatch(/[\r\n]/);
  });
});

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  };
  return { fn, calls };
}

const EMAIL = {
  from: 'AA Pro <no-reply@send.aapro-sample.org>',
  to: 'delivered@resend.dev',
  subject: 'S',
  text: 'T',
  html: '<p>T</p>',
  idempotencyKey: 'aa-pro-outbox-1',
};

describe('Resend client', () => {
  it('sends one email with the key in the header only and an idempotency key', async () => {
    const f = fakeFetch(200, { id: 'email_123' });
    expect(await sendWithResend(KEY, EMAIL, f.fn)).toEqual({ ok: true, providerId: 'email_123' });
    expect(f.calls[0]!.url).toBe(RESEND_ENDPOINT);
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers['Idempotency-Key']).toBe('aa-pro-outbox-1');
    expect(String(f.calls[0]!.init.body)).not.toContain(KEY);
    expect(JSON.parse(String(f.calls[0]!.init.body))).toMatchObject({ to: ['delivered@resend.dev'], subject: 'S' });
  });

  it('tells quotas, rate limits, set-up problems, bad emails and outages apart', async () => {
    const cases: Array<[number, unknown, Record<string, string>, unknown]> = [
      [429, { name: 'daily_quota_exceeded' }, {}, { ok: false, kind: 'quota_daily' }],
      [429, { name: 'monthly_quota_exceeded' }, {}, { ok: false, kind: 'quota_monthly' }],
      [
        429,
        { name: 'rate_limit_exceeded' },
        { 'retry-after': '2' },
        { ok: false, kind: 'retry', retryAfterSeconds: 2 },
      ],
      [401, { name: 'validation_error' }, {}, { ok: false, kind: 'auth', error: 'validation_error' }],
      [
        403,
        { name: 'validation_error', message: 'domain not verified for x@y.com' },
        {},
        { ok: false, kind: 'auth', error: 'validation_error' },
      ],
      [
        422,
        { name: 'validation_error', message: 'Invalid `to` field: bad@example.com' },
        {},
        { ok: false, kind: 'rejected', error: 'validation_error' },
      ],
      [500, { name: 'application_error' }, {}, { ok: false, kind: 'retry', retryAfterSeconds: null }],
      [409, { name: 'concurrent_idempotent_requests' }, {}, { ok: false, kind: 'retry', retryAfterSeconds: null }],
    ];
    for (const [status, body, headers, expected] of cases) {
      const r = await sendWithResend(KEY, EMAIL, fakeFetch(status, body, headers).fn);
      expect(r).toEqual(expected);
      // Error messages can contain addresses, so they are never kept.
      expect(JSON.stringify(r)).not.toContain('@');
    }
    const down = await sendWithResend(KEY, EMAIL, async () => {
      throw new Error('network down');
    });
    expect(down).toEqual({ ok: false, kind: 'retry', retryAfterSeconds: null });
  });
});
