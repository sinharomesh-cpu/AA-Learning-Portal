'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, type SymbolName } from '@/components/icons/Icon';
import { StatusChip } from '@/components/StatusChip';
import { markReadAction, openNotificationAction } from '@/app/notifications/actions';
import { cx } from '@/lib/cx';
import type { NotificationRowData } from '@/server/notifications/view';
import { useNotificationCounts } from './NotificationCounts';

/**
 * One list of notifications (CR-16 §6): used by the panel, the student sheet and the full page.
 * Each row: icon by kind, title, one-line message, relative time and the full date and time,
 * an unread dot with the word "Unread" for screen readers (AX-07), the action label (§6.1) and,
 * on unread rows, "Mark as read" (D-2). Clicking a row goes through the server-side open step.
 */

const KIND_ICON: Record<string, SymbolName> = { action: 'forum', update: 'info', reminder: 'schedule' };
const LABEL_KIND = { 'Needs your reply': 'warning', Done: 'success', 'No longer needed': 'neutral' } as const;

/** "Just now", "5 min ago", "3 h ago", "2 days ago" — the full date and time is shown beside it. */
export function relativeTime(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

/** The browser's clock, read after the first render so server and browser HTML match. */
export function useNow(serverNow: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return now;
}

export function NotificationRows({
  items,
  onItemsChange,
  child = false,
  serverNow,
  onNavigate,
}: {
  items: NotificationRowData[];
  onItemsChange: (next: (rows: NotificationRowData[]) => NotificationRowData[]) => void;
  /** The student sheet: simple wording, larger text, no action labels (D-7). */
  child?: boolean;
  serverNow: number;
  /** Called just before leaving the screen (closes the panel). */
  onNavigate?: () => void;
}) {
  const counts = useNotificationCounts();
  const router = useRouter();
  const now = useNow(serverNow);
  const [failed, setFailed] = useState<Record<string, 'mark' | 'open'>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const clearFailure = (id: string) =>
    setFailed((f) => {
      const next = { ...f };
      delete next[id];
      return next;
    });

  const setRead = (id: string, unread: boolean) =>
    onItemsChange((rows) => rows.map((r) => (r.id === id ? { ...r, unread } : r)));

  const mark = async (row: NotificationRowData) => {
    const before = counts?.unread ?? null;
    clearFailure(row.id);
    setRead(row.id, false);
    if (before !== null) counts?.setUnread(Math.max(0, before - 1));
    let ok = false;
    try {
      const r = await markReadAction(row.id);
      if (r.ok) {
        ok = true;
        counts?.setUnread(r.unread);
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      // §7.4: the row stays unread and the bell number goes back.
      setRead(row.id, true);
      if (before !== null) counts?.setUnread(before);
      setFailed((f) => ({ ...f, [row.id]: 'mark' }));
    }
  };

  const open = async (row: NotificationRowData) => {
    if (busy) return;
    setBusy(row.id);
    clearFailure(row.id);
    try {
      const r = await openNotificationAction(row.id);
      // Internal paths only; the server checked the link (§5) and chose it (§8).
      if (r.ok && r.href.startsWith('/') && !r.href.startsWith('//')) {
        counts?.setUnread(r.unread);
        setRead(row.id, false);
        onNavigate?.();
        router.push(r.href);
        return;
      }
    } catch {
      // Falls through to the error below.
    } finally {
      setBusy(null);
    }
    // §7.4: stay on this screen; the notification is not marked read.
    setFailed((f) => ({ ...f, [row.id]: 'open' }));
  };

  return (
    <ul className="m-0 flex list-none flex-col p-0" aria-label={child ? 'Your updates' : 'Notifications'}>
      {items.map((row) => {
        const icon: SymbolName = row.redacted
          ? 'notifications'
          : child
            ? 'description'
            : (KIND_ICON[row.kind ?? ''] ?? 'info');
        const label = child ? null : row.label;
        const error = failed[row.id];
        return (
          <li
            key={row.id}
            data-testid="notification-row"
            data-unread={row.unread ? 'true' : 'false'}
            className={cx(
              'flex flex-col gap-2 border-b border-card-border px-3 py-2.5 last:border-b-0 sm:px-4',
              row.unread && 'bg-primary-fixed/25',
            )}
          >
            <button
              type="button"
              onClick={() => void open(row)}
              aria-busy={busy === row.id || undefined}
              className="flex min-h-12 w-full cursor-pointer items-start gap-3 rounded-[16px] border-0 bg-transparent p-1 text-left text-on-surface hover:bg-surface-container-low"
            >
              <span
                aria-hidden="true"
                className={cx(
                  'mt-0.5 flex size-10 flex-none items-center justify-center rounded-full',
                  row.redacted
                    ? 'bg-surface-container text-on-surface-variant'
                    : 'bg-primary-fixed text-on-primary-fixed-variant',
                )}
              >
                <Icon name={icon} size={20} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                  data-testid="notification-title"
                  className={cx('font-bold leading-[22px]', child ? 'text-[17px]' : 'text-[15px]')}
                >
                  {row.title}
                </span>
                {row.body ? (
                  <span className={cx('truncate text-on-surface-variant', child ? 'text-[16px]' : 'text-[14px]')}>
                    {row.body}
                  </span>
                ) : null}
                <span className="text-[13px] leading-[18px] text-on-surface-variant">
                  <time dateTime={row.createdAt} suppressHydrationWarning>
                    {relativeTime(row.createdAt, now)}
                  </time>{' '}
                  · {row.when}
                </span>
                {label ? (
                  <StatusChip kind={LABEL_KIND[label]} className="self-start">
                    {label}
                  </StatusChip>
                ) : null}
              </span>
              {row.unread ? (
                <span className="mt-2 flex flex-none items-center">
                  <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
                  <span className="sr-only">Unread</span>
                </span>
              ) : null}
            </button>
            {error === 'open' ? (
              <p role="alert" className="m-0 px-1 text-[14px] font-bold text-on-error-container">
                Couldn&apos;t open this. Try again.
              </p>
            ) : null}
            {row.unread || error === 'mark' ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {error === 'mark' ? (
                  <span role="alert" className="text-[14px] font-bold text-on-error-container">
                    Couldn&apos;t mark as read. Try again.
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void mark(row)}
                  aria-label={error === 'mark' ? undefined : `Mark as read: ${row.title}`}
                  className="min-h-12 cursor-pointer rounded-full border-2 border-outline bg-surface-container-lowest px-4 text-[14px] font-bold text-on-surface hover:bg-surface-container-low"
                >
                  {error === 'mark' ? 'Try again' : 'Mark as read'}
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
