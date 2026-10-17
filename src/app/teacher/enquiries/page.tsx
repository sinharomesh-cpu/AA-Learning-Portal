import type { Metadata } from 'next';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { type EnquiryStatus, listTeacherEnquiries, type TeacherEnquiry } from '@/server/teacherEnquiries';
import { AnswerForm } from './AnswerForm';

export const metadata: Metadata = { title: 'Enquiries' };
export const dynamic = 'force-dynamic';

const CHIP: Record<EnquiryStatus, [string, 'warning' | 'success' | 'neutral']> = {
  pending: ['Waiting', 'warning'],
  accepted: ['Accepted', 'success'],
  declined: ['Declined', 'neutral'],
  withdrawn: ['Withdrawn by the parent', 'neutral'],
  expired: ['Expired', 'neutral'],
};

/**
 * Board D6: enquiries addressed to this teacher. Only the parent's first name and the child's
 * grade, curriculum and subjects are shown — never the child's name or learning data. Accepting
 * creates no lesson and gives no access (OC-75 linking is the parent's step).
 */
export default async function TeacherEnquiriesPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Enquiries"
        body="Enquiries work with real accounts. The sample preview has no enquiries."
        homeHref="/teacher"
        homeLabel="Go to my dashboard"
      />
    );
  }
  const viewer = access.viewer;
  const { done } = await searchParams;
  const all = await listTeacherEnquiries(db(), viewer.id);
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: viewer.timeZone, day: 'numeric', month: 'short' }).format(d);
  const waiting = all.filter((e) => e.status === 'pending');
  const accepted = all.filter((e) => e.status === 'accepted');
  const closed = all.filter((e) => e.status !== 'pending' && e.status !== 'accepted');

  const item = (e: TeacherEnquiry) => {
    const [chip, kind] = CHIP[e.status];
    const subjects = e.subjects.map((s) => SUBJECTS[s as SubjectId]?.name ?? s).join(', ');
    return (
      <li key={e.id}>
        <Card as="article" aria-labelledby={`te-${e.id}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`te-${e.id}`} className="text-[20px] font-bold leading-7">
              From {e.parentFirstName} (parent) · {subjects}
            </h3>
            <StatusChip kind={kind}>{chip}</StatusChip>
          </div>
          <dl className="m-0 grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[auto_1fr]">
            <dt className="font-bold">Child</dt>
            <dd className="m-0">
              Grade {e.grade}
              {e.curriculum ? ` · ${e.curriculum}` : ''}
            </dd>
            <dt className="font-bold">Times</dt>
            <dd className="m-0">{e.times.length ? `${e.times.join(', ')} (your time)` : 'None chosen'}</dd>
            <dt className="font-bold">How</dt>
            <dd className="m-0">Online</dd>
            <dt className="font-bold">Asked about</dt>
            <dd className="m-0">{e.askingPrice ? `${e.askingPrice} (your asking price when sent)` : 'Not sure yet'}</dd>
          </dl>
          {e.message ? (
            <p className="whitespace-pre-line rounded-[14px] bg-surface-container-low px-3 py-2 text-[15px]">
              <strong>Message:</strong> {e.message}
            </p>
          ) : null}
          <p className="text-sm text-on-surface-variant">
            Sent {day(e.sentAt)}
            {e.status === 'pending' ? ` · answer by ${day(e.expiresAt)}` : ''}
            {e.answeredAt ? ` · answered ${day(e.answeredAt)}` : ''}
          </p>
          {e.teacherNote ? <p className="text-[15px]">Your note: {e.teacherNote}</p> : null}
          {e.status === 'pending' ? <AnswerForm enquiryId={e.id} parentFirstName={e.parentFirstName} /> : null}
          {e.status === 'accepted' ? (
            <p className="text-[15px] leading-[22px]">
              {e.parentFirstName} was told and can now add you as their child&apos;s teacher. You&apos;ll see the
              child&apos;s first name and books only after the parent adds you and chooses the subjects. A lesson exists
              only after you both agree it when booking opens.
            </p>
          ) : null}
        </Card>
      </li>
    );
  };

  const section = (id: string, title: string, list: TeacherEnquiry[], empty: string) => (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-headline-sm">
        {title} ({list.length})
      </h2>
      {list.length ? (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">{list.map(item)}</ul>
      ) : (
        <p className="text-[15px] text-on-surface-variant">{empty}</p>
      )}
    </section>
  );

  return (
    <div className="flex max-w-[940px] flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-headline-lg-mobile lg:text-headline-lg">Enquiries</h1>
        <p className="text-body-md text-on-surface-variant">
          Parents who saw your listing. You see the parent&apos;s first name and the child&apos;s grade, curriculum and
          subjects — never the child&apos;s name, photo, school, learning history or books.
        </p>
      </div>
      {done === 'accept' ? (
        <FormMessage tone="success">
          Accepted. The parent is told and can now add you as their child&apos;s teacher.
        </FormMessage>
      ) : null}
      {done === 'decline' ? <FormMessage tone="success">Declined. The parent is told.</FormMessage> : null}
      {section('waiting', 'Waiting', waiting, 'No enquiries are waiting for an answer.')}
      {section('accepted', 'Accepted', accepted, 'None yet.')}
      {section('closed', 'Declined, withdrawn or expired', closed, 'None.')}
    </div>
  );
}
