import type { Metadata } from 'next';
import Link from 'next/link';
import { FormMessage } from '@/components/forms/FormMessage';
import { AccessDenied } from '@/components/states/AccessDenied';
import { SHELL } from '@/components/ui/styles';
import { SUBJECTS } from '@/fixtures/subjects';
import { clockNow } from '@/lib/clock';
import { cx } from '@/lib/cx';
import { formatClock, formatLessonTime, localDate } from '@/lib/lessonDisplay';
import { MOVE_TEXT } from '@/lib/moveText';
import { formatZoneName } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import {
  LESSON_MINUTES_MAX,
  LESSON_MINUTES_MIN,
  LESSON_MINUTES_STEP,
  moveTarget,
  NOTICE_HOURS,
  WINDOW_DAYS,
} from '@/server/lessons';
import { rolePlaceholder } from '@/server/placeholder';
import { plannableChapters, proposalBusyTimes } from '@/server/proposals';
import { MoveForm } from './MoveForm';

export const metadata: Metadata = { title: 'Move lesson' };
export const dynamic = 'force-dynamic';

const LENGTHS = Array.from(
  { length: (LESSON_MINUTES_MAX - LESSON_MINUTES_MIN) / LESSON_MINUTES_STEP + 1 },
  (_, i) => LESSON_MINUTES_MIN + i * LESSON_MINUTES_STEP,
);
const DemoPlaceholder = rolePlaceholder(
  'teacher',
  'Move lesson',
  'Moving a lesson is available with real accounts. The lesson stays booked until a parent accepts the new time.',
);

/**
 * TL-4: the teacher proposes a new time for one of their confirmed lessons. Only the lesson's own
 * teacher, while linked; only a confirmed lesson more than 30 minutes away with no move waiting
 * (lessons.moveTarget, checked again on sending and by the database). Anything else shows why.
 */
export default async function TeacherMovePage({ params }: { params: Promise<{ lessonId: string }> }) {
  if (isDemoMode()) return DemoPlaceholder();
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const { lessonId } = await params;
  const now = clockNow();
  const sql = db();
  const tz = access.viewer.timeZone;
  const target = await moveTarget(sql, { id: access.viewer.id, role: 'teacher' }, lessonId, now);
  if (!target.ok && target.reason === 'not_found') return <AccessDenied viewerRole="teacher" />;
  const back = (
    <Link href="/teacher/schedule" className="inline-flex min-h-11 items-center self-start font-bold">
      ‹ My schedule
    </Link>
  );
  if (!target.ok) {
    return (
      <div className="mx-auto flex max-w-[860px] flex-col gap-6">
        {back}
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Move lesson</h1>
        <FormMessage tone="info">{MOVE_TEXT[target.reason]}</FormMessage>
      </div>
    );
  }
  const l = target.lesson;
  const subjectName = SUBJECTS[l.subject].name;
  const chapters = await plannableChapters(sql, access.viewer.id, l.childId, l.subject);
  const busy = await proposalBusyTimes(sql, access.viewer.id, l.childId, l.subject, now);
  const zone = `${formatZoneName(now.toISOString(), { timeZone: tz })}, ${tz}`;
  const end = new Date(l.startsAt.getTime() + l.minutes * 60_000);
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6">
      {back}
      <div className="flex flex-col gap-2">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Move lesson</h1>
        <p className="m-0 text-body-md text-on-surface-variant">
          {subjectName} with {l.childName}, booked for {formatLessonTime(l.startsAt, tz)}–{formatClock(end, tz)} ·{' '}
          {l.minutes} min. It stays booked until a parent accepts the new time.
        </p>
      </div>
      <section aria-label="New time" className={cx(SHELL, 'flex flex-col gap-5 p-5 sm:p-7')}>
        <MoveForm
          lessonId={l.id}
          childName={l.childName}
          subjectName={subjectName}
          firstDate={localDate(new Date(now.getTime() + NOTICE_HOURS * 3_600_000), tz)}
          lastDate={localDate(new Date(now.getTime() + WINDOW_DAYS * 86_400_000), tz)}
          lengths={LENGTHS}
          defaultMinutes={l.minutes}
          chapters={chapters}
          zone={zone}
          busy={busy.map((b) => ({
            when: `${formatLessonTime(b.startsAt, tz)}–${formatClock(b.endsAt, tz)}`,
            whose: b.whose,
          }))}
        />
      </section>
    </div>
  );
}
