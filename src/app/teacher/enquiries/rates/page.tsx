import type { Metadata } from 'next';
import { FormMessage } from '@/components/forms/FormMessage';
import { EnquiryTabs } from '@/components/rates/EnquiryTabs';
import { NegotiationCard } from '@/components/rates/NegotiationCard';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { EmptyState } from '@/components/states/States';
import { dayAndTime } from '@/lib/linkRequests';
import { PAYMENT_NOTE, modelLabel } from '@/lib/rateNegotiation';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { listTeacherNegotiations, type TeacherNegotiation } from '@/server/rateNegotiations';

export const metadata: Metadata = { title: 'Rate proposals' };
export const dynamic = 'force-dynamic';

/**
 * Board RN5 (CR-13): rate proposals sent to this teacher, beside Enquiries (OC-99 (2)). Minimum
 * details only: grade, curriculum, subject and the parent's first name; never the child's name.
 */
export default async function TeacherRatesPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; offer?: string; until?: string }>;
}) {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Rate proposals"
        body="Rate proposals work with real accounts. The sample preview has none."
        homeHref="/teacher"
        homeLabel="Go to my dashboard"
      />
    );
  }
  const tz = access.viewer.timeZone;
  const { done, offer, until } = await searchParams;
  const list = await listTeacherNegotiations(db(), access.viewer.id);
  const waiting = list.filter((n) => n.turn === 'teacher').length;
  const untilDate = until && /^\d{10,14}$/.test(until) ? new Date(Number(until)) : null;
  const notice =
    done === 'countered'
      ? `Counter-offer sent${offer && /^[2-6]$/.test(offer) ? ` (offer ${offer} of 6)` : ''}. The parent has${untilDate ? ` until ${dayAndTime(untilDate, tz)}` : ' 14 days'} to answer.`
      : done === 'accepted'
        ? 'Agreed. The rate is recorded for you both. It doesn’t link you to a child; the parent sends a separate request you accept.'
        : done === 'declined'
          ? 'Declined. The parent can see it.'
          : null;
  const child = (n: TeacherNegotiation) =>
    `${n.prospective ? 'Prospective child · ' : ''}Grade ${n.grade}${n.curriculum ? ` · ${n.curriculum}` : ''}`;
  const active = list.filter((n) => n.status === 'pending' || n.status === 'countered');
  const ended = list.filter((n) => !(n.status === 'pending' || n.status === 'countered'));
  const card = (n: TeacherNegotiation) => (
    <li key={n.id}>
      <NegotiationCard
        n={n}
        side="teacher"
        title={`${child(n)} · ${SUBJECTS[n.subject as SubjectId]?.name ?? n.subject} · ${modelLabel(n.model)} · from ${n.parentFirstName}`}
        about={child(n)}
        otherName={n.parentFirstName}
        timeZone={tz}
      />
    </li>
  );
  return (
    <div className="flex max-w-[940px] flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Enquiries</h1>
        <p className="text-body-md text-on-surface-variant">
          Parents who proposed a different rate for one of your prices. You see only what helps you decide. Agreeing a
          rate doesn&apos;t link you to a child or show you their books; the parent sends a separate request you accept.
        </p>
        <EnquiryTabs base="/teacher/enquiries" current="rates" waiting={waiting} />
      </div>
      {notice ? <FormMessage tone="success">{notice}</FormMessage> : null}
      <section aria-labelledby="open" className="flex flex-col gap-3">
        <h2 id="open" className="text-headline-sm">
          Open ({active.length})
        </h2>
        {active.length ? (
          <ul className="m-0 flex list-none flex-col gap-4 p-0">{active.map(card)}</ul>
        ) : (
          <EmptyState title="No open proposals">
            Parents can propose a rate only for prices you open to proposals (dashboard and listing).
          </EmptyState>
        )}
      </section>
      {ended.length ? (
        <section aria-labelledby="ended" className="flex flex-col gap-3">
          <h2 id="ended" className="text-headline-sm">
            Agreed and ended ({ended.length})
          </h2>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">{ended.map(card)}</ul>
        </section>
      ) : null}
      <p className="text-sm text-on-surface-variant">{PAYMENT_NOTE}</p>
    </div>
  );
}
