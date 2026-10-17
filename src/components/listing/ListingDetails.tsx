import type { ReactNode } from 'react';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { describeGrades } from '@/lib/grades';
import { describePrice, type ListingSnapshot, PRICE_MODEL_LABEL } from '@/lib/listing';
import { formatMinute, WEEKDAYS } from '@/lib/usualTimes';

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
}: {
  listing: ListingSnapshot;
  /** URL of the approved photo the viewer may see, or null for the initial. */
  photoSrc: string | null;
  headingLevel?: 1 | 2 | 3;
  /** How the usual times are shown, e.g. "Your time zone (India (IST))". */
  timesNote: string;
  /** Replaces the list of usual times (e.g. converted to the viewer's time zone). */
  timesSlot?: ReactNode;
}) {
  const H = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'h3';
  const Sub = headingLevel === 1 ? 'h2' : headingLevel === 2 ? 'h3' : 'h4';
  const subjects = listing.subjects.map((s) => SUBJECTS[s as SubjectId]?.name ?? s);
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
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-on-surface-variant">No prices given. Ask the teacher.</p>
        )}
        <p className="text-sm text-on-surface-variant">
          Set by the teacher. You agree the final price with the teacher and pay them directly. AA Pro doesn&apos;t
          take, hold or refund payments.
        </p>
      </section>
    </div>
  );
}
