import 'server-only';
import { db } from '../db/client';
import { getRealSession } from '../session';
import { loadViewer, type NotificationViewer } from './access';
import { type MenuBadges, menuBadges } from './badges';
import type { NotificationKind } from './notify';
import type { NotificationItem } from './queries';
import { unreadCount } from './queries';

/**
 * CR-16 N2: what the bell, panel, sheet and Notifications page receive in the browser. Only
 * the fields the screen shows are sent (no link, record type or record id): the link is used
 * only by the server-side open step (§8), and a redacted row keeps only its own id, its time
 * and its unread state (§8.1).
 */
export interface NotificationRowData {
  id: string;
  /** created_at as an ISO instant (the browser works out "5 min ago" from it). */
  createdAt: string;
  /** Full date and time in the account's own time zone (accounts.time_zone), e.g. "20 Oct 2026, 2:05 pm". */
  when: string;
  unread: boolean;
  redacted: boolean;
  kind: NotificationKind | null;
  title: string;
  body: string | null;
  label: NotificationItem['label'];
}

export type NotificationRole = NotificationViewer['role'];

/** The signed-in account for a notification request: from the server-side session only. */
export interface NotificationSession {
  accountId: string;
  role: NotificationRole;
  timeZone: string;
}

/**
 * The real signed-in parent, teacher or student, or null (signed out, demo mode, admins).
 * Identity always comes from the session cookie on the server; never from the browser.
 */
export async function notificationSession(): Promise<NotificationSession | null> {
  const real = await getRealSession();
  if (!real) return null;
  const { role, accountId, timeZone } = real.session;
  if (role !== 'parent' && role !== 'teacher' && role !== 'student') return null;
  return { accountId, role, timeZone };
}

export function formatWhen(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(at);
  }
}

export function toRow(item: NotificationItem, timeZone: string): NotificationRowData {
  return {
    id: item.id,
    createdAt: item.createdAt.toISOString(),
    when: formatWhen(item.createdAt, timeZone),
    unread: item.unread,
    redacted: item.redacted,
    kind: item.kind,
    title: item.title,
    body: item.body,
    label: item.label,
  };
}

/** Where the open step sends a user whose access has ended (§8, D-8): a fixed path, no record id. */
export function unavailablePath(role: NotificationRole): string {
  return `/${role}/notifications/unavailable`;
}

export interface ShellNotifications {
  role: NotificationRole;
  /** Null when the count could not be loaded (§7.4: the bell shows without a number). */
  unread: number | null;
  badges: MenuBadges;
  /** "See all notifications": approved parents and teachers only (§6.2). */
  seeAll: boolean;
  /** When the server counted; a newer render replaces the browser's own numbers. */
  renderedAt: number;
}

/**
 * The bell and menu badges for a signed-in page (§4, §6). Null — no bell, no badges — for a
 * signed-out visitor, demo mode, Super Admin and Admin (D-6), a not-approved teacher (Q-2) and
 * any account that is not active. A failure to count leaves the bell without a number and the
 * badges still work, and the other way round (§7.4).
 */
export async function shellNotifications(): Promise<ShellNotifications | null> {
  const s = await notificationSession();
  if (!s) return null;
  let v: NotificationViewer | null;
  try {
    v = await loadViewer(db(), s.accountId);
  } catch (error) {
    console.error('CR-16 bell could not load.', (error as Error).message);
    return null;
  }
  if (!v || v.standing === 'none') return null;
  let unread: number | null = null;
  let badges: MenuBadges = {};
  try {
    unread = await unreadCount(db(), v.id);
  } catch (error) {
    console.error('CR-16 unread count could not load.', (error as Error).message);
  }
  try {
    badges = await menuBadges(db(), v);
  } catch (error) {
    console.error('CR-16 menu badges could not load.', (error as Error).message);
  }
  // A teacher awaiting approval can open only their status and profile pages (OC-38, D-5), so
  // they get the panel without "See all".
  return {
    role: v.role,
    unread,
    badges,
    seeAll: v.role !== 'student' && v.standing === 'full',
    renderedAt: Date.now(),
  };
}
