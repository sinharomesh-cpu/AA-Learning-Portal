import type { Metadata } from 'next';
import { BookedOutcome, NotOpenOutcome } from '@/components/booking/BookingOutcome';
import { AccessDenied } from '@/components/states/AccessDenied';
import { checkDemoBooking } from '@/fixtures/aiBooking';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Your AI lesson' };

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * M-17 booking outcome (boards 28 and 49). DEMO ONLY: the choice is re-checked on the server
 * for the signed-in student (FR-006.2 pattern) and nothing is stored. "Time just taken" and
 * "Something went wrong" need real concurrent bookings (Phase 3); they are shown on the
 * design-system review page.
 */
export default async function BookingResultPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const q = await searchParams;
  const result = checkDemoBooking(access.viewer.id, {
    subject: one(q.subject),
    chapter: one(q.chapter),
    start: one(q.start),
    length: one(q.length),
  });

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
      {result.ok ? (
        <BookedOutcome
          subjectName={result.booking.subjectName}
          chapter={result.booking.chapter}
          dayLabel={result.booking.dayLabel}
          timeLabel={result.booking.timeLabel}
          length={result.booking.length}
        />
      ) : (
        <NotOpenOutcome />
      )}
    </div>
  );
}
