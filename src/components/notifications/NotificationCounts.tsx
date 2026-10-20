'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { refreshBellAction } from '@/app/notifications/actions';

/**
 * CR-16 §4, §7: the bell number and the menu badges on the client. They start from the values
 * the server rendered with the page and change:
 * - after the user's own actions (mark as read, mark all, open), from the server's answer (§7.1);
 * - every 60 seconds while the tab is visible, once when it becomes visible again and once when
 *   the connection returns — never while the tab is hidden or offline (§7.2, §7.4, AC-35);
 * - when the page is rendered again by the server (for example after a business action).
 * A refresh that fails leaves the bell without a number; offline keeps the last number (§7.4).
 */

export const REFRESH_MS = 60_000;

export type Badges = Record<string, number>;

export interface CountsValue {
  role: 'parent' | 'teacher' | 'student';
  seeAll: boolean;
  /** Null: the count could not be loaded (the bell shows without a number). */
  unread: number | null;
  badges: Badges;
  /** Text for the polite live region: set only when the number changes after the first render (AX-10). */
  announcement: string;
  setUnread: (n: number) => void;
  refresh: () => Promise<void>;
}

const CountsContext = createContext<CountsValue | null>(null);

export function useNotificationCounts(): CountsValue | null {
  return useContext(CountsContext);
}

/** "9+" above nine (§4). */
export function capCount(n: number): string {
  return n > 9 ? '9+' : String(n);
}

function announce(n: number): string {
  return n === 0 ? 'No unread notifications' : `${n} unread notification${n === 1 ? '' : 's'}`;
}

export function NotificationCountsProvider({
  role,
  seeAll,
  initialUnread,
  initialBadges,
  renderedAt,
  children,
}: {
  role: CountsValue['role'];
  seeAll: boolean;
  initialUnread: number | null;
  initialBadges: Badges;
  /** Changes each time the server renders the shell, so fresh server counts replace local ones. */
  renderedAt: number;
  children: ReactNode;
}) {
  const [state, setState] = useState(() => ({
    unread: initialUnread,
    badges: initialBadges,
    announcement: '',
    /** The last number known, to announce only real changes. */
    last: initialUnread,
    seen: renderedAt,
  }));
  const busy = useRef(false);

  const apply = useCallback((n: number | null, next?: Badges, seen?: number) => {
    setState((s) => {
      const changed = n !== null && n !== s.last;
      return {
        unread: n,
        badges: next ?? s.badges,
        // Announced once per change; never on the first page load (AC-61).
        announcement: changed ? announce(n) : s.announcement,
        last: n ?? s.last,
        seen: seen ?? s.seen,
      };
    });
  }, []);

  // A new server render (navigation after a business action, or a reload) brings fresh counts.
  if (renderedAt !== state.seen) apply(initialUnread, initialBadges, renderedAt);
  const { unread, badges, announcement } = state;

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await refreshBellAction();
      if (r.ok) apply(r.unread, r.badges);
      // Offline: keep the last number and show no error (§7.4).
      else if (navigator.onLine) apply(null);
    } catch {
      if (navigator.onLine) apply(null);
    } finally {
      busy.current = false;
    }
  }, [apply]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const visible = () => document.visibilityState === 'visible';
    const tick = () => {
      if (visible() && navigator.onLine) void refresh();
    };
    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(tick, REFRESH_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (visible()) {
        tick();
        start();
      } else {
        stop();
      }
    };
    const onOnline = () => tick();
    if (visible()) start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [refresh]);

  const value = useMemo<CountsValue>(
    () => ({ role, seeAll, unread, badges, announcement, setUnread: (n: number) => apply(n), refresh }),
    [role, seeAll, unread, badges, announcement, apply, refresh],
  );
  return <CountsContext.Provider value={value}>{children}</CountsContext.Provider>;
}

/**
 * A menu badge (§4.1, §6): the user's pending actions in that menu area, from business records
 * only. Amber chip with the approved pair (#684000 on #fea619, AX-01). Screen readers hear the
 * link as "Enquiries, 3 waiting for you" (NavLink's badgeLabel), so the chip itself is hidden.
 */
export function MenuBadge({ href }: { href: string }) {
  const counts = useNotificationCounts();
  const n = counts?.badges[href] ?? 0;
  if (n <= 0) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="menu-badge"
      className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-secondary-container px-1.5 text-[12px] font-extrabold leading-none text-on-secondary-container"
    >
      {capCount(n)}
    </span>
  );
}
