import type { Metadata } from 'next';
import { EnquiryTabs } from '@/components/rates/EnquiryTabs';
import Link from 'next/link';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { type EnquiryStatus, listParentEnquiries } from '@/server/teacherEnquiries';
import { WithdrawForm } from './WithdrawForm';

export const metadata: Metadata = { title: 'My enquiries' };
export const dynamic = 'force-dynamic';

const CHIP: Record<EnquiryStatus, [string, 'warning' | 'success' | 'neutral']> = {
  pending: ['Waiting for answer', 'warning'],
  accepted: ['Accepted', 'success'],
  declined: ['Declined', 'neutral'],
  withdrawn: ['Withdrawn', 'neutral'],
  expired: ['Expired', 'neutral'],
};

/**
 * Board D4: the parent's enquiries. An accepted enquiry gives no access: the parent adds the
 * teacher through the existing linking (OC-75), and booking comes in Phase 3.
 */
export default async function ParentEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; withdrawn?: string }>;
}) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="My enquiries"
        body="Enquiries work with real accounts. The sample preview has no enquiries."
        homeHref="/parent"
        homeLabel="Go to family home"
      />
    );
  }
  const viewer = access.viewer;
  const { sent, withdrawn } = await searchParams;
  const enquiries = await listParentEnquiries(db(), viewer.id);
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: viewer.timeZone, day: 'numeric', month: 'short' }).format(d);
  return (
    <div className="flex max-w-[940px] flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">My enquiries</h1>
        <p className="text-body-md text-on-surface-variant">
          Enquiries you sent to teachers. Sending one books nothing and shares nothing beyond the grade, curriculum and
          subjects.
        </p>
        <EnquiryTabs base="/parent/enquiries" current="enquiries" />
      </div>
      {sent ? (
        <FormMessage tone="success">
          Enquiry sent. The teacher has 14 days to answer. No lesson is booked and nothing about your child is shared
          beyond grade, curriculum and subjects.
        </FormMessage>
      ) : null}
      {withdrawn ? <FormMessage tone="success">Enquiry withdrawn.</FormMessage> : null}
      {enquiries.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-[16px]">You haven&apos;t sent any enquiries yet.</p>
          <LinkButton href="/teachers">Find a teacher</LinkButton>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {enquiries.map((e) => {
            const [chip, kind] = CHIP[e.status];
            const who = e.childName ?? `Grade ${e.grade}${e.curriculum ? ` · ${e.curriculum}` : ''}`;
            const subjects = e.subjects.map((s) => SUBJECTS[s as SubjectId]?.name ?? s).join(', ');
            return (
              <li key={e.id}>
                <Card as="article" aria-labelledby={`enq-${e.id}`} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id={`enq-${e.id}`} className="text-[20px] font-bold leading-7">
                      {e.teacherName} · {who} · {subjects}
                    </h2>
                    <StatusChip kind={kind}>{chip}</StatusChip>
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    Sent {day(e.sentAt)}
                    {e.status === 'pending' ? ` · ends ${day(e.expiresAt)} if not answered` : ''}
                    {e.answeredAt ? ` · answered ${day(e.answeredAt)}` : ''}
                    {e.askingPrice ? ` · asking price when sent: ${e.askingPrice}` : ''}
                  </p>
                  {e.teacherNote ? (
                    <p className="whitespace-pre-line rounded-[14px] bg-surface-container-low px-3 py-2 text-[15px]">
                      <strong>From the teacher:</strong> {e.teacherNote}
                    </p>
                  ) : null}
                  {e.status === 'pending' ? <WithdrawForm enquiryId={e.id} teacherName={e.teacherName} /> : null}
                  {e.status === 'accepted' ? (
                    <div className="flex flex-col gap-2 rounded-[18px] border border-card-border p-4 text-[15px] leading-[22px]">
                      <strong>Next steps</strong>
                      <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
                        <li>
                          Add the teacher{e.childName ? ` for ${e.childName.split(' ')[0]}` : ''} so they can see the
                          books for the subjects you choose.
                        </li>
                        <li>Agree the time, length and price with the teacher. (Booking opens in a later phase.)</li>
                        <li>
                          Pay the teacher directly, as you agree with them. AA Pro isn&apos;t involved in payment.
                        </li>
                      </ol>
                      <div>
                        <LinkButton href={`/parent/teachers/find/${e.teacherId}`}>
                          Add teacher{e.childName ? ` for ${e.childName.split(' ')[0]}` : ''}
                        </LinkButton>
                      </div>
                    </div>
                  ) : null}
                  {e.status === 'expired' ? (
                    <p className="text-[15px]">No answer within 14 days. You can send a new enquiry.</p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-sm text-on-surface-variant">
        You can have up to 5 enquiries waiting for an answer, and one active enquiry per teacher and child.{' '}
        <Link href="/teachers" className="font-bold underline">
          Find more teachers
        </Link>
        .
      </p>
    </div>
  );
}
