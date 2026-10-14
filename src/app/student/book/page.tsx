import type { Metadata } from 'next';
import { clockNow } from '@/lib/clock';
import { AccessDenied } from '@/components/states/AccessDenied';
import { AI_LESSON_LENGTHS, bookingDays, chaptersFor } from '@/fixtures/aiBooking';
import { findPersona } from '@/fixtures/personas';
import type { SubjectId } from '@/fixtures/subjects';
import { SUBJECTS } from '@/fixtures/subjects';
import { formatZoneName } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { BookingWizard } from './BookingWizard';

export const metadata: Metadata = { title: 'Book an AI class' };

/** S13 AI booking wizard (boards 7 and 8). Demo only: nothing is booked (G1-10 WP-8). */
export default async function StudentBookPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const access = await requireRole('student');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  // The student id comes from the session only (FR-002.2).
  const persona = findPersona(access.viewer.id);
  const studentId = access.viewer.id;
  const subjectIds: SubjectId[] = persona?.subjects ?? [];
  const requested = (await searchParams).subject;
  const initialSubject = subjectIds.find((s) => s === requested);
  const now = clockNow();
  const tz = access.viewer.timeZone;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Book a lesson with the AI Tutor</h1>
        <p className="text-[15px] leading-[22px] text-on-surface-variant">
          Pick a subject and one of your open times. Grey times are not open.
        </p>
      </div>
      <p className="rounded-[16px] border border-dashed border-secondary bg-warning-container px-3 py-2 text-sm leading-5 text-on-warning-container">
        <strong>Demo:</strong> this is a preview with sample data. Nothing is really booked.
      </p>
      <BookingWizard
        subjects={subjectIds.map((id) => ({ id, name: SUBJECTS[id].name }))}
        chapters={Object.fromEntries(subjectIds.map((id) => [id, chaptersFor(studentId, id)]))}
        days={bookingDays(studentId, now)}
        zoneName={formatZoneName(now.toISOString(), { timeZone: tz })}
        lengths={AI_LESSON_LENGTHS}
        initialSubject={initialSubject}
      />
    </div>
  );
}
