import type { Metadata } from 'next';
import { LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { EnquiryTabs } from '@/components/rates/EnquiryTabs';
import { NegotiationCard } from '@/components/rates/NegotiationCard';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { EmptyState } from '@/components/states/States';
import { dayAndTime } from '@/lib/linkRequests';
import { PRICE_MODEL_LABEL } from '@/lib/listing';
import { PAYMENT_NOTE } from '@/lib/rateNegotiation';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { listParentNegotiations, type ParentNegotiation } from '@/server/rateNegotiations';

export const metadata: Metadata = { title: 'Rate proposals' };
export const dynamic = 'force-dynamic';

/** Boards RN3 and RN7 (CR-13): the parent's rate proposals, beside My enquiries (OC-99 (2)). */
export default async function ParentRatesPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; done?: string; offer?: string; until?: string }>;
}) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Rate proposals"
        body="Rate proposals work with real accounts. The sample preview has none."
        homeHref="/parent"
        homeLabel="Go to family home"
      />
    );
  }
  const viewer = access.viewer;
  const tz = viewer.timeZone;
  const { sent, done, offer, until } = await searchParams;
  const list = await listParentNegotiations(db(), viewer.id);
  const justSent = sent ? list.find((n) => n.id === sent) : undefined;
  const untilDate = until && /^\d{10,14}$/.test(until) ? new Date(Number(until)) : null;
  const notice =
    done === 'countered'
      ? `Counter-offer sent${offer && /^[2-6]$/.test(offer) ? ` (offer ${offer} of 6)` : ''}. The teacher has${untilDate ? ` until ${dayAndTime(untilDate, tz)}` : ' 14 days'} to answer.`
      : done === 'accepted'
        ? 'Agreed. The rate is recorded for you both. Nothing is booked or paid through AA Pro.'
        : done === 'declined'
          ? 'Declined. The teacher can see it. A new proposal to this teacher for the same child and price is possible after 7 days.'
          : done === 'withdrawn'
            ? 'Withdrawn. The teacher can no longer answer it. You can propose again at any time.'
            : justSent
              ? `Proposal sent. ${justSent.teacherName} has until ${dayAndTime(justSent.expiresAt, tz)} to answer.`
              : null;
  const yourTurn = list.filter((n) => n.turn === 'parent').length;
  const about = (n: ParentNegotiation) =>
    n.childName ?? `a Grade ${n.grade}${n.curriculum ? ` (${n.curriculum})` : ''} child`;
  return (
    <div className="flex max-w-[940px] flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">My enquiries</h1>
        <p className="text-body-md text-on-surface-variant">
          Rates you proposed to teachers, and their answers. An agreed rate is a record only: it books nothing and
          shares nothing about your child.
        </p>
        <EnquiryTabs base="/parent/enquiries" current="rates" />
      </div>
      {notice ? <FormMessage tone="success">{notice}</FormMessage> : null}
      {yourTurn ? (
        <FormMessage tone="info">
          {yourTurn === 1 ? '1 proposal waits' : `${yourTurn} proposals wait`} for your answer.
        </FormMessage>
      ) : null}
      {list.length === 0 ? (
        <EmptyState title="No rate proposals yet" action={<LinkButton href="/teachers">Browse teachers</LinkButton>}>
          On a teacher&apos;s page, &quot;Propose a rate&quot; appears beside prices that take proposals.
        </EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {list.map((n) => (
            <li key={n.id}>
              <NegotiationCard
                n={n}
                side="parent"
                title={`${n.teacherName} · ${n.childName ?? `Grade ${n.grade}${n.curriculum ? ` · ${n.curriculum}` : ''} (not added yet)`} · ${PRICE_MODEL_LABEL[n.model]}`}
                about={about(n)}
                otherName={n.teacherName}
                timeZone={tz}
                footer={
                  n.status === 'accepted' ? (
                    <div className="flex flex-wrap items-center gap-3">
                      {n.childId ? (
                        <LinkButton href={`/parent/teachers/find/${n.teacherId}`} variant="secondary">
                          Ask this teacher to teach {n.childName}
                        </LinkButton>
                      ) : (
                        <LinkButton href="/parent/children/new" variant="secondary">
                          Add your child first
                        </LinkButton>
                      )}
                      <span className="text-sm text-on-surface-variant">
                        Agreeing a rate doesn&apos;t link the teacher. This sends the separate request the teacher
                        accepts.
                      </span>
                    </div>
                  ) : n.status === 'expired' || n.status === 'withdrawn' ? (
                    <div>
                      <LinkButton href={`/teachers/${n.publicId}`} variant="secondary">
                        Propose again
                      </LinkButton>
                    </div>
                  ) : null
                }
              />
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-on-surface-variant">{PAYMENT_NOTE}</p>
    </div>
  );
}
