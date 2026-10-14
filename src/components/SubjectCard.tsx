import Link from 'next/link';
import type { SubjectId } from '@/fixtures/subjects';
import { SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';

interface SubjectCardProps {
  subject: SubjectId;
  /** Name of an assigned book, or a note that none is assigned yet. Never invented (FRD §7). */
  detail: string;
  href: string;
  compact?: boolean;
}

/** CMP-SubjectCard: subject tile on the student dashboard. No mastery percentages (OC-12). */
export function SubjectCard({ subject, detail, href, compact = false }: SubjectCardProps) {
  const s = SUBJECTS[subject];
  return (
    <Link
      href={href}
      className={cx(
        'flex flex-col gap-2.5 rounded-md border border-card-border bg-white text-on-surface no-underline hover:border-primary hover:text-on-surface',
        compact ? 'min-h-[72px] justify-center rounded-[20px] p-3' : 'p-[18px]',
      )}
    >
      {!compact ? (
        <span
          aria-hidden="true"
          className={cx(
            'flex h-[52px] w-[52px] items-center justify-center rounded-[16px] font-headline text-[17px] font-extrabold',
            s.tile,
          )}
        >
          {s.abbr}
        </span>
      ) : null}
      <span className={cx('font-headline font-bold', compact ? 'text-base' : 'text-[20px] leading-7')}>{s.name}</span>
      <span
        className={cx('text-on-surface-variant', compact ? 'text-[13px] font-medium' : 'text-[15px] leading-[22px]')}
      >
        {detail}
      </span>
    </Link>
  );
}
