import type { Metadata } from 'next';
import { Card } from '@/components/Card';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { TIME_ZONES } from '@/config/timeZones';
import { describeUsualTime } from '@/lib/usualTimes';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getUsualTimes } from '@/server/teacherUsualTimes';
import { UsualTimesForm } from './UsualTimesForm';

export const metadata: Metadata = { title: 'Availability' };
export const dynamic = 'force-dynamic';

/**
 * Teacher availability. PR-D1c adds the usual weekly times shown on a listing (boards D5, D9).
 * Bookable times, exceptions and time off come with scheduling (Phase 3, board M-23).
 */
export default async function TeacherAvailabilityPage() {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Availability"
        body="Your usual weekly times work with real accounts. Editing bookable availability comes with scheduling (Phase 3)."
        homeHref="/teacher"
        homeLabel="Go to my dashboard"
      />
    );
  }
  const viewer = access.viewer;
  const times = await getUsualTimes(db(), viewer.id);
  const tzLabel = TIME_ZONES.find(([value]) => value === viewer.timeZone)?.[1] ?? viewer.timeZone;
  return (
    <div className="flex max-w-[940px] flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Availability</h1>
        <p className="text-body-md text-on-surface-variant">
          Tell families when you are usually free to teach. Booking lessons comes with scheduling in a later phase.
        </p>
      </div>
      <Card as="section" aria-labelledby="usual-times" className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="usual-times" className="text-[20px] font-bold leading-7">
            Your usual weekly times
          </h2>
          <p className="text-[15px] leading-[22px] text-on-surface-variant">
            A guide for families: shown as &quot;Usually free&quot; on your listing. Nothing is booked or reserved from
            these times. Up to 14 times a week.
          </p>
        </div>
        {times.length ? <p className="text-[15px] font-bold">Now: {times.map(describeUsualTime).join(' · ')}</p> : null}
        <UsualTimesForm initial={times} timeZoneLabel={tzLabel} />
      </Card>
    </div>
  );
}
