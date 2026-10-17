import Link from 'next/link';
import { ThemeToggle } from '@/components/public/ThemeToggle';

/** "Back to home" link (OC-52) and the light/dark switch (OC-83) for the standalone pages. */
export function BackToHome() {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-4 pt-4 sm:px-6">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] font-bold text-primary no-underline hover:bg-surface-container-low"
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to home
      </Link>
      <ThemeToggle />
    </div>
  );
}
