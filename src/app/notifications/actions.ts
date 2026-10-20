'use server';

import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { isInternalPath } from '@/server/notifications/notify';
import {
  listNotifications,
  markAllRead,
  markRead,
  openNotification,
  refreshBell,
  unreadCount,
} from '@/server/notifications/queries';
import { notificationSession, toRow, unavailablePath, type NotificationRowData } from '@/server/notifications/view';
import { siteBaseUrl } from '@/server/requestInfo';
import { getViewer } from '@/server/session';

/**
 * CR-16 N2: the bell, panel, sheet and Notifications page talk to the server only through these
 * actions. Each one takes the signed-in account from the server-side session; the browser can
 * name a notification id or a paging position, never a user. Another account's id behaves
 * exactly like one that does not exist (AC-25, AC-59). Errors never name a record, child or
 * other user (§7.4).
 */

export type CountsResult = { ok: true; unread: number; badges: Record<string, number> } | { ok: false };
export type ListResult = { ok: true; items: NotificationRowData[]; nextCursor: string | null } | { ok: false };
export type MarkResult = { ok: true; unread: number } | { ok: false };
export type OpenResult = { ok: true; href: string; unread: number } | { ok: false };

/** The session for a notification request; signed-out requests go to sign-in (§8). */
async function session() {
  const s = await notificationSession();
  if (s) return s;
  // Demo mode and admins have no notifications; only a missing sign-in goes to the sign-in page.
  if (!(await getViewer())) redirect('/sign-in');
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asId = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

/**
 * The bell refresh (§7.2): every 60 seconds while the tab is visible, once when it becomes
 * visible again and once on reconnect. Runs the shared sweep (when its once-a-minute claim
 * allows), the user-scoped expiry check and clean-up (hourly), then counts — bell number and
 * menu badges in one response (C-1, AC-74). Takes no arguments: nothing from the browser is used.
 */
export async function refreshBellAction(): Promise<CountsResult> {
  const s = await session();
  if (!s) return { ok: false };
  try {
    const r = await refreshBell(db(), s.accountId, await siteBaseUrl());
    return { ok: true, unread: r.unread, badges: r.badges };
  } catch (error) {
    console.error('CR-16 bell refresh failed.', (error as Error).message);
    return { ok: false };
  }
}

/** The panel / sheet (on opening) and the Notifications page ("Show older", All / Unread). */
export async function loadNotificationsAction(input: {
  view?: unknown;
  filter?: unknown;
  before?: unknown;
}): Promise<ListResult> {
  const s = await session();
  if (!s) return { ok: false };
  const view = input?.view === 'page' ? 'page' : 'panel';
  const filter = input?.filter === 'unread' ? 'unread' : 'all';
  const before = typeof input?.before === 'string' && input.before.length <= 64 ? input.before : null;
  try {
    const list = await listNotifications(db(), s.accountId, { view, filter, before });
    return { ok: true, items: list.items.map((i) => toRow(i, s.timeZone)), nextCursor: list.nextCursor };
  } catch (error) {
    console.error('CR-16 notifications could not load.', (error as Error).message);
    return { ok: false };
  }
}

/** D-2: "Mark as read" on one row. The user stays on the same screen; badges are unchanged. */
export async function markReadAction(id: unknown): Promise<MarkResult> {
  const s = await session();
  if (!s) return { ok: false };
  const nid = asId(id);
  if (!nid) return { ok: false };
  try {
    const r = await markRead(db(), s.accountId, nid);
    if (!r.ok) return { ok: false };
    return { ok: true, unread: await unreadCount(db(), s.accountId) };
  } catch (error) {
    console.error('CR-16 mark as read failed.', (error as Error).message);
    return { ok: false };
  }
}

/** D-2: "Mark all as read" — one statement, all or nothing, this user's rows only. */
export async function markAllReadAction(): Promise<MarkResult> {
  const s = await session();
  if (!s) return { ok: false };
  try {
    await markAllRead(db(), s.accountId);
    return { ok: true, unread: await unreadCount(db(), s.accountId) };
  } catch (error) {
    console.error('CR-16 mark all as read failed.', (error as Error).message);
    return { ok: false };
  }
}

/**
 * The one server-side open step (§8, D-8): re-checks access now and marks the notification read,
 * then sends the browser on. Authorised: the notification's own internal page, whose own checks
 * still apply as today (a notification never grants access). Access ended: a fixed page that
 * says only "This is no longer available to you." — no title, link or identifier of the record
 * in the response or the address. A failure changes nothing (the notification stays unread).
 */
export async function openNotificationAction(id: unknown): Promise<OpenResult> {
  const s = await session();
  if (!s) return { ok: false };
  const nid = asId(id);
  if (!nid) return { ok: false };
  try {
    const r = await openNotification(db(), s.accountId, nid);
    if (!r.ok && r.reason === 'not_found') return { ok: false };
    const href = r.ok && isInternalPath(r.href) ? r.href : unavailablePath(s.role);
    return { ok: true, href, unread: await unreadCount(db(), s.accountId) };
  } catch (error) {
    console.error('CR-16 open notification failed.', (error as Error).message);
    return { ok: false };
  }
}
