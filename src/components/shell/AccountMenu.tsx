'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { signOut } from '@/app/sign-in/actions';
import { cx } from '@/lib/cx';

interface AccountMenuProps {
  displayName: string;
  initial: string;
  roleLabel: string;
  /** Child shells use larger text and targets. */
  child?: boolean;
}

/** Account button with a small disclosure panel holding "Sign out". There is no role switcher (R-01). */
export function AccountMenu({ displayName, initial, roleLabel, child = false }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={`${displayName}'s account menu`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="h-12 w-12 rounded-full border-0 bg-primary-fixed font-headline text-[20px] font-extrabold text-on-primary-fixed-variant"
      >
        {initial}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 z-20 mt-2 w-64 rounded-[16px] border border-card-border bg-surface-container-lowest p-4 shadow-lg"
      >
        <p className={cx('font-bold', child ? 'text-lg' : 'text-base')}>{displayName}</p>
        <p className="mb-3 text-sm text-on-surface-variant">{roleLabel}</p>
        <form action={signOut}>
          <button
            type="submit"
            className={cx(
              'w-full rounded-full border-2 border-outline bg-surface-container-lowest font-bold text-on-surface hover:bg-surface-container-low',
              child ? 'min-h-14 text-[17px]' : 'min-h-12 text-[15px]',
            )}
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
