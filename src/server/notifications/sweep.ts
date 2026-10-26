import 'server-only';
import type { Sql } from '../db/client';
import { lessonMaintenance } from '../lessons';
import { closeEndedMaterialRequests } from '../materialRequests';
import { expireRateNegotiations } from '../rateNegotiations';
import { expireEnquiries } from '../teacherEnquiries';
import { expireLinkRequests } from '../teacherLinks';
import { queueListingReminders } from '../teacherListings';
import type { NotificationViewer } from './access';

/**
 * CR-16 maintenance that runs inside normal signed-in requests — no scheduler, no new service,
 * ₹0 (D-4, D-9, Q-6, Q-8, B-1 option C):
 *
 * - The shared sweep (§7.5): the three expiry sweeps, the listing-reminder sweep and, since CR-17
 *   PR 2, lesson expiry, AA Pro closes and outcome requests (src/server/lessons.ts), at most once
 *   a minute across all users and server instances. Triggered by bell refreshes and signed-in
 *   page loads. The run is claimed with one conditional UPDATE on the database clock, committed
 *   on its own before the sweep starts, so other requests never wait for it. Each sweep selects
 *   every due row (catch-up) and is idempotent.
 * - The user-scoped expiry check (§7.6): on every bell refresh of a parent or an approved, active
 *   teacher, the same expiry rules limited to the viewer's own records. Not throttled; it neither
 *   reads nor moves the shared sweep's stored time; never runs the reminder sweep or clean-up.
 * - Retention clean-up (§9): at most once an hour; read notifications 90 days after read_at,
 *   unread ones 180 days after created_at. Never touches a business record.
 *
 * Existing expiry calls inside business pages and actions, and the /teacher/listing reminder
 * call, are unchanged and unthrottled (AC-71 (f)).
 */

export const SWEEP_INTERVAL_SECONDS = 60;
export const CLEANUP_INTERVAL_SECONDS = 60 * 60;
export const READ_KEEP_DAYS = 90;
export const UNREAD_KEEP_DAYS = 180;
const DAY = 24 * 60 * 60 * 1000;
/** Advisory lock id for clean-up (fixed, arbitrary; the migration runner uses 7_301_001). */
const CLEANUP_LOCK = 7_301_026;

/** Claims the shared sweep for this request when none ran in the last minute (database clock). */
export async function claimSharedSweep(sql: Sql): Promise<boolean> {
  const rows = await sql`
    UPDATE notification_throttles SET last_run_at = now()
    WHERE name = 'shared_sweep' AND last_run_at <= now() - make_interval(secs => ${SWEEP_INTERVAL_SECONDS})
    RETURNING name`;
  return rows.length === 1;
}

export interface SweepResult {
  ran: boolean;
  enquiries: number;
  linkRequests: number;
  rateProposals: number;
  reminders: number;
  /** CR-17 PR 2: lesson expiry, AA Pro closes and outcome requests. */
  lessons: number;
  /** TL-2: open material requests on lessons that have ended (no notification). */
  materialRequests: number;
  failed: number;
}

/**
 * Runs the shared sweep if this request may claim it. Each part is its own transaction; a part
 * that fails is caught up by the next run (every run re-selects all due rows).
 */
export async function runSharedSweep(sql: Sql, baseUrl: string, now: Date = new Date()): Promise<SweepResult> {
  const result: SweepResult = {
    ran: false,
    enquiries: 0,
    linkRequests: 0,
    rateProposals: 0,
    reminders: 0,
    lessons: 0,
    materialRequests: 0,
    failed: 0,
  };
  if (!(await claimSharedSweep(sql))) return result;
  result.ran = true;
  const part = async (
    fn: () => Promise<number>,
    key: 'enquiries' | 'linkRequests' | 'rateProposals' | 'reminders' | 'lessons' | 'materialRequests',
  ) => {
    try {
      result[key] = await fn();
    } catch (error) {
      result.failed += 1;
      console.error('CR-16 shared sweep: one part failed; the next run catches up.', (error as Error).message);
    }
  };
  await part(async () => (await expireEnquiries(sql, now)).length, 'enquiries');
  await part(() => expireLinkRequests(sql, now), 'linkRequests');
  await part(() => expireRateNegotiations(sql, now), 'rateProposals');
  await part(() => queueListingReminders(sql, baseUrl, now), 'reminders');
  await part(() => lessonMaintenance(sql, now), 'lessons');
  await part(() => closeEndedMaterialRequests(sql), 'materialRequests');
  return result;
}

/**
 * §7.6: the viewer's own expired enquiries, link requests and rate proposals, with every
 * recipient's notification in the same transaction. The viewer comes from the session; no id
 * from the browser is used. Students and teachers awaiting approval have nothing that expires.
 */
export async function userScopedExpiryCheck(
  sql: Sql,
  viewer: NotificationViewer | null,
  now: Date = new Date(),
): Promise<{ enquiries: number; linkRequests: number; rateProposals: number }> {
  const none = { enquiries: 0, linkRequests: 0, rateProposals: 0 };
  if (!viewer || viewer.standing !== 'full' || (viewer.role !== 'parent' && viewer.role !== 'teacher')) return none;
  const scope = viewer.role === 'teacher' ? { teacherId: viewer.id } : { parentId: viewer.id };
  return {
    enquiries: (await expireEnquiries(sql, now, scope)).length,
    linkRequests: await expireLinkRequests(sql, now, scope),
    rateProposals: await expireRateNegotiations(sql, now, scope),
  };
}

/**
 * §9 (D-9): removes notifications past their retention, at most once an hour across all server
 * instances. A non-blocking database lock and the stored last-run time (database clock) make
 * concurrent requests run it at most once; claim and removal commit together. Returns the number
 * removed, or null when this request did not run it.
 */
export async function cleanupNotifications(sql: Sql, now: Date = new Date()): Promise<number | null> {
  return sql.begin(async (tx) => {
    const [lock] = await tx<Array<{ ok: boolean }>>`SELECT pg_try_advisory_xact_lock(${CLEANUP_LOCK}) AS ok`;
    if (!lock?.ok) return null;
    const claimed = await tx`
      UPDATE notification_throttles SET last_run_at = now()
      WHERE name = 'cleanup' AND last_run_at <= now() - make_interval(secs => ${CLEANUP_INTERVAL_SECONDS})
      RETURNING name`;
    if (claimed.length === 0) return null;
    const removed = await tx`
      DELETE FROM notifications
      WHERE (read_at IS NOT NULL AND read_at <= ${new Date(now.getTime() - READ_KEEP_DAYS * DAY)})
         OR (read_at IS NULL AND created_at <= ${new Date(now.getTime() - UNREAD_KEEP_DAYS * DAY)})
      RETURNING id`;
    return removed.length;
  });
}

/**
 * A signed-in page load (§7.2): triggers the shared sweep and clean-up when they are due. Never
 * throws: maintenance must not break a page.
 */
export async function onSignedInPageLoad(sql: Sql, baseUrl: string, now: Date = new Date()): Promise<void> {
  try {
    await runSharedSweep(sql, baseUrl, now);
  } catch (error) {
    console.error('CR-16 shared sweep could not start.', (error as Error).message);
  }
  try {
    await cleanupNotifications(sql, now);
  } catch (error) {
    console.error('CR-16 clean-up could not run.', (error as Error).message);
  }
}
