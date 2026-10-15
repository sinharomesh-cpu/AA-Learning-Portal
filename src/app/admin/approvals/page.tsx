import type { Metadata } from 'next';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { listPendingTeachers } from '@/server/admin';
import { requireAdmin } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { DecisionForm } from '../AdminForms';

export const metadata: Metadata = { title: 'Teacher approvals' };
export const dynamic = 'force-dynamic';

const ORIGIN: Record<string, [string, 'human' | 'neutral']> = {
  self_registered: ['Registered themselves', 'neutral'],
  parent_added: ['Added by a parent', 'human'],
  admin_created: ['Created by an admin', 'neutral'],
};

/** M-29 with the board 60 update: teachers waiting for approval (OC-36, OC-38, OC-50). */
const DONE: Record<string, string> = {
  approve: 'Approved. The teacher was emailed and can now sign in to the teacher portal.',
  reject: 'Not approved. The decision and your note are in the audit log.',
  changes: 'Changes requested. The teacher sees your note when they sign in.',
};

export default async function AdminApprovalsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const access = await requireAdmin('teacher_approvals');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Teacher approvals"
        body="Teacher approvals work with real accounts. The sample preview has no teachers waiting."
        homeHref="/admin"
        homeLabel="Go to admin home"
      />
    );
  }
  const teachers = (await listPendingTeachers(db(), access.viewer.id)) ?? [];
  const { done } = await searchParams;
  const tz = access.viewer.timeZone;
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-6">
      <h1 className="flex flex-wrap items-center gap-3 text-headline-lg-mobile lg:text-headline-lg">
        Teacher approvals
        <StatusChip kind={teachers.length ? 'warning' : 'success'}>
          {teachers.length ? `${teachers.length} waiting` : 'Nobody waiting'}
        </StatusChip>
      </h1>
      {done && DONE[done] ? <FormMessage tone="success">{DONE[done]}</FormMessage> : null}
      {teachers.map((t) => {
        const [origin, kind] = ORIGIN[t.origin] ?? ['', 'neutral'];
        return (
          <Card as="article" key={t.id} aria-labelledby={`t-${t.id}`} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h2 id={`t-${t.id}`} className="flex flex-wrap items-center gap-2.5 text-[22px] font-bold leading-7">
                {t.name} <StatusChip kind={kind}>{origin}</StatusChip>
              </h2>
              <span className="text-sm text-on-surface-variant">Joined {day(t.createdAt)}</span>
            </div>
            <dl className="m-0 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-bold uppercase tracking-[.04em] text-on-surface-variant">Email</dt>
                <dd className="m-0 break-all font-bold">{t.email}</dd>
              </div>
              {t.addedBy ? (
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[.04em] text-on-surface-variant">Added by</dt>
                  <dd className="m-0 font-bold">{t.addedBy} (parent)</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs font-bold uppercase tracking-[.04em] text-on-surface-variant">Profile</dt>
                <dd className="m-0 font-bold">
                  {t.approvalStatus === 'submitted' ? t.detail : 'Not completed yet (the profile form arrives next)'}
                </dd>
              </div>
            </dl>
            {t.bio ? <p className="text-[15px] leading-6">{t.bio}</p> : null}
            <DecisionForm teacherId={t.id} name={t.name} allowChanges={t.origin !== 'parent_added'} />
          </Card>
        );
      })}
      <p className="text-sm leading-5 text-on-surface-variant">
        On approval the teacher is emailed and can sign in to the teacher portal; they see children only once a parent
        links them. &quot;Request changes&quot; is not offered for parent-added teachers. Every decision is in the audit
        log.
      </p>
    </div>
  );
}
