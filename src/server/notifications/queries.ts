import 'server-only';
import { noteVisibleHomework } from '../assignments';
import { noteLessonReminders } from '../lessonReminders';
import type { Db, Sql } from '../db/client';
import { type ActionLabel, actionLabel, loadViewer, mayStillSee, type StoredNotification } from './access';
import { type MenuBadges, menuBadges } from './badges';
import type { NotificationKind } from './notify';
import { cleanupNotifications, runSharedSweep, userScopedExpiryCheck } from './sweep';

/**
 * What N2's bell, panel, sheet and Notifications page read and do (CR-16 §4–§8). Every function
 * takes the signed-in account id from the server-side session and only ever reads or changes that
 * account's own rows: another account's notification id or paging position behaves exactly like
 * one that does not exist (AC-25, AC-59).
 */

export const REDACTED_TITLE = 'Notification no longer available';
export const NO_LONGER_AVAILABLE = 'This is no longer available to you.';

/** §6.2 page sizes. */
export const PANEL_SIZE = 10;
export const PAGE_SIZE = 20;
export const STUDENT_SHEET_SIZE = 20;

export interface NotificationItem {
  id: string;
  createdAt: Date;
  unread: boolean;
  /** §8.1: the record is no longer available to this user; only id, time and unread state are kept. */
  redacted: boolean;
  /** Null for a redacted row (neutral icon). */
  kind: NotificationKind | null;
  type: string | null;
  title: string;
  body: string | null;
  href: string | null;
  /** §6.1, action notifications for parents and teachers only. */
  label: ActionLabel | null;
}

export interface NotificationList {
  items: NotificationItem[];
  /** Pass back as `before` for "Show older" (full page only); null when nothing is older. */
  nextCursor: string | null;
}

export type ListView = 'panel' | 'page';
export type ListFilter = 'all' | 'unread';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keyset position: created_at in whole microseconds since the epoch, then the id. */
const CURSOR = /^(\d{1,17})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

type Row = StoredNotification & { us: string };

async function toItem(
  sql: Db,
  v: NonNullable<Awaited<ReturnType<typeof loadViewer>>>,
  r: StoredNotification,
  now: Date,
): Promise<NotificationItem> {
  const base = { id: r.id, createdAt: r.created_at, unread: r.read_at === null };
  if (!(await mayStillSee(sql, v, r))) {
    return {
      ...base,
      redacted: true,
      kind: null,
      type: null,
      title: REDACTED_TITLE,
      body: null,
      href: null,
      label: null,
    };
  }
  return {
    ...base,
    redacted: false,
    kind: r.kind,
    type: r.type,
    title: r.title,
    body: r.body || null,
    href: r.href,
    label: await actionLabel(sql, v, r, now),
  };
}

/**
 * The panel / sheet (latest 10 for parents and teachers, latest 20 for students) and the full
 * page (20 per load, "Show older" by keyset) — newest first by created_at, then id (§6.2).
 * Students have no full page and no "Show older" in CR-16: they always get their latest 20.
 * Every row is access-checked now; rows the user may no longer see are redacted, in place (§8.1).
 */
export async function listNotifications(
  sql: Db,
  accountId: string,
  opts: { view?: ListView; filter?: ListFilter; before?: string | null } = {},
  now: Date = new Date(),
): Promise<NotificationList> {
  const v = await loadViewer(sql, accountId);
  if (!v || v.standing === 'none') return { items: [], nextCursor: null };
  const student = v.role === 'student';
  const view: ListView = student ? 'panel' : (opts.view ?? 'panel');
  const size = student ? STUDENT_SHEET_SIZE : view === 'page' ? PAGE_SIZE : PANEL_SIZE;
  const unreadOnly = view === 'page' && opts.filter === 'unread';
  let after = sql``;
  if (view === 'page' && opts.before) {
    const m = CURSOR.exec(opts.before);
    if (!m) return { items: [], nextCursor: null };
    after = sql`AND (created_at, id) < (timestamptz 'epoch' + ${m[1]}::bigint * interval '1 microsecond', ${m[2]}::uuid)`;
  }
  const rows = await sql<Row[]>`
    SELECT id, kind, type, title, body, href, entity_type, entity_id, offer_seq, created_at, read_at,
           (extract(epoch FROM created_at) * 1000000)::bigint::text AS us
    FROM notifications
    WHERE recipient_id = ${v.id} ${unreadOnly ? sql`AND read_at IS NULL` : sql``} ${after}
    ORDER BY created_at DESC, id DESC
    LIMIT ${size + 1}`;
  const shown = rows.slice(0, size);
  const items: NotificationItem[] = [];
  for (const r of shown) items.push(await toItem(sql, v, r, now));
  const last = shown[shown.length - 1];
  return {
    items,
    nextCursor: view === 'page' && rows.length > size && last ? `${last.us}_${last.id}` : null,
  };
}

