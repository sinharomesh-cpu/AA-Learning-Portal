'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Panel } from '@/components/ui/Panel';
import { CHIP, OVERLAY_INPUT } from '@/components/ui/styles';
import { loadNotificationsAction, markAllReadAction } from '@/app/notifications/actions';
import { cx } from '@/lib/cx';
import type { NotificationRowData } from '@/server/notifications/view';
import { useNotificationCounts } from './NotificationCounts';
import { NotificationRows } from './NotificationRows';

type Filter = 'all' | 'unread';

const SMALL_BUTTON =
  'min-h-12 cursor-pointer rounded-full border-2 border-outline bg-surface-container-lowest px-5 text-[15px] font-bold text-on-surface hover:bg-surface-container-low';

/**
 * The parent and teacher Notifications page (CR-16 §6, D-7): tinted card header, chip filters
 * All / Unread (n), 20 per load, newest first, "Show older" by keyset (§6.2, C-2) and per-row
 * "Mark as read". Under Unread a row marked read stays in place, shown as read, until the filter
 * changes or the page reloads (C-4).
 */
export function NotificationsPage({
  initialItems,
  initialCursor,
  initialError = false,
  serverNow,
}: {
  initialItems: NotificationRowData[];
  initialCursor: string | null;
  /** The first 20 could not be loaded: an error with Try again (§7.4). */
  initialError?: boolean;
  serverNow: number;
}) {
  const counts = useNotificationCounts();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [state, setState] = useState<'ready' | 'loading' | 'error'>(initialError ? 'error' : 'ready');
  const [olderState, setOlderState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [allError, setAllError] = useState(false);

  const loadFirst = async (f: Filter) => {
    setState('loading');
    setOlderState('idle');
    try {
      const r = await loadNotificationsAction({ view: 'page', filter: f });
      if (r.ok) {
        setItems(r.items);
        setCursor(r.nextCursor);
        setState('ready');
        return;
      }
    } catch {
      // Falls through.
    }
    setState('error');
  };

  const choose = (f: Filter) => {
    if (f === filter) return;
    setFilter(f);
    void loadFirst(f);
  };

  const older = async () => {
    if (!cursor) return;
    setOlderState('loading');
    try {
      const r = await loadNotificationsAction({ view: 'page', filter, before: cursor });
      if (r.ok) {
        setItems((rows) => [...rows, ...r.items.filter((i) => !rows.some((x) => x.id === i.id))]);
        setCursor(r.nextCursor);
        setOlderState('idle');
        return;
      }
    } catch {
      // Falls through.
    }
    // §7.4: the rows already shown stay; Try again appears under them.
    setOlderState('error');
  };

  const markAll = async () => {
    setAllError(false);
    const before = counts?.unread ?? null;
    try {
      const r = await markAllReadAction();
      if (r.ok) {
        counts?.setUnread(r.unread);
        setItems((rows) => rows.map((i) => ({ ...i, unread: false })));
        return;
      }
    } catch {
      // Falls through.
    }
    if (before !== null) counts?.setUnread(before);
    setAllError(true);
  };

  const unread = counts?.unread;
  const chip = (f: Filter, text: string) => (
    <label className={cx(CHIP, 'min-h-12 min-w-12')}>
      <input
        type="radio"
        name="notification-filter"
        value={f}
        checked={filter === f}
        onChange={() => choose(f)}
        className={OVERLAY_INPUT}
      />
      <Icon name="check" size={16} className="hidden group-has-[:checked]:block" />
      {text}
    </label>
  );

  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Notifications</h1>
      <Panel
        id="notifications-list"
        title="Your notifications"
        intro="Newest first. Opening one takes you to its page; reading it never completes an action."
        badge={
          items.some((i) => i.unread) || (unread ?? 0) > 0 ? (
            <button type="button" className={SMALL_BUTTON} onClick={() => void markAll()}>
              Mark all as read
            </button>
          ) : undefined
        }
        bodyClassName="gap-4"
      >
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">Show</legend>
          {chip('all', 'All')}
          {chip('unread', unread === null || unread === undefined ? 'Unread' : `Unread (${unread})`)}
        </fieldset>
        {allError ? (
          <p role="alert" className="m-0 text-[15px] font-bold text-on-error-container">
            Couldn&apos;t mark all as read. Try again.
          </p>
        ) : null}
        <div aria-busy={state === 'loading'} className="overflow-hidden rounded-[20px] border border-card-border">
          {state === 'loading' ? (
            <div className="p-5">
              <span className="sr-only">Loading notifications</span>
              <div aria-hidden="true" className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-[12px] bg-surface-container" />
                ))}
              </div>
            </div>
          ) : state === 'error' ? (
            <div role="alert" className="flex flex-col items-start gap-3 p-5 text-[15px]">
              <span>We couldn&apos;t load your notifications.</span>
              <button type="button" className={SMALL_BUTTON} onClick={() => void loadFirst(filter)}>
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col gap-1 p-5" data-testid="notifications-empty">
              <p className="m-0 text-[16px] font-bold">You&apos;re all caught up</p>
              <p className="m-0 text-[15px] text-on-surface-variant">
                {filter === 'unread' ? 'You have no unread notifications.' : 'New notifications will show here.'}
              </p>
            </div>
          ) : (
            <NotificationRows
              items={items}
              serverNow={serverNow}
              onItemsChange={(fn) => setItems((rows) => fn(rows))}
            />
          )}
        </div>
        {state === 'ready' && (cursor || olderState === 'error') ? (
          <div className="flex flex-col items-start gap-2">
            {olderState === 'error' ? (
              <p role="alert" className="m-0 text-[15px] font-bold text-on-error-container">
                Couldn&apos;t load older notifications.
              </p>
            ) : null}
            <button
              type="button"
              className={SMALL_BUTTON}
              aria-busy={olderState === 'loading' || undefined}
              onClick={() => void older()}
            >
              {olderState === 'error' ? 'Try again' : 'Show older'}
            </button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
