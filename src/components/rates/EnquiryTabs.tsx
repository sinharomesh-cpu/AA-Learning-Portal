import Link from 'next/link';
import { cx } from '@/lib/cx';

/** OC-99 (2): "Rate proposals" beside the enquiries list, for parents and teachers. */
export function EnquiryTabs({
  base,
  current,
  waiting,
}: {
  base: '/parent/enquiries' | '/teacher/enquiries';
  current: 'enquiries' | 'rates';
  /** Teacher: how many rate proposals wait for an answer. */
  waiting?: number;
}) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className={cx(
        'inline-flex min-h-11 items-center rounded-full border-2 px-4 text-[15px] font-bold',
        on ? 'border-primary bg-primary-fixed/50 text-on-primary-fixed' : 'border-outline text-on-surface',
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Enquiry views" className="flex flex-wrap gap-2">
      {tab(base, 'Enquiries', current === 'enquiries')}
      {tab(`${base}/rates`, waiting ? `Rate proposals (${waiting} waiting)` : 'Rate proposals', current === 'rates')}
    </nav>
  );
}
