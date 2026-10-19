import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import { PUBLIC_WRAP, PublicShell } from '@/components/public/PublicShell';
import { cx } from '@/lib/cx';
import { dayAndTime } from '@/lib/linkRequests';
import { PRICE_MODEL_LABEL } from '@/lib/listing';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getPublicListing } from '@/server/publicListings';
import { proposalForm, prospectiveLabel } from '@/server/rateNegotiations';
import { realAuthEnabled } from '@/server/realAuth';
import { getViewer } from '@/server/session';
import { ProposeForm } from './ProposeForm';
import { ProposeOfferForm } from './ProposeOfferForm';

export const metadata: Metadata = { title: 'Propose a rate', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const H1 = 'font-headline text-[30px] font-extrabold leading-[38px]';

/**
 * Board RN2 (CR-13): propose a rate for one of a teacher's asking prices. Signed out: sign in or
 * create a parent account first (board D11), coming back to the same teacher and price.
 */
export default async function ProposePage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ price?: string; kind?: string; slot?: string }>;
}) {
  const { publicId } = await params;
  const { price, kind, slot } = await searchParams;
  // CR-15: which offer to preselect ("hourly|weekday:start:end" or "package").
  const priceIndex = price && /^[0-2]$/.test(price) ? Number(price) : 0;
  const validSlot = slot && /^[1-7]:\d{1,4}:\d{1,4}$/.test(slot) ? slot : null;
  const initialOffer = kind === 'package' ? 'package' : kind === 'hourly' && validSlot ? `hourly|${validSlot}` : '';
  // Sign-in brings the parent back here (account/actions.ts): an earlier price, the package or a time.
  const signInRate =
    kind === 'package' ? 'p' : kind === 'hourly' && validSlot ? `h${validSlot.replace(/:/g, '-')}` : String(priceIndex);
  const available = !isDemoMode() && realAuthEnabled();
  const listing = available ? await getPublicListing(db(), publicId) : null;
  const viewer = await getViewer();

  let body;
  if (!listing) {
    body = (
      <div className="pub-card flex flex-col items-start gap-3 rounded-lg p-6 md:p-8">
        <h1 className={H1}>Listing no longer available</h1>
        <p className="text-[15px]">This teacher isn&apos;t taking proposals right now. Nothing was sent.</p>
        <LinkButton href="/teachers">See other teachers</LinkButton>
      </div>
    );
  } else if (!viewer) {
    const chosen = listing.prices[priceIndex];
    body = (
      <div className="pub-card flex max-w-[720px] flex-col gap-4 rounded-lg p-6 md:p-8">
        <h1 className={H1}>Propose a rate to {listing.name}</h1>
        <p className="text-[16px] leading-6">
          To propose a rate, sign in or create a free parent account.
          {chosen ? (
            <>
              {' '}
              We&apos;ll bring you back to{' '}
              <strong>
                {listing.name} · {PRICE_MODEL_LABEL[chosen.model]}
              </strong>
              .
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-3">
          <LinkButton href={`/create-account?connect=${listing.publicId}`}>Create a parent account</LinkButton>
          <LinkButton href={`/sign-in?connect=${listing.publicId}&rate=${signInRate}`} variant="secondary">
            I already have an account — sign in
          </LinkButton>
        </div>
        <p className="text-sm text-on-surface-variant">
          A new account confirms its email first, then comes back to this teacher.
        </p>
      </div>
    );
  } else if (viewer.role !== 'parent') {
    body = (
      <div className="pub-card flex max-w-[720px] flex-col items-start gap-3 rounded-lg p-6 md:p-8">
        <h1 className={H1}>Only parents can propose a rate</h1>
        <p className="text-[15px]">Only parent accounts can propose rates to teachers. Nothing was sent.</p>
        <LinkButton href={`/teachers/${listing.publicId}`} variant="secondary">
          Back to {listing.name}
        </LinkButton>
      </div>
    );
  } else {
    const form = await proposalForm(db(), viewer.id, publicId);
    const v2 = form?.v2 ?? null;
    const openSlots = v2?.hourly ? v2.slots.filter((t) => t.negotiable) : [];
    const openPackage = v2?.package && v2.packageNegotiable ? v2.package : null;
    if (form && v2 && (openSlots.length || openPackage)) {
      const names = new Map(form.children.map((k) => [`child:${k.id}`, k.name]));
      body = (
        <div className="flex max-w-[860px] flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h1 className={cx(H1, 'md:text-[38px] md:leading-[46px]')}>Propose to {form.teacherName}</h1>
            <p className="text-[15px] text-on-surface-variant">
              The teacher answers within 14 days, or the proposal expires.
            </p>
          </div>
          <div className="pub-card rounded-lg p-5 md:p-8">
            <ProposeOfferForm
              publicId={form.publicId}
              teacherName={form.teacherName}
              subjects={form.subjects}
              hourly={openSlots.length ? v2.hourly : null}
              slots={openSlots.map(({ weekday, start, end }) => ({ weekday, start, end }))}
              pkg={openPackage}
              timeZone={v2.timeZone}
              kids={form.children.map((k) => ({
                id: k.id,
                label: `${k.name} · Grade ${k.grade}${k.curriculum ? ` · ${k.curriculum}` : ''}`,
                subjects: k.subjects,
              }))}
              waits={form.waits.map((w) => ({
                childKey: w.childKey,
                model: w.model,
                text: `${form.teacherName} and you ended a ${w.model === 'package' ? 'package' : 'hourly'} proposal for ${names.has(w.childKey) ? names.get(w.childKey) : prospectiveLabel(w.childKey)} with a decline. You can propose again from ${dayAndTime(w.until, viewer.timeZone)}.`,
              }))}
              initial={initialOffer}
            />
          </div>
          <p className="text-sm text-on-surface-variant">
            Up to {form.limits.activePerParent} proposals can be open at once, and {form.limits.newPerDay} new ones a
            day, counting hourly and package proposals together. Follow yours in{' '}
            <Link href="/parent/enquiries/rates" className="font-bold underline">
              Rate proposals
            </Link>
            .
          </p>
        </div>
      );
    } else if (!form || form.prices.length === 0) {
      body = (
        <div className="pub-card flex max-w-[720px] flex-col items-start gap-3 rounded-lg p-6 md:p-8">
          <h1 className={H1}>Fixed prices only</h1>
          <p className="text-[15px]">
            {listing.name} isn&apos;t taking rate proposals right now. The asking prices still apply, and you can send
            an enquiry instead.
          </p>
          <div className="flex flex-wrap gap-3">
            <LinkButton href={`/teachers/${listing.publicId}/connect`}>Connect with teacher</LinkButton>
            <LinkButton href={`/teachers/${listing.publicId}`} variant="secondary">
              Back to {listing.name}
            </LinkButton>
          </div>
        </div>
      );
    } else {
      const names = new Map(form.children.map((k) => [`child:${k.id}`, k.name]));
      body = (
        <div className="flex max-w-[860px] flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h1 className={cx(H1, 'md:text-[38px] md:leading-[46px]')}>Propose a rate to {form.teacherName}</h1>
            <p className="text-[15px] text-on-surface-variant">
              The teacher answers within 14 days, or the proposal expires.
            </p>
          </div>
          <div className="pub-card rounded-lg p-5 md:p-8">
            <ProposeForm
              publicId={form.publicId}
              teacherName={form.teacherName}
              subjects={form.subjects}
              prices={form.prices}
              kids={form.children.map((k) => ({
                id: k.id,
                label: `${k.name} · Grade ${k.grade}${k.curriculum ? ` · ${k.curriculum}` : ''}`,
                subjects: k.subjects,
              }))}
              waits={form.waits.map((w) => ({
                childKey: w.childKey,
                model: w.model,
                text: `${form.teacherName} and you ended a proposal for ${names.has(w.childKey) ? names.get(w.childKey) : prospectiveLabel(w.childKey)} at this price with a decline. You can propose again from ${dayAndTime(w.until, viewer.timeZone)}.`,
              }))}
              initialPrice={priceIndex}
            />
          </div>
          <p className="text-sm text-on-surface-variant">
            Up to {form.limits.activePerParent} proposals can be open at once, and {form.limits.newPerDay} new ones a
            day. Follow yours in{' '}
            <Link href="/parent/enquiries/rates" className="font-bold underline">
              Rate proposals
            </Link>
            .
            {form.fixed.length
              ? ` ${form.fixed.map((p) => PRICE_MODEL_LABEL[p.model]).join(', ')}: fixed price, not open to proposals.`
              : ''}
          </p>
        </div>
      );
    }
  }

  return (
    <PublicShell>
      <main className={cx(PUBLIC_WRAP, 'flex flex-col gap-6 py-10 md:py-14')}>
        <nav aria-label="Breadcrumb" className="text-sm text-on-surface-variant">
          <Link href="/" className="font-bold">
            Home
          </Link>{' '}
          ›{' '}
          <Link href="/teachers" className="font-bold">
            Teachers
          </Link>
          {listing ? (
            <>
              {' '}
              ›{' '}
              <Link href={`/teachers/${listing.publicId}`} className="font-bold">
                {listing.name}
              </Link>
            </>
          ) : null}
        </nav>
        {body}
      </main>
    </PublicShell>
  );
}
