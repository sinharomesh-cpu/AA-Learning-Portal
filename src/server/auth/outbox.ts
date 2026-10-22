import 'server-only';
import type { Db } from '@/server/db/client';
import { sendQueuedEmailsAfterResponse } from '@/server/email/schedule';

/**
 * Email outbox (P2-00 §2, migration 0001 `email_outbox`). Every email is written here first.
 * Real sending (Resend free plan, OC-133) is off unless configured and switched on; it then
 * happens after the request, from the outbox (src/server/email). In development and tests the
 * local mailbox page shows each one. The de-duplication key makes queueing idempotent: a second
 * request with the same key inside the same window is ignored (§10 duplicate prevention).
 */
export type EmailTemplate =
  | 'confirm_email'
  | 'account_exists'
  | 'password_reset'
  | 'password_changed'
  | 'teacher_added_by_parent'
  | 'teacher_approved_set_password'
  | 'parent_teacher_approved'
  | 'parent_teacher_not_approved'
  | 'teacher_linked_to_child'
  | 'teacher_link_request'
  | 'parent_link_request_accepted'
  | 'parent_link_request_declined'
  | 'parent_link_request_expired'
  | 'rate_proposal_received'
  | 'rate_counter_offer'
  | 'rate_proposal_accepted'
  | 'rate_proposal_declined'
  | 'rate_proposal_withdrawn'
  | 'rate_proposal_expired'
  | 'child_locked'
  | 'child_password_reset'
  | 'owner_set_password'
  | 'admin_invite'
  | 'account_created_set_password'
  | 'account_email_changed'
  | 'teacher_approved'
  | 'teacher_not_approved'
  | 'teacher_changes_requested'
  | 'teacher_profile_change_approved'
  | 'teacher_profile_change_declined'
  | 'parent_teacher_link_ended'
  | 'parent_teacher_subjects_reduced'
  | 'listing_expiry_reminder'
  | 'enquiry_received'
  | 'enquiry_accepted'
  | 'enquiry_declined';

export interface QueuedEmail {
  to: string;
  template: EmailTemplate;
  /** Display values only. Never a password; one-time links are short-lived. */
  payload: Record<string, string>;
  dedupeKey: string;
}

/** Returns true when the email was queued, false when an identical one is already queued. */
export async function queueEmail(sql: Db, email: QueuedEmail): Promise<boolean> {
  for (const key of Object.keys(email.payload)) {
    if (/pass(word)?$|secret|otp/i.test(key)) throw new Error(`Email payload key "${key}" is not allowed.`);
  }
  const rows = await sql`
    INSERT INTO email_outbox (to_address, template, payload, dedupe_key)
    VALUES (${email.to}, ${email.template}, ${sql.json(email.payload)}, ${email.dedupeKey})
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id`;
  if (rows.length === 1) sendQueuedEmailsAfterResponse();
  return rows.length === 1;
}

/** Window bucket for de-duplication keys, e.g. one reset email per account per 15 minutes. */
export function windowBucket(now: Date, minutes: number): string {
  return String(Math.floor(now.getTime() / (minutes * 60_000)));
}
