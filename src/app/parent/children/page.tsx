import type { Metadata } from 'next';
import { clockNow } from '@/lib/clock';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { LessonKindChip } from '@/components/lessons/LessonStatus';
import { AccessDenied } from '@/components/states/AccessDenied';
import { EmptyState } from '@/components/states/States';
import { cx } from '@/lib/cx';
import { requireRole } from '@/server/authz';
import { familyChildren } from '@/server/family';
import { AI_RULE_TEXT, describeAllowance } from '@/lib/aiAllowance';
import { getAiAllowance } from '@/server/aiSessions';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { StatusChip } from '@/components/StatusChip';

export const metadata: Metadata = { title: 'Children' };

const AVATAR = ['bg-primary-fixed text-on-primary-fixed-variant', 'bg-secondary-fixed text-on-secondary-fixed-variant'];

/** M-07 children list (board 17 desktop, board 46 phone). Only this parent's linked children. */
export default async function ChildrenPage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const now = clockNow();
  const kids = await familyChildren(access.viewer, now);
  // OC-89(4): each child's AI Tutor allowance, from the server's own record (real accounts).
  const allowances = isDemoMode()
    ? new Map()
    : new Map(
        await Promise.all(
          kids.map(async (k) => [k.id, await getAiAllowance(db(), access.viewer.id, k.id, now)] as const),
        ),
      );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-headline-lg-mobile lg:text-headline-lg">Children</h1>
          <p className="text-sm leading-5 text-on-surface-variant">Only children linked to your account appear here.</p>
        </div>
        <LinkButton href="/parent/children/new">Add a child</LinkButton>
      </div>
      {kids.length ? (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 md:gap-6">
          {kids.map((k, i) => {
            const next = k.lessons.find((l) => Date.parse(l.endIso) > now.getTime());
            return (
              <li key={k.id}>
                <Card as="article" aria-labelledby={`child-${k.id}`} className="flex h-full flex-col gap-4 p-4 sm:p-6">
                  <div className="flex items-center gap-3.5">
                    <span
                      aria-hidden="true"
                      className={cx(
                        'flex h-14 w-14 flex-none items-center justify-center rounded-full font-headline text-2xl font-extrabold',
                        AVATAR[i % AVATAR.length],
                      )}
                    >
                      {k.initial}
                    </span>
                    <div>
                      <h2 id={`child-${k.id}`} className="font-headline text-[22px] font-bold leading-7">
                        {k.name}
                      </h2>
                      <span className="text-sm text-on-surface-variant">
                        Grade {k.grade}
                        <span className="md:hidden"> · {k.timeZone}</span>
                      </span>
                      {k.paused ? (
                        <StatusChip kind="neutral" className="ml-2">
                          Paused
                        </StatusChip>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm leading-5">
                    <strong>AI Tutor:</strong> {AI_RULE_TEXT}{' '}
                    {allowances.get(k.id) ? (
                      <span className="font-bold text-primary">
                        {describeAllowance(allowances.get(k.id)!, k.timeZone, now)}
                      </span>
                    ) : null}
                  </p>
                  <dl className="m-0 hidden grid-cols-2 gap-x-4 gap-y-2.5 text-sm md:grid">
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[.04em] text-on-surface-variant">
                        Curriculum
                      </dt>
                      <dd className="m-0">{k.curriculum}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[.04em] text-on-surface-variant">
                        Time zone
                      </dt>
                      <dd className="m-0">{k.timeZone}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs font-bold uppercase tracking-[.04em] text-on-surface-variant">Subjects</dt>
                      <dd className="m-0">{k.subjects.join(', ')}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold uppercase tracking-[.06em] text-on-secondary-fixed-variant">
                      Next session
                    </span>
                    {next ? (
                      <span className="flex flex-wrap items-center gap-2 text-[15px]">
                        <LessonKindChip kind={next.kind} long />
                        {next.dayLabel}, {next.timeLabel} · {next.subject}
                        {next.kind === 'human' ? ` with ${next.teacherName}` : ''} · {next.durationMinutes} min
                      </span>
                    ) : (
                      <span className="text-[15px] text-on-surface-variant">Nothing booked yet</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <LinkButton href={`/parent/children/${k.id}`} aria-label={`Edit ${k.name}'s profile`}>
                      Edit profile
                    </LinkButton>
                    <LinkButton
                      href={`/parent/children/${k.id}/restrictions`}
                      variant="secondary"
                      aria-label={`${k.name}'s restrictions`}
                    >
                      Restrictions
                    </LinkButton>
                    <LinkButton
                      href={`/parent/children/${k.id}`}
                      variant="secondary"
                      className="hidden md:inline-flex"
                      aria-label={`Reset ${k.name}'s sign-in`}
                    >
                      Reset sign-in
                    </LinkButton>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="No children yet"
          action={<LinkButton href="/parent/children/new">Add your first child</LinkButton>}
        >
          Add your first child to set their grade, subjects and sign-in details. You&apos;ll be asked to confirm the
          privacy notice first.
        </EmptyState>
      )}
    </div>
  );
}
