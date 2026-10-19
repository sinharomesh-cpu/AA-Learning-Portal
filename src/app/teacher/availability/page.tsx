import type { Metadata } from 'next';
import { Icon } from '@/components/icons/Icon';
import { PanelHead } from '@/components/ui/Panel';
import { SHELL } from '@/components/ui/styles';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { TIME_ZONES } from '@/config/timeZones';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getOwnPackage } from '@/server/pricingModel';
import { getUsualTimes } from '@/server/teacherUsualTimes';
import { AvailabilityPlanner } from './AvailabilityPlanner';

export const metadata: Metadata = { title: 'Availability' };
export const dynamic = 'force-dynamic';

/**
 * Teacher availability. PR-D1c adds the usual weekly times shown on a listing (boards D5, D9).
 * Bookable times, exceptions and time off come with scheduling (Phase 3, board M-23).
 * AV0–AV1 (approved 19 Oct 2026): the week calendar with "add to several days".
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
  const [times, pkg] = await Promise.all([getUsualTimes(db(), viewer.id), getOwnPackage(db(), viewer.id)]);
  // CR-15 reading 4: an offered package's class times must stay inside the usual times.
  const lock = pkg && pkg.status === 'offered' && pkg.minutes ? { times: pkg.times, minutes: pkg.minutes } : null;
  const tzLabel = TIME_ZONES.find(([value]) => value === viewer.timeZone)?.[1] ?? viewer.timeZone;
  return (
    <div className="flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Availability</h1>
        <p className="text-body-md text-on-surface-variant">
          Tell families when you are usually free to teach. Booking lessons comes with scheduling in a later phase.
        </p>
      </div>
      <section aria-labelledby="usual-times" className={SHELL}>
        <PanelHead
          id="usual-times"
          title="Your usual weekly times"
          intro={
            <>
              Add the same time to several days at once; on a computer you can also drag on the week calendar. Shown to
              families as &quot;Usually free&quot;; nothing is booked or reserved from these times. Up to 14 times a
              week.
            </>
          }
          badge={
            times.length ? (
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-success-border bg-success-container px-3 text-[13px] font-extrabold text-on-success-container">
                <Icon name="check" size={16} />
                {times.length === 1 ? '1 time saved' : `${times.length} times saved`}
              </span>
            ) : null
          }
        />
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <AvailabilityPlanner initial={times} timeZoneLabel={tzLabel} lock={lock} />
        </div>
      </section>
    </div>
  );
}
