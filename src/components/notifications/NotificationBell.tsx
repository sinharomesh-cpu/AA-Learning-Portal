'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { LoadingState } from '@/components/states/States';
import { HEAD } from '@/components/ui/styles';
import { loadNotificationsAction, markAllReadAction } from '@/app/notifications/actions';
import { cx } from '@/lib/cx';
import type { NotificationRowData } from '@/server/notifications/view';
import { capCount, useNotificationCounts } from './NotificationCounts';
import { NotificationRows } from './NotificationRows';

/** Below this width the panel is a bottom sheet (phones, §6, AC-40). */
const SHEET_QUERY = '(max-width: 639.98px)';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; items: NotificationRowData[] };

/**
 * CR-16 §6: the bell in the top bar of every signed-in parent, teacher and student page. Shows
 * the unread number (1–9, then "9+", hidden at 0) in the primary colour; opening it loads the
 * latest 10 (parents, teachers) or 20 (students, "Your updates") without marking anything read.
 * Desktop: a ~380 px panel under the bell. Phones: a bottom sheet that is a modal dialog and
 * keeps focus inside while open (AX-08). Escape closes and returns focus to the bell.
 */
export function NotificationBell() {
  const counts = useNotificationCounts();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [allError, setAllError] = useState(false);
  const [serverNow, setServerNow] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const panelId = useId();

  const child = counts?.role === 'student';
  const title = child ? 'Your updates' : 'Notifications';

  const fetchRows = useCallback(async () => {
    setLoad({ state: 'loading' });
    try {
      const r = await loadNotificationsAction({ view: 'panel' });
      setLoad(r.ok ? { state: 'ready', items: r.items } : { state: 'error' });
    } catch {
      setLoad({ state: 'error' });
    }
  }, []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    const d = dialog.current;
    if (d?.open) d.close();
    if (returnFocus) bell.current?.focus();
  }, []);

  const show = () => {
    const asSheet = window.matchMedia(SHEET_QUERY).matches;
    setSheet(asSheet);
    setAllError(false);
    setServerNow(Date.now());
    setOpen(true);
    const d = dialog.current;
    if (d && !d.open) {
      if (asSheet) d.showModal();
      else d.show();
    }
    heading.current?.focus();
    // The panel loads its rows only when opened (§6.2); opening marks nothing read (AC-4).
    void fetchRows();
  };

  // Desktop panel: Escape and a click outside close it (the phone sheet is a modal dialog).
  useEffect(() => {
    if (!open || sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    const onPointer = (e: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open, sheet, close]);

  if (!counts) return null;
  const n = counts.unread;
  const name = n === null ? 'Notifications' : `Notifications, ${n} unread`;

  const markAll = async () => {
    const before = counts.unread;
    setAllError(false);
    try {
      const r = await markAllReadAction();
      if (r.ok) {
        counts.setUnread(r.unread);
        setLoad((l) => (l.state === 'ready' ? { ...l, items: l.items.map((i) => ({ ...i, unread: false })) } : l));
        return;
      }
    } catch {
      // Falls through.
    }
    // §7.4: nothing changes (one statement on the server) and the message shows once.
    if (before !== null) counts.setUnread(before);
    setAllError(true);
  };

  const anyUnread = (n ?? 0) > 0 || (load.state === 'ready' && load.items.some((i) => i.unread));

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={bell}
        type="button"
        aria-label={name}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        data-testid="notification-bell"
        onClick={() => (open ? close() : show())}
        className="relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-2 border-outline bg-surface-container-lowest text-on-surface hover:bg-surface-container-low"
      >
        <Icon name="notifications" size={24} />
        {n !== null && n > 0 ? (
          <span
            aria-hidden="true"
            data-testid="bell-count"
            className="absolute -right-1.5 -top-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-surface-container-lowest bg-primary px-1 text-[12px] font-extrabold leading-none text-on-primary"
          >
            {capCount(n)}
          </span>
        ) : null}
      </button>
      <span className="sr-only" aria-live="polite" data-testid="bell-live">
        {counts.announcement}
      </span>
      <dialog
        ref={dialog}
        id={panelId}
        aria-labelledby={titleId}
        data-testid={sheet ? 'notification-sheet' : 'notification-panel'}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          // A tap on the sheet's backdrop closes it.
          if (sheet && e.target === dialog.current) close();
        }}
        className={cx(
          'z-30 overflow-hidden border border-card-border bg-surface-container-lowest p-0 text-on-surface',
          sheet
            ? 'fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none flex-col rounded-t-[28px] backdrop:bg-on-surface/40 open:flex'
            : 'absolute left-auto right-0 top-full m-0 mt-2 w-[380px] max-w-[calc(100vw-32px)] flex-col rounded-[28px] shadow-[0_1px_2px_rgba(19,27,46,.04),0_16px_40px_-20px_rgba(19,27,46,.35)] open:flex',
        )}
      >
        <div className={cx(HEAD, 'px-4 py-2 sm:px-4')}>
          <div className="flex w-full items-center justify-between gap-2">
            <h2
              ref={heading}
              id={titleId}
              tabIndex={-1}
              className="m-0 font-headline text-[20px] font-bold leading-7 outline-none"
            >
              {title}
            </h2>
            <div className="flex items-center gap-2">
              {anyUnread ? (
                <button
                  type="button"
                  onClick={() => void markAll()}
                  className="min-h-12 cursor-pointer rounded-full border-0 bg-transparent px-3 text-[14px] font-bold text-primary hover:bg-surface-container-low"
                >
                  Mark all as read
                </button>
              ) : null}
              <button
                type="button"
                aria-label={`Close ${title.toLowerCase()}`}
                onClick={() => close()}
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-on-surface hover:bg-surface-container-low"
              >
                <Icon name="close" size={22} />
              </button>
            </div>
          </div>
        </div>
        {allError ? (
          <p
            role="alert"
            className="m-0 border-b border-card-border px-4 py-2 text-[14px] font-bold text-on-error-container"
          >
            Couldn&apos;t mark all as read. Try again.
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto sm:max-h-[min(520px,70dvh)]">
          {load.state === 'loading' ? (
            <div className="p-4">
              <LoadingState rows={3} label="Loading notifications" />
            </div>
          ) : load.state === 'error' ? (
            <div role="alert" className="flex flex-col items-start gap-3 p-4 text-[15px] leading-[22px]">
              <span>{child ? "We couldn't load your updates." : "We couldn't load your notifications."}</span>
              <button
                type="button"
                onClick={() => void fetchRows()}
                className="min-h-12 cursor-pointer rounded-full border-2 border-outline bg-surface-container-lowest px-5 text-[15px] font-bold text-on-surface hover:bg-surface-container-low"
              >
                Try again
              </button>
            </div>
          ) : load.items.length === 0 ? (
            <div className="flex flex-col items-start gap-1 p-5" data-testid="notifications-empty">
              <p className={cx('m-0 font-bold', child ? 'text-[18px]' : 'text-[16px]')}>
                {child ? "You're all caught up!" : "You're all caught up"}
              </p>
              <p className="m-0 text-[15px] leading-[22px] text-on-surface-variant">
                {child ? 'New things from your teachers will show up here.' : 'New notifications will show here.'}
              </p>
            </div>
          ) : (
            <NotificationRows
              items={load.items}
              child={child}
              serverNow={serverNow}
              onNavigate={() => close(false)}
              onItemsChange={(fn) => setLoad((l) => (l.state === 'ready' ? { ...l, items: fn(l.items) } : l))}
            />
          )}
        </div>
        {counts.seeAll ? (
          <div className="border-t border-card-border px-4 py-2">
            <Link
              href={`/${counts.role}/notifications`}
              onClick={() => close(false)}
              className="flex min-h-12 items-center justify-center rounded-full text-[15px] font-bold"
            >
              See all notifications
            </Link>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
