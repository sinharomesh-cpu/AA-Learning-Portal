import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import { PUBLIC_WRAP, PublicShell } from '@/components/public/PublicShell';
import { cx } from '@/lib/cx';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getPublicListing } from '@/server/publicListings';
import { realAuthEnabled } from '@/server/realAuth';
import { getViewer } from '@/server/session';
import { connectForm, takeRememberedConnect } from '@/server/teacherEnquiries';
import { negotiablePriceFlags } from '@/server/rateNegotiations';
import { EnquiryForm } from './EnquiryForm';

export const metadata: Metadata = { title: 'Connect with a teacher', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Board D11: "Connect with teacher". Signed out: sign in or create a parent account and come
 * back here. Signed in as a parent: the enquiry form (D3). Anyone else: nothing is sent.
 */
export default async function ConnectPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const available = !isDemoMode() && realAuthEnabled();
  const listing = available ? await getPublicListing(db(), publicId) : null;
  const viewer = await getViewer();

  const gone = (
    <div className="pub-card flex flex-col items-start gap-3 rounded-lg p-6 md:p-8">
      <h1 className="font-headline text-[30px] font-extrabold leading-[38px]">Listing no longer available</h1>
      <p className="text-[15px]">This teacher isn&apos;t taking enquiries right now. Nothing was sent.</p>
      <LinkButton href="/teachers">See other teachers</LinkButton>
    </div>
  );

  let body;
  if (!listing) {
    // The saved choice is forgotten when the listing has gone meanwhile (D11).
    if (viewer?.role === 'parent' && available) await takeRememberedConnect(db(), viewer.id);
    body = gone;
  } else if (!viewer) {
    body = (
      <div className="pub-card flex max-w-[720px] flex-col gap-4 rounded-lg p-6 md:p-8">
        <h1 className="font-headline text-[30px] font-extrabold leading-[38px]">Connect with {listing.name}</h1>
        <p className="text-[16px] leading-6">
          To send an enquiry, sign in or create a free parent account. We&apos;ll bring you straight back here.
        </p>
        <div className="flex flex-wrap gap-3">
          <LinkButton href={`/create-account?connect=${listing.publicId}`}>Create a parent account</LinkButton>
          <LinkButton href={`/sign-in?connect=${listing.publicId}`} variant="secondary">
            I already have an account — sign in
          </LinkButton>
        </div>
        <p className="text-sm text-on-surface-variant">
          Teachers register separately and can&apos;t connect through listings.
        </p>
      </div>
    );
  } else if (viewer.role !== 'parent') {
    body = (
      <div className="pub-card flex max-w-[720px] flex-col items-start gap-3 rounded-lg p-6 md:p-8">
        <h1 className="font-headline text-[30px] font-extrabold leading-[38px]">Only parents can connect</h1>
        <p className="text-[15px]">Only parent accounts can connect with teachers. Nothing was sent.</p>
        <LinkButton href={`/teachers/${listing.publicId}`} variant="secondary">
          Back to {listing.name}
        </LinkButton>
      </div>
    );
  } else {
    const form = await connectForm(db(), viewer.id, publicId);
    // CR-13: a parent who came here from "Propose a rate" (e.g. after creating an account) can go on.
    const canPropose = form ? (await negotiablePriceFlags(db(), publicId)).some(Boolean) : false;
    body = form ? (
      <div className="flex max-w-[860px] flex-col gap-5">
        <h1 className="font-headline text-[30px] font-extrabold leading-[38px] md:text-[38px] md:leading-[46px]">
          Send an enquiry to {form.teacherName}
        </h1>
        {canPropose ? (
          <p className="text-[15px]">
            Want to offer a different rate for one of the teacher&apos;s prices?{' '}
            <Link href={`/teachers/${form.publicId}/propose`} className="font-bold underline">
              Propose a rate instead
            </Link>
            .
          </p>
        ) : null}
        <div className="pub-card rounded-lg p-5 md:p-8">
          <EnquiryForm
            publicId={form.publicId}
            teacherName={form.teacherName}
            subjects={form.subjects}
            usualTimes={form.usualTimes}
            teacherZone={form.teacherZone}
            prices={form.prices}
            kids={form.children}
          />
        </div>
        <p className="text-sm text-on-surface-variant">
          Up to 5 enquiries can wait for an answer, and one active enquiry per teacher and child. Unanswered enquiries
          end after 14 days. Follow yours in{' '}
          <Link href="/parent/enquiries" className="font-bold underline">
            My enquiries
          </Link>
          .
        </p>
      </div>
    ) : (
      gone
    );
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
