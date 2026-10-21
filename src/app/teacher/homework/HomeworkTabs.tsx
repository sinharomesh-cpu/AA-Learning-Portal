import Link from 'next/link';
import { cx } from '@/lib/cx';

/** Board W1: the Homework sections. Results for one student are on that student's page (W4). */
export function HomeworkTabs({ current }: { current: 'library' | 'review' }) {
  const tabs = [
    ['library', '/teacher/homework', 'My worksheets'],
    ['review', '/teacher/homework/review', 'Assigned and to review'],
  ] as const;
  return (
    <nav aria-label="Homework sections" className="flex flex-wrap gap-1 border-b-2 border-card-border">
      {tabs.map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          aria-current={current === key ? 'page' : undefined}
          className={cx(
            '-mb-0.5 inline-flex min-h-12 items-center border-b-4 px-4 font-bold no-underline',
            current === key
              ? 'border-primary text-primary hover:text-primary'
              : 'border-transparent text-on-surface-variant hover:text-on-surface',
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