/** The bell number: this user's unread notifications, redacted ones included (§4, §8.1). */
export async function unreadCount(sql: Db, accountId: string): Promise<number> {
  const v = await loadViewer(sql, accountId);
  if (!v || v.standing === 'none') return 0;
  const [r] = await sql<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM notifications WHERE recipient_id = ${v.id} AND read_at IS NULL`;
  return r?.n ?? 0;
}

export interface BellCounts {
  unread: number;
  badges: MenuBadges;
}

/** C-1: the bell number and the menu badges in one call (page render and refresh). */
export async function bellCounts(sql: Db, accountId: string, now: Date = new Date()): Promise<BellCounts> {
  const v = await loadViewer(sql, accountId);
  return { unread: await unreadCount(sql, accountId), badges: await menuBadges(sql, v, now) };
}

/**
 * A bell refresh (§7.2): triggers the shared sweep (runs only when the once-a-minute throttle
 * allows), runs the user-scoped expiry check (every refresh, §7.6), may run clean-up (hourly),
 * then counts — so the response already includes any notification just created for this user
 * (AC-74). Request bodies, queries and URLs are never read here: only the session's account id.
 */
export async function refreshBell(sql: Sql, accountId: string, baseUrl: string, now: Date = new Date()) {
  const v = await loadViewer(sql, accountId);
  if (!v || v.standing === 'none') return { unread: 0, badges: {} } satisfies BellCounts;
  try {
    await runSharedSweep(sql, baseUrl, now);
  } catch (error) {
    console.error('CR-16 shared sweep could not start.', (error as Error).message);
  }
  await userScopedExpiryCheck(sql, v, now);
  // CR-17 PR 5 (W-7): homework that has become visible since the last visit.
  try {
    await noteVisibleHomework(sql, v, now);
  } catch (error) {
    console.error('Homework notifications could not be checked.', (error as Error).message);
  }
  // CR-17 PR 7 (D3A-10): the viewer's own 15-minute lesson reminders, best-effort, in-app only.
  try {
    await noteLessonReminders(sql, v, now);
  } catch (error) {
    console.error('Lesson reminders could not be checked.', (error as Error).message);
  }
  try {
    await cleanupNotifications(sql, now);
  } catch (error) {
    console.error('CR-16 clean-up could not run.', (error as Error).message);
  }
  return bellCounts(sql, accountId, now);
}

export type MarkResult = { ok: true } | { ok: false; reason: 'not_found' };

/**
 * D-2: marks one of the user's own notifications read. read_at is set once (AC-62); an already
 * read one stays as it was. Another user's id gives "not found" and changes nothing.
 */
export async function markRead(sql: Db, accountId: string, id: string, now: Date = new Date()): Promise<MarkResult> {
  const v = await loadViewer(sql, accountId);
  if (!v || v.standing === 'none' || !UUID.test(id)) return { ok: false, reason: 'not_found' };
  const [row] = await sql<Array<{ id: string }>>`
    WITH mine AS (SELECT id FROM notifications WHERE id = ${id} AND recipient_id = ${v.id}),
         upd AS (UPDATE notifications SET read_at = ${now}
                 WHERE id = ${id} AND recipient_id = ${v.id} AND read_at IS NULL)
    SELECT id FROM mine`;
  return row ? { ok: true } : { ok: false, reason: 'not_found' };
}

/** D-2: "Mark all as read" — one statement, all or nothing, this user's rows only. */
export async function markAllRead(sql: Db, accountId: string, now: Date = new Date()): Promise<{ marked: number }> {
  const v = await loadViewer(sql, accountId);
  if (!v || v.standing === 'none') return { marked: 0 };
  const rows = await sql`UPDATE notifications SET read_at = ${now}
                         WHERE recipient_id = ${v.id} AND read_at IS NULL RETURNING id`;
  return { marked: rows.length };
}

export type OpenResult =
  | { ok: true; href: string }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'unavailable'; message: typeof NO_LONGER_AVAILABLE };

/**
 * The one server-side "open notification" step (§8, D-8). Re-checks now whether the user may
 * still see the linked record; either way the notification is marked read. When access has
 * ended only the neutral message is returned — no title, link or identifier of the record. A
 * notification never grants access: the destination page applies its own checks as today.
 */
export async function openNotification(
  sql: Sql,
  accountId: string,
  id: string,
  now: Date = new Date(),
): Promise<OpenResult> {
  const v = await loadViewer(sql, accountId);
  if (!v || v.standing === 'none' || !UUID.test(id)) return { ok: false, reason: 'not_found' };
  return sql.begin(async (tx): Promise<OpenResult> => {
    const [n] = await tx<StoredNotification[]>`
      SELECT id, kind, type, title, body, href, entity_type, entity_id, offer_seq, created_at, read_at
      FROM notifications WHERE id = ${id} AND recipient_id = ${v.id} FOR UPDATE`;
    if (!n) return { ok: false, reason: 'not_found' };
    const allowed = await mayStillSee(tx, v, n);
    if (n.read_at === null) await tx`UPDATE notifications SET read_at = ${now} WHERE id = ${n.id}`;
    return allowed ? { ok: true, href: n.href } : { ok: false, reason: 'unavailable', message: NO_LONGER_AVAILABLE };
  });
}
