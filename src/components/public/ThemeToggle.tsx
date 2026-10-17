'use client';

import { useSyncExternalStore } from 'react';
import { cx } from '@/lib/cx';
import { Icon } from './icons';

type Theme = 'light' | 'dark';
const KEY = 'aa-theme';

const EVENT = 'aa-theme-change';

function systemDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return systemDark() ? 'dark' : 'light';
}

function subscribe(onChange: () => void) {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  media?.addEventListener('change', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    media?.removeEventListener('change', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * Light / dark switch for the public pages (owner request, 17 Oct 2026). The choice is kept in
 * this browser only (localStorage); nothing is sent to the server.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // null on the server: the switch's state is only known in the browser.
  const theme = useSyncExternalStore<Theme | null>(subscribe, currentTheme, () => null);
  const dark = theme === 'dark';
  const toggle = () => {
    const next: Theme = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage can be blocked (private windows); the switch still works for this page.
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={theme === null ? undefined : dark}
      aria-label="Dark mode"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cx(
        'relative inline-flex h-11 w-[76px] flex-none cursor-pointer items-center rounded-full border border-card-border bg-surface-container-low p-1',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'absolute top-1 flex size-9 items-center justify-center rounded-full bg-surface-container-lowest text-primary shadow-sm transition-[left] duration-200',
          dark ? 'left-[36px]' : 'left-1',
        )}
      >
        <Icon name={dark ? 'moon' : 'sun'} size={18} />
      </span>
      <span aria-hidden="true" className="flex w-full justify-between px-2 text-on-surface-variant">
        <Icon name="sun" size={14} />
        <Icon name="moon" size={14} />
      </span>
    </button>
  );
}
