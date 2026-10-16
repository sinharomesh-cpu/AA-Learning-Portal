import 'server-only';
import type { Db } from '@/server/db/client';
import { SET_PASSWORD_HOURS } from './accounts';
import { type EmailTemplate, queueEmail } from './outbox';
import { hashToken, newToken } from './tokens';

/** Creates a one-time set-password link and queues it in the given email (never a password). */
export async function issueSetPassword(
  sql: Db,
  account: { id: string; email: string; name: string },
  template: EmailTemplate,
  baseUrl: string,
  now: Date,
  extra: Record<string, string> = {},
): Promise<void> {
  const token = newToken();
  await sql`INSERT INTO one_time_tokens (account_id, purpose, token_hash, expires_at, created_at)
            VALUES (${account.id}, 'set_password', ${hashToken(token)}, ${new Date(now.getTime() + SET_PASSWORD_HOURS * 3_600_000)}, ${now})`;
  await queueEmail(sql, {
    to: account.email,
    template,
    payload: { name: account.name, link: `${baseUrl}/reset-password?purpose=set_password&token=${token}`, ...extra },
    dedupeKey: `${template}:${account.id}:${now.getTime()}`,
  });
}
