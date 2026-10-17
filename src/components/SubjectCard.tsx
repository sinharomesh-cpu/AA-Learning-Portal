import Link from 'next/link';
import type { SubjectId } from '@/fixtures/subjects';
import { SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';

interface SubjectCardProps {
  subject: SubjectId;
  /** Name of an assigned book, or a note that none is assigned yet. Never invented (FRD §7). */
  detail: string;
  href: string;
}

/**
 * CMP-SubjectCard: compact tile on phones (S9), tile with subject badge from `lg` up (S1).
 * No mastery percentages (OC-12).
 */
export function SubjectCard({ subject, detail, href }: SubjectCardProps) {
  const s = SUBJECTS[subject];
  return (
    <Link
      href={href}
      className="flex min-h-[72px] flex-col justify-center gap-1 rounded-[20px] border border-card-border bg-surface-container-lowest p-3 text-on-surface no-underline hover:border-primary hover:text-on-surface lg:justify-start lg:gap-2.5 lg:rounded-md lg:p-[18px]"
    >
      <span
        aria-hidden="true"
        className={cx(
          'hidden h-[52px] w-[52px] items-center justify-center rounded-[16px] font-headline text-[17px] font-extrabold lg:flex',
          s.tile,
        )}
      >
        {s.abbr}
      </span>
      <span className="font-headline text-base font-bold lg:text-[20px] lg:leading-7">{s.name}</span>
      <span className="text-[13px] font-medium text-on-surface-variant lg:text-[15px] lg:leading-[22px]">{detail}</span>
    </Link>
  );
}
