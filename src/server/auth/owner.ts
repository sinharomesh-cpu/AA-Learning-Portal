import 'server-only';
import type { Sql } from '@/server/db/client';
import { allowRequest, looksLikeEmail, normaliseEmail, SET_PASSWORD_HOURS } from './accounts';
import { writeAudit } from './audit';
import { queueEmail, windowBucket } from './outbox';
import { hashToken, newToken } from './tokens';

/**
 * One-off Super Admin setup for the owner (OC-37, OC-50; P2-00 WP2-5).
 *
 * The owner's email is a server setting (`AA_SUPERADMIN_EMAIL`), never typed into the code.
 * The setup page works only while no Super Admin has a password yet. Whatever email is
 * typed, the page answers the same way; only the configured owner email gets a set-password
 * link (72 hours, single use). The owner then sets a password, signs in and sets up the
 * authenticator app before any admin page opens.
 */
export function ownerEmail(): string | null {
  const raw = process.env.AA_SUPERADMIN_EMAIL;
  if (!raw) return null;
  const email = normaliseEmail(raw);
  return looksLikeEmail(email) ? email : null;
}

/** True while setup can still be used: an owner email is configured and no Super Admin has a password. */
export async function ownerSetupOpen(sql: Sql): Promise<boolean> {
  if (!ownerEmail()) return false;
  const [row] = await sql<Array<{ password_hash: string | null }>>`
    SELECT password_hash FROM accounts WHERE role = 'superadmin'`;
  return !row || row.password_hash === null;
}

export async function requestOwnerSetup(
  sql: Sql,
  input: { email: string; name: string; ip?: string; baseUrl: string; timeZone?: string },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'rate_limited' | 'closed' }> {
  if (!(await ownerSetupOpen(sql))) return { ok: false, reason: 'closed' };
  if (!(await allowRequest(sql, 'owner_setup', input.ip, now))) return { ok: false, reason: 'rate_limited' };
  const owner = ownerEmail();
  const email = normaliseEmail(input.email);
  if (!owner || email !== owner) {
    await writeAudit(sql, { type: 'OWNER_SETUP_REQUESTED', outcome: 'denied' }, now);
    return { ok: true };
  }
  const name = input.name.normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, 80) || 'Owner';
  await sql.begin(async (tx) => {
    const [existing] = await tx<Array<{ id: string; email: string }>>`
      SELECT id, email FROM accounts WHERE role = 'superadmin' FOR UPDATE`;
    let accountId = existing?.id;
    if (existing && existing.email !== email) return; // a different owner email was set up earlier
    if (!accountId) {
      const [row] = await tx<Array<{ id: string }>>`
        INSERT INTO accounts (role, status, email, display_name, time_zone, created_at, updated_at)
        VALUES ('superadmin', 'active', ${email}, ${name}, ${input.timeZone ?? 'Asia/Kolkata'}, ${now}, ${now})
        RETURNING id`;
      accountId = row!.id;
    }
    const token = newToken();
    const queued = await queueEmail(tx, {
      to: email,
      template: 'owner_set_password',
      payload: { name, link: `${input.baseUrl}/reset-password?purpose=set_password&token=${token}` },
      dedupeKey: `owner_set_password:${accountId}:${windowBucket(now, 15)}`,
    });
    if (queued) {
      await tx`INSERT INTO one_time_tokens (account_id, purpose, token_hash, expires_at, created_at)
               VALUES (${accountId}, 'set_password', ${hashToken(token)},
                       ${new Date(now.getTime() + SET_PASSWORD_HOURS * 3_600_000)}, ${now})`;
    }
    await writeAudit(tx, { type: 'OWNER_SETUP_REQUESTED', outcome: 'success', subjectId: accountId }, now);
  });
  return { ok: true };
}
