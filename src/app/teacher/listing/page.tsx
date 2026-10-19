import type { Metadata } from 'next';
import Link from 'next/link';
import { FormMessage } from '@/components/forms/FormMessage';
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
import { getTeacherOffers, isPricingV2, offersForSnapshot } from '@/server/pricingModel';
import { ListingEditor } from './ListingEditor';
import { HourlyEditor } from './OfferEditors';
import { PackageEditor } from './PackageBuilder';
import { Badge, CardHead } from './builderUi';
import { SHELL, TILE, TILE_KEY } from './builderStyles';
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

const STATUS_INTRO: Record<ListingStatus, string> = {
  none: 'Not shown publicly yet. Fill in the details below and publish when ready.',
  draft: 'Not shown publicly yet. Fill in the details below and publish when ready.',
  published: 'Published: parents can find and open your listing.',
  paused: 'Paused: hidden from parents. Publish again any time to show it.',
  expired: 'Ended: hidden from parents until you renew it.',
  withdrawn: 'Withdrawn: closed. Publish again to start a new 60-day listing.',
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
  // CR-15: the new pricing model, only while the Super Admin switch is on (off until approved).
  const v2 = await isPricingV2(db());
  const offers = v2 ? await getTeacherOffers(db(), viewer.id) : null;
  const snapOffers = v2 ? await offersForSnapshot(db(), viewer.id) : null;
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
          Looking for students
        </h1>
        <p className="text-body-md text-on-surface-variant">
          Parents searching on AA Pro will see this listing and, once enquiries open, can send you an enquiry.
        </p>
      </div>

      {done && DONE[done] ? <FormMessage tone="success">{DONE[done]}</FormMessage> : null}
      <section aria-labelledby="ls-status" className={SHELL}>
        <CardHead
          id="ls-status"
          title="Your listing"
          intro={STATUS_INTRO[listing.status]}
          badge={
            <Badge tone={kind === 'success' ? 'good' : 'neutral'} icon={kind === 'success' ? 'check' : undefined}>
              {chip}
            </Badge>
          }
        />
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          {listing.status === 'published' || listing.publicId ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {listing.status === 'published' && listing.expiresAt ? (
                <div className={TILE}>
                  <span className={TILE_KEY}>Shown until</span>
                  <span className="font-headline text-[22px] font-bold">{day(listing.expiresAt)}</span>
                  <span className="text-[13px] text-on-surface-variant">
                    Listings are shown for 60 days, then renewed.
                  </span>
                </div>
              ) : null}
              {listing.publicId && listing.status === 'published' ? (
                <div className={TILE}>
                  <span className={TILE_KEY}>Public address</span>
                  <span className="break-all font-headline text-[18px] font-bold">/teachers/{listing.publicId}</span>
                  <span className="text-[13px] text-on-surface-variant">Anyone can open it, signed in or not.</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {listing.status === 'expired' ? (
            <FormMessage tone="warning">
              Your listing ended{listing.expiresAt ? ` on ${day(listing.expiresAt)}` : ''} and is hidden. Renew it to
              show it again.
            </FormMessage>
          ) : null}
          {listing.status === 'published' && listing.renewalDue && listing.expiresAt ? (
            <FormMessage tone="info">
              Your listing ends on {day(listing.expiresAt)}. Renew it to keep appearing. (A reminder email is queued in
              AA Pro; real email is not switched on yet.)
            </FormMessage>
          ) : null}
          {shown && listing.changedSincePublish ? (
            <FormMessage tone="info">
              Your public listing shows the details you agreed to earlier. Your profile or draft has changed since:
              check “What parents see” and publish again to show the latest details.
            </FormMessage>
          ) : null}
          {shown || listing.status === 'expired' ? (
            <ListingStatusButtons canPause={listing.status === 'published'} canWithdraw />
          ) : null}
          {listing.renewalDue ? <RenewForm /> : null}
          <details className="rounded-[16px] border border-card-border px-4 py-3">
            <summary className="cursor-pointer text-sm font-bold">What pause, withdraw and ended mean</summary>
            <p className="mt-2 text-[13px] leading-5 text-on-surface-variant">
              Paused: hidden from parents; publish again any time. Withdrawn: closed; publishing again starts a new
              listing. Ended: shown for 60 days, then hidden until you renew. To hide from parents&apos; Find a teacher
              search, use your{' '}
              <Link href="/teacher/profile" className="font-bold underline">
                profile
              </Link>
              .
            </p>
          </details>
        </div>
      </section>

      {offers ? (
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <HourlyEditor initial={offers.hourly} slots={offers.slots} masterOn={rates.on} />
          <PackageEditor
            initial={
              offers.package ?? {
                status: 'none',
                currency: null,
                priceMinor: null,
                classes: null,
                perWeek: null,
                minutes: null,
                weeks: null,
                times: [],
                negotiable: false,
                termsNote: null,
                reviewIssues: [],
              }
            }
            slots={offers.slots}
            masterOn={rates.on}
          />
        </div>
      ) : null}

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
        pricingV2={
          offers && snapOffers
            ? {
                hourly: snapOffers.hourly,
                package: snapOffers.package,
                slots: offers.slots.map((x) => ({ ...x, negotiable: x.negotiable && rates.on })),
                packageNegotiable: !!offers.package?.negotiable && rates.on,
              }
            : undefined
        }
      />
    </div>
  );
}
