'use client';

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/** Shows a polite banner while the browser reports no connection (board 9). */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[16px] border border-warning-border bg-warning-container px-4 py-3.5 text-[15px] leading-[22px] text-on-warning-container"
    >
      You&apos;re offline. Some things may not update until you reconnect.
    </div>
  );
}
