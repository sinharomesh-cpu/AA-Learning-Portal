import 'server-only';
import type { Db, Sql, Tx } from '../db/client';

/**
 * In-app notifications (CR-16 v0.7, §5): the one server helper that creates them.
 *
 * - Called only by server code, inside the same transaction as the business change (§3), so a
 *   rolled-back event leaves no notification (AC-32).
 * - One row per authorised recipient per event: the de-duplication key is built from the event
 *   (never the clock) and inserted with ON CONFLICT DO NOTHING, so a retried or repeated event
 *   never duplicates (AC-29).
 * - Independent of email (D-11): this never touches email_outbox, and no email or WhatsApp
 *   message is sent from here.
 * - English only (assumption 4). Titles and messages never contain a child's name or id for a
 *   teacher, nor prices or parent details for a student (§3 content rules); the wording is built
 *   in events.ts.
 */

export type NotificationKind = 'action' | 'update' | 'reminder';
export type EntityType =
  | 'enquiry'
  | 'link_request'
  | 'rate_proposal'
  | 'resource_share'
  | 'listing'
  | 'learning_package'
  | 'teacher_profile'
  // CR-17 PR 5: a student's homework (assignment_targets.id).
  | 'assignment'
  // CR-17 PR 2: a lesson request or lesson (lessons.id).
  | 'lesson';

export interface NotifyInput {
  recipientId: string;
  kind: NotificationKind;
  type: string;
  title: string;
  body?: string;
  href: string;
  entityType: EntityType;
  entityId: string;
  /** Rate proposal action notifications: the offer number announced (§6.1). */
  offerSeq?: number | null;
  dedupeKey: string;
  /** The event time (created_at). */
  now: Date;
}

export const TITLE_MAX = 120;
export const BODY_MAX = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** §5, AC-26: an internal path only. Mirrors the database CHECK. */
export const INTERNAL_PATH = /^\/[a-z][a-z0-9/_-]*$/;

export function isInternalPath(href: string): boolean {
  return INTERNAL_PATH.test(href) && !href.includes('//') && href.length <= 200;
}

/** Plain single-line text cut to `max` characters (whole characters, with an ellipsis). */
export function clip(text: string, max: number): string {
  const t = text
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...t];
  return chars.length <= max ? t : `${chars.slice(0, max - 1).join('')}…`;
}

export class NotificationLinkError extends Error {
  constructor() {
    super('A notification link must be an internal path.');
  }
}

/**
 * Creates one notification unless the same event already created it. Returns true when a new
 * row was written. Refuses anything but an internal path (AC-26). Recipients who are not
 * parents, teachers or students are refused by the database (D-6).
 */
export async function notify(tx: Db, n: NotifyInput): Promise<boolean> {
  if (!isInternalPath(n.href)) throw new NotificationLinkError();
  if (!UUID.test(n.recipientId) || !UUID.test(n.entityId)) throw new Error('Bad notification ids.');
  const rows = await tx`
    INSERT INTO notifications (recipient_id, kind, type, title, body, href, entity_type, entity_id, offer_seq,
                               dedupe_key, created_at)
    VALUES (${n.recipientId}, ${n.kind}, ${n.type}, ${clip(n.title, TITLE_MAX)}, ${clip(n.body ?? '', BODY_MAX)},
            ${n.href}, ${n.entityType}, ${n.entityId}, ${n.offerSeq ?? null}, ${n.dedupeKey}, ${n.now})
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id`;
  return rows.length === 1;
}

/** True for a transaction handle (it has `savepoint`), false for the pool. */
export function isTx(sql: Db): sql is Tx {
  return typeof (sql as Partial<Tx>).savepoint === 'function';
}

/**
 * Runs `fn` in a transaction: the caller's, when it already has one, otherwise a new one
 * (§13.2 (2): every expiry sweep is atomic with its audit, email and notifications).
 */
export async function inTx<T>(sql: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  if (isTx(sql)) return fn(sql);
  // Two sweeps updating overlapping rows in different orders can deadlock; the database aborts
  // one of them, which then simply runs again (the work is idempotent).
  for (let attempt = 1; ; attempt += 1) {
    try {
      return (await (sql as Sql).begin((tx) => fn(tx))) as T;
    } catch (error) {
      if ((error as { code?: string }).code !== '40P01' || attempt >= 3) throw error;
    }
  }
}
