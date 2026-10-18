import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { TIME_ZONES } from '@/config/timeZones';
import { requireRole } from '@/server/authz';
import { CURRICULA } from '@/server/children';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { siteBaseUrl } from '@/server/requestInfo';
import { getOwnListing, queueListingReminders, type ListingStatus } from '@/server/teacherListings';
import { getTeacherRateSettings } from '@/server/rateNegotiations';
import { ListingEditor } from './ListingEditor';
import { ListingStatusButtons, RenewForm } from './ListingStatusForms';

export const metadata: Metadata = { title: 'Looking for students' };
export const dynamic = 'force-dynamic';

const CHIP: Record<ListingStatus, [string, 'success' | 'warning' | 'neutral']> = {
  none: ['Not started', 'neutral'],
  draft: ['Draft · not shown', 'neutral'],
  published: ['Published', 'success'],
  paused: ['Paused · hidden', 'warning'],
  withdrawn: ['Withdrawn · hidden', 'neutral'],
  expired: ['Ended · hidden', 'warning'],
};

/**
 * Board D5 (approved, OC-82): "Looking for students" — the teacher's public listing with asking
 * prices. Only approved teachers reach this page (requireRole sends waiting teachers to their
 * status page); the server checks everything again.
 */
const DONE: Record<string, string> = {
  pause: 'Paused. Parents no longer see your listing. Publish again any time.',
  withdraw: 'Withdrawn. Your listing is closed. Publish again to start a new 60-day listing.',
  renew: 'Renewed for 60 days.',
};

export default async function TeacherListingPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Looking for students"
        body="Listings work with real accounts. The sample preview has no listing to edit."
        homeHref="/teacher"
        homeLabel="Go to my dashboard"
      />
    );
  }
  const viewer = access.viewer;
  const { done } = await searchParams;
  // Until a scheduler exists, reminders are queued when teachers open their pages (L-2).
  await queueListingReminders(db(), await siteBaseUrl());
  const listing = await getOwnListing(db(), viewer.id);
  const rates = await getTeacherRateSettings(db(), viewer.id);
  if (!listing) {
    return (
      <NotReadyYet
        title="Looking for students"
        body="You can create a listing once the AA Pro team approves your profile."
        homeHref="/teacher"
        homeLabel="Go to my dashboard"
      />
    );
  }
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: viewer.timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  const tzLabel = TIME_ZONES.find(([v]) => v === viewer.timeZone)?.[1] ?? viewer.timeZone;
  const [chip, kind] = CHIP[listing.status];
  const shown = listing.status === 'published' || listing.status === 'paused';
  return (
    <div className="flex max-w-[1240px] flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="flex flex-wrap items-center gap-3 text-headline-lg-mobile lg:text-headline-lg">
          Looking for students <StatusChip kind={kind}>{chip}</StatusChip>
        </h1>
        <p className="text-body-md text-on-surface-variant">
          Parents searching on AA Pro will see this listing and, once enquiries open, can send you an enquiry.
        </p>
      </div>

      {done && DONE[done] ? <FormMessage tone="success">{DONE[done]}</FormMessage> : null}
      <Card as="section" aria-labelledby="ls-status" className="flex flex-col gap-4 p-4 sm:p-6">
        <h2 id="ls-status" className="text-[20px] font-bold leading-7">
          Your listing
        </h2>
        {listing.status === 'published' && listing.expiresAt ? (
          <p className="text-[15px]">
            Published · shown until <strong>{day(listing.expiresAt)}</strong>.
          </p>
        ) : null}
        {listing.status === 'paused' ? (
          <p className="text-[15px]">Paused: hidden from parents. Publish again any time to show it.</p>
        ) : null}
        {listing.status === 'expired' ? (
          <FormMessage tone="warning">
            Your listing ended{listing.expiresAt ? ` on ${day(listing.expiresAt)}` : ''} and is hidden. Renew it to show
            it again.
          </FormMessage>
        ) : null}
        {listing.status === 'withdrawn' ? (
          <p className="text-[15px]">Withdrawn: closed. Publish again to start a new 60-day listing.</p>
        ) : null}
        {listing.status === 'draft' || listing.status === 'none' ? (
          <p className="text-[15px]">Not shown publicly yet. Fill in the details below and publish when ready.</p>
        ) : null}
        {listing.status === 'published' && listing.renewalDue && listing.expiresAt ? (
          <FormMessage tone="info">
            Your listing ends on {day(listing.expiresAt)}. Renew it to keep appearing. (A reminder email is queued in AA
            Pro; real email is not switched on yet.)
          </FormMessage>
        ) : null}
        {shown && listing.changedSincePublish ? (
          <FormMessage tone="info">
            Your public listing shows the details you agreed to earlier. Your profile or draft has changed since: check
            “What parents see” and publish again to show the latest details.
          </FormMessage>
        ) : null}
        {listing.publicId && listing.status === 'published' ? (
          <p className="text-sm text-on-surface-variant">
            Public address: /teachers/{listing.publicId} (public pages open in a later step).
          </p>
        ) : null}
        {shown || listing.status === 'expired' ? (
          <ListingStatusButtons canPause={listing.status === 'published'} canWithdraw />
        ) : null}
        {listing.renewalDue ? <RenewForm /> : null}
        <p className="text-sm text-on-surface-variant">
          Paused: hidden from parents; publish again any time. Withdrawn: closed; publishing again starts a new listing.
          Ended: shown for 60 days, then hidden until you renew. To hide from parents&apos; Find a teacher search, use
          your{' '}
          <Link href="/teacher/profile" className="font-bold underline">
            profile
          </Link>
          .
        </p>
      </Card>

      <ListingEditor
        approvedSubjects={listing.approvedSubjects}
        approvedGrades={listing.approvedGrades}
        curriculaOptions={CURRICULA}
        initial={{
          subjects: listing.subjects,
          grades: listing.grades,
          curricula: listing.preview.curricula,
          experienceYears: listing.preview.experienceYears,
          prices: listing.prices,
          negotiableModels: rates.models,
        }}
        rateNegotiationOn={rates.on}
        profile={{
          name: listing.preview.name,
          bio: listing.preview.bio,
          timeZone: listing.preview.timeZone,
          usualTimes: listing.preview.usualTimes,
          photoId: listing.preview.photoId,
        }}
        timeZoneLabel={tzLabel}
        shown={shown}
      />
    </div>
  );
}
