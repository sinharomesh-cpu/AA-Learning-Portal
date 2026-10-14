'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';

/** Phone-only "Menu" disclosure for the adult shells. Closes on navigation and Escape. */
export function MobileMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Open ${label.toLowerCase()}`}
        onClick={() => setOpen((v) => !v)}
        className="min-h-12 min-w-12 rounded-full border-2 border-outline bg-white px-3 text-[14px] font-bold text-on-surface"
      >
        Menu
      </button>
      <nav
        id={id}
        aria-label={label}
        hidden={!open}
        className="absolute inset-x-0 top-full z-20 flex flex-col gap-1 border-b border-card-border bg-white px-4 py-3 shadow-lg"
      >
        {children}
      </nav>
    </div>
  );
}
