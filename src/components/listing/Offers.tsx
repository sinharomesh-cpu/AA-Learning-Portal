'use client';

import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { StatusChip } from '@/components/StatusChip';
import { cx } from '@/lib/cx';
import { formatAmount } from '@/lib/listing';
import {
  describePackage,
  type HourlyOffer,
  lessonPriceMinor,
  lessonRoundingNote,
  type PackageTerms,
} from '@/lib/pricing';
import { convertUsualTimes, formatMinute, type UsualTime, WEEKDAYS, WEEKDAYS_SHORT } from '@/lib/usualTimes';

/**
 * CR-15 (FR-041, FR-042; boards PM1, SF1): the two independent offers on a listing, each in its
 * own box with its own price and Fixed / Negotiable label (P-8). Times are converted to the
 * viewer's time zone in the browser, as LocalUsualTimes does.
 */

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const subscribe = () => () => {};

export interface OfferSlot extends UsualTime {
  /** Open to offers now (slot setting and the teacher's master switch). */
  negotiable: boolean;
}

function useViewerZone(convert: boolean) {
  const zone = useSyncExternalStore(subscribe, browserZone, () => null);
  return convert ? zone : null;
}

const range = (t: UsualTime, short = false) =>
  `${(short ? WEEKDAYS_SHORT : WEEKDAYS)[t.weekday - 1]} ${formatMinute(t.start)}–${t.end === 1440 ? '12:00 am' : formatMinute(t.end)}`;

export function NegotiableChip({ negotiable, fixedLabel }: { negotiable: boolean; fixedLabel: string }) {
  return negotiable ? (
    <StatusChip kind="success">Open to offers</StatusChip>
  ) : (
    <StatusChip kind="neutral">{fixedLabel}</StatusChip>
  );
}

/** Hourly lessons: rate, lesson price and each usual time with its own setting. */
export function HourlyOfferBox({
  hourly,
  slots,
  teacherZone,
  convert = true,
  slotActions,
  headingLevel = 3,
  maxSlots,
  moreHref,
}: {
  hourly: HourlyOffer;
  slots: OfferSlot[];
  teacherZone: string;
  /** Convert times to the viewer's zone (public pages); the teacher's preview shows their own. */
  convert?: boolean;
  /** One action per slot (same order), e.g. "Propose a rate". */
  slotActions?: ReactNode[];
  headingLevel?: 2 | 3 | 4;
  /** Cards show only the first few times. */
  maxSlots?: number;
  moreHref?: string;
}) {
  const zone = useViewerZone(convert);
  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  // Each slot converts on its own, so its setting and action stay with it.
  const rows = slots.flatMap((s, i) =>
    (zone ? convertUsualTimes([s], teacherZone, zone) : [s]).map((t) => ({ t, negotiable: s.negotiable, i })),
  );
  rows.sort((a, b) => a.t.weekday - b.t.weekday || a.t.start - b.t.start);
  const shown = maxSlots ? rows.slice(0, maxSlots) : rows;
  const lesson = formatAmount(hourly.currency, lessonPriceMinor(hourly.rateMinor, hourly.minutes));
  const rounding = lessonRoundingNote(hourly.currency, hourly.rateMinor, hourly.minutes);
  return (
    <section
      aria-label="Hourly lessons"
      className="flex flex-col gap-2.5 rounded-[18px] border border-human-border bg-primary-fixed/25 p-3.5"
    >
      <H className="text-xs font-bold uppercase tracking-[.08em] text-on-primary-fixed-variant">Hourly lessons</H>
      <p className="text-[15px] leading-[22px]">
        <span className="font-headline text-[20px] font-bold">{formatAmount(hourly.currency, hourly.rateMinor)}</span>{' '}
        per hour · <strong>{lesson}</strong> a {hourly.minutes}-minute lesson
        {rounding ? <span className="text-[13px] text-on-surface-variant"> ({rounding})</span> : null}
      </p>
      {shown.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {shown.map(({ t, negotiable, i }) => (
            <li
              key={`${t.weekday}-${t.start}-${i}`}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-card-border pt-1.5 text-[15px] first:border-t-0 first:pt-0"
            >
              <span className="font-bold">{range(t, !!maxSlots)}</span>
              <span className="flex flex-wrap items-center gap-2">
                <NegotiableChip negotiable={negotiable} fixedLabel="Fixed rate" />
                {slotActions?.[i]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-on-surface-variant">No usual times given yet.</p>
      )}
      {maxSlots && rows.length > maxSlots && moreHref ? (
        <a href={moreHref} className="self-start text-sm font-bold underline">
          See all {rows.length} times
        </a>
      ) : null}
      <p className="text-sm text-on-surface-variant">
        One lesson at a time · no minimum number of lessons
        {zone ? ` · times in your time zone (${zone})` : convert ? '' : ` · times in ${teacherZone}`}
      </p>
    </section>
  );
}

/** The learning package: total price, terms and its own setting (P-1, P-2, P-6). */
export function PackageOfferBox({
  pkg,
  negotiable,
  teacherZone,
  convert = true,
  action,
  headingLevel = 3,
  compact = false,
}: {
  pkg: PackageTerms;
  negotiable: boolean;
  teacherZone: string;
  convert?: boolean;
  action?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  compact?: boolean;
}) {
  const zone = useViewerZone(convert);
  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const times = pkg.times.flatMap((t) => {
    const r = { weekday: t.weekday, start: t.start, end: t.start + pkg.minutes };
    return zone ? convertUsualTimes([r], teacherZone, zone) : [r];
  });
  return (
    <section
      aria-label="Learning package"
      className="flex flex-col gap-2.5 rounded-[18px] border border-success-border bg-success-container/40 p-3.5"
    >
      <H className="text-xs font-bold uppercase tracking-[.08em] text-on-tertiary-fixed-variant">Learning package</H>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px]">
          <span className="font-headline text-[20px] font-bold">{formatAmount(pkg.currency, pkg.priceMinor)}</span> for
          the whole package
        </p>
        <NegotiableChip negotiable={negotiable} fixedLabel="Fixed price" />
      </div>
      <p className="text-[15px] leading-[22px]">{describePackage(pkg)}</p>
      {!compact ? (
        <p className={cx('text-[15px] leading-[22px]')}>
          <strong>Class times:</strong> {times.map((t) => range(t, true)).join(', ')}
          {zone ? <span className="text-on-surface-variant"> (your time zone)</span> : null}
        </p>
      ) : null}
      <p className="text-sm text-on-surface-variant">
        Agreed by both of you before it starts · never renews automatically · completed only when the classes are
        delivered
      </p>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </section>
  );
}
