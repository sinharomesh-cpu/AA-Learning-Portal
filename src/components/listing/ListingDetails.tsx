import type { ReactNode } from 'react';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { describeGrades } from '@/lib/grades';
import { describePrice, type ListingSnapshot, PRICE_MODEL_LABEL } from '@/lib/listing';
import { formatMinute, WEEKDAYS } from '@/lib/usualTimes';
import { HourlyOfferBox, type OfferSlot, PackageOfferBox } from './Offers';

/**
 * The public details of a listing (boards D5 "What parents see", D3, D9): only the fields the
 * teacher agreed to show. Never contact details, accounts or anything about children.
 * Used for the teacher's live preview now and for public listing pages (PR-D3).
 */
export function initialOf(name: string): string {
  return [...name.replace(/^(Teacher|Mr\.?|Ms\.?|Mrs\.?|Dr\.?)\s+/i, '')][0]?.toUpperCase() ?? '?';
}

export function ListingDetails({
  listing,
  photoSrc,
  headingLevel = 3,
  timesNote,
  timesSlot,
  priceActions,
  offers,
  convertTimes = false,
}: {
  listing: ListingSnapshot;
  /** URL of the approved photo the viewer may see, or null for the initial. */
  photoSrc: string | null;
  headingLevel?: 1 | 2 | 3;
  /** How the usual times are shown, e.g. "Your time zone (India (IST))". */
  timesNote: string;
  /** Replaces the list of usual times (e.g. converted to the viewer's time zone). */
  timesSlot?: ReactNode;
  /** CR-13 RN1: "Propose a rate" or "Fixed price" beside each asking price (public page only). */
  priceActions?: ReactNode[];
  /**
   * CR-15: the usual times with their live Fixed / Negotiable setting (same order as
   * listing.usualTimes) and the package's setting. Used when the copy carries hourly / package.
   */
  offers?: { slots: OfferSlot[]; packageNegotiable: boolean; slotActions?: ReactNode[]; packageAction?: ReactNode };
  /** Convert offer times to the viewer's time zone (public pages). */
  convertTimes?: boolean;
}) {
  const H = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'h3';
  const Sub = headingLevel === 1 ? 'h2' : headingLevel === 2 ? 'h3' : 'h4';
  const subjects = listing.subjects.map((s) => SUBJECTS[s as SubjectId]?.name ?? s);
  const v2 = listing.hourly !== undefined || listing.package !== undefined;
  const slots = offers?.slots ?? listing.usualTimes.map((t) => ({ ...t, negotiable: false }));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-4">
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- small approved photo from our own route
          <img
            src={photoSrc}
            alt={`Photo of ${listing.name}`}
            width={72}
            height={72}
            className="size-[72px] flex-none rounded-[20px] border border-card-border object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-[72px] flex-none items-center justify-center rounded-[20px] bg-primary-fixed font-headline text-[30px] font-extrabold text-on-primary-fixed"
          >
            {initialOf(listing.name)}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <H
            className={
              headingLevel === 1
                ? 'font-headline text-[30px] font-extrabold leading-[38px] md:text-[38px] md:leading-[46px]'
                : 'text-[22px] font-bold leading-7'
            }
          >
            {listing.name}
          </H>
          <p className="text-[15px] font-bold text-primary">{subjects.join(' · ') || 'No subjects chosen'}</p>
          <span className="self-start rounded-full border border-success-border bg-success-container px-2.5 py-0.5 text-xs font-bold text-on-success-container">
            Looking for students
          </span>
        </div>
      </div>

      <dl className="m-0 grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-[auto_1fr]">
        <dt className="font-bold">Grades</dt>
        <dd className="m-0">{listing.grades.length ? describeGrades(listing.grades) : 'No grades chosen'}</dd>
        {listing.curricula.length ? (
          <>
            <dt className="font-bold">Curriculum</dt>
            <dd className="m-0">{listing.curricula.join(', ')}</dd>
          </>
        ) : null}
        {listing.experienceYears !== null ? (
          <>
            <dt className="font-bold">Experience</dt>
            <dd className="m-0">
              {listing.experienceYears} {listing.experienceYears === 1 ? 'year' : 'years'}{' '}
              <span className="text-on-surface-variant">(as stated by the teacher)</span>
            </dd>
          </>
        ) : null}
        <dt className="font-bold">How</dt>
        <dd className="m-0">Online (Zoom)</dd>
      </dl>

      {listing.bio ? <p className="whitespace-pre-line text-[15px] leading-6">{listing.bio}</p> : null}

      {v2 && listing.hourly ? null : (
        <section aria-label="Usually free" className="flex flex-col gap-2">
          <Sub className="text-[16px] font-bold">Usually free</Sub>
          {timesSlot ? (
            timesSlot
          ) : listing.usualTimes.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]">
              {listing.usualTimes.map((t) => (
                <li key={`${t.weekday}-${t.start}`}>
                  <span className="font-bold">{WEEKDAYS[t.weekday - 1]}</span> {formatMinute(t.start)}–
                  {t.end === 1440 ? '12:00 am' : formatMinute(t.end)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-on-surface-variant">No usual times given.</p>
          )}
          <p className="text-sm text-on-surface-variant">{timesNote} A guide only; lessons are agreed later.</p>
        </section>
      )}

      {v2 ? (
        <section aria-label="Ways to learn" className="flex flex-col gap-3">
          <Sub className="text-[16px] font-bold">Ways to learn</Sub>
          {listing.hourly ? (
            <HourlyOfferBox
              hourly={listing.hourly}
              slots={slots}
              teacherZone={listing.timeZone}
              convert={convertTimes}
              slotActions={offers?.slotActions}
              headingLevel={headingLevel === 1 ? 3 : 4}
            />
          ) : null}
          {listing.package ? (
            <PackageOfferBox
              pkg={listing.package}
              negotiable={offers?.packageNegotiable ?? false}
              teacherZone={listing.timeZone}
              convert={convertTimes}
              action={offers?.packageAction}
              headingLevel={headingLevel === 1 ? 3 : 4}
            />
          ) : null}
          {!listing.hourly && !listing.package ? (
            <p className="text-[15px] text-on-surface-variant">
              No hourly lessons or package listed yet. Ask the teacher.
            </p>
          ) : null}
          <p className="text-sm text-on-surface-variant">
            Two separate options, each priced by the teacher. You agree the final arrangement with the teacher and pay
            them directly. AA Pro doesn&apos;t take, hold or refund payments.
          </p>
        </section>
      ) : null}
      {v2 ? null : (
        <section aria-label="Asking prices" className="flex flex-col gap-2">
          <Sub className="text-[16px] font-bold">Asking prices</Sub>
          {listing.prices.length ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {listing.prices.map((p, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-[14px] bg-surface-container-low px-3 py-2 text-[15px]"
                >
                  <span className="font-bold">{PRICE_MODEL_LABEL[p.model]}</span>
                  <span>{describePrice(p)}</span>
                  {priceActions?.[i] ? <span className="ml-auto pt-1">{priceActions[i]}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-on-surface-variant">No prices given. Ask the teacher.</p>
          )}
          <p className="text-sm text-on-surface-variant">
            Set by the teacher.{priceActions ? ' "Propose a rate" appears only where the teacher accepts offers.' : ''}{' '}
            You agree the final price with the teacher and pay them directly. AA Pro doesn&apos;t take, hold or refund
            payments.
          </p>
        </section>
      )}
    </div>
  );
}
