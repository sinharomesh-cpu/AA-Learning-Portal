import type { Metadata } from 'next';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { EmptyState } from '@/components/states/States';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { requireRole } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { dayAndTime, DECLINE_REASON_TEXT, NOTICE_DAYS, REQUEST_DAYS, shortDay } from '@/lib/linkRequests';
import { isLive, listMyTeachers, type MyTeacher, type MyTeacherChild } from '@/server/teacherLinks';
import { RemoveTeacherButton, SendAgainButton, WithdrawRequestButton } from './TeacherForms';

export const metadata: Metadata = { title: 'My teachers' };
export const dynamic = 'force-dynamic';

const STATE: Record<Exclude<MyTeacher['state'], 'active'>, [string, 'warning' | 'error' | 'neutral']> = {
  waiting: ['Waiting for AA Pro approval', 'warning'],
  not_approved: ['Not approved', 'error'],
  inactive: ['Not active', 'neutral'],
};

const subjectName = (s: string) => SUBJECTS[s as SubjectId]?.name ?? s;
const DAY = 86_400_000;

function requestChip(c: MyTeacherChild, now: Date): [string, 'success' | 'warning' | 'human' | 'neutral'] {
  switch (c.status) {
    case 'active':
      return c.answeredAt && now.getTime() - c.answeredAt.getTime() < NOTICE_DAYS * DAY
        ? ['Accepted', 'success']
        : ['Active', 'success'];
    case 'requested':
      return ['Waiting for the teacher', 'human'];
    case 'pending':
      return ['Waiting for AA Pro approval', 'neutral'];
    case 'declined':
      return ['Declined', 'warning'];
    case 'expired':
      return ['Expired', 'warning'];
    default:
      return ['Withdrawn', 'neutral'];
  }
}

/** Board 57 / TR2 (OC-36, OC-41, CR-12): the parent's teachers and the state of each request. */
export default async function MyTeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; who?: string }>;
}) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="My teachers"
        body="Adding teachers works with real accounts. The sample preview has no teachers to add."
        homeHref="/parent"
        homeLabel="Go to family home"
      />
    );
  }
  const now = new Date();
  const teachers = await listMyTeachers(db(), access.viewer.id, now);
  const { done, who } = await searchParams;
  const name = (who ?? '').slice(0, 80);
  const tz = access.viewer.timeZone;
  const message =
    done === 'sent'
      ? `Request sent to ${name}. They have ${REQUEST_DAYS} days to accept or decline each child, and see nothing about your children until they accept. Their answer will appear here.`
      : done === 'waiting_approval'
        ? `Request saved. ${name} is waiting for AA Pro approval. After approval they have ${REQUEST_DAYS} days to answer, and they see nothing about your children until they accept.`
        : done === 'changed'
          ? 'Saved. The teacher sees only the children and subjects you ticked.'
          : done === 'changed_requested'
            ? 'Saved. Each child you added is a new request that the teacher accepts or declines.'
            : done === 'removed'
              ? 'Removed. The teacher no longer sees those children or their books.'
              : done === 'withdrawn'
                ? 'Request withdrawn. The teacher can no longer accept it.'
                : null;

  // "New for you" (TR2): answers and endings from the last few days.
  const recent = (d: Date | null) => d !== null && now.getTime() - d.getTime() < NOTICE_DAYS * DAY;
  const notices = teachers.flatMap((t) =>
    t.children.flatMap((c): Array<{ key: string; tone: 'success' | 'warning'; text: string }> => {
      if (c.status === 'active' && recent(c.answeredAt)) {
        return [
          {
            key: c.linkId,
            tone: 'success',
            text: `${t.name} accepted your request for ${c.name} (${c.subjects.map(subjectName).join(', ')}). They can now see ${c.name}'s books for those subjects.`,
          },
        ];
      }
      if (c.status === 'declined' && recent(c.endedAt)) {
        return [
          {
            key: c.linkId,
            tone: 'warning',
            text: `${t.name} declined your request for ${c.name}${c.declineReason ? `: ${DECLINE_REASON_TEXT[c.declineReason]}` : ''}.`,
          },
        ];
      }
      if (c.status === 'expired' && recent(c.endedAt)) {
        return [
          {
            key: c.linkId,
            tone: 'warning',
            text: `Your request to ${t.name} for ${c.name} expired on ${shortDay(c.endedAt!, tz)} without an answer. You can send it again.`,
          },
        ];
      }
      return [];
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-headline-lg-mobile lg:text-headline-lg">My teachers</h1>
          <p className="text-sm leading-5 text-on-surface-variant">
            Who works with your children, and the answers to your requests. A teacher sees only the children and
            subjects they accepted. They can read your books for those subjects, but can&apos;t download them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <LinkButton href="/parent/teachers/find" variant="secondary">
            Find a teacher
          </LinkButton>
          <LinkButton href="/parent/teachers/new">Add a teacher</LinkButton>
        </div>
      </div>
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {notices.length ? (
        <Card as="section" aria-labelledby="new-for-you" className="flex flex-col gap-2 p-4 sm:p-6">
          <h2 id="new-for-you" className="text-sm font-bold leading-5">
            New for you
          </h2>
          {notices.map((n) => (
            <FormMessage key={n.key} tone={n.tone}>
              {n.text}
            </FormMessage>
          ))}
        </Card>
      ) : null}
      {teachers.length === 0 ? (
        <EmptyState title="No teachers yet" action={<LinkButton href="/parent/teachers/new">Add a teacher</LinkButton>}>
          You haven&apos;t added any teachers yet. Add your child&apos;s own teacher by their email address, or use Find
          a teacher to choose an approved AA Pro teacher.
        </EmptyState>
      ) : null}
      {teachers.map((t) => {
        const live = t.children.filter((c) => isLive(c.status));
        const kids = live.map((c) => c.name).join(' and ');
        const canAskAgain = t.state === 'active' || t.state === 'waiting';
        const anyActive = live.some((c) => c.status === 'active');
        return (
          <Card as="article" key={t.id} aria-labelledby={`t-${t.id}`} className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-col gap-0.5">
                <h2 id={`t-${t.id}`} className="text-[22px] font-bold leading-7">
                  {t.name}
                </h2>
                {t.state === 'active' && t.teaches.length ? (
                  <span className="text-sm leading-5 text-on-surface-variant">
                    Teaches on AA Pro: {t.teaches.map(subjectName).join(', ')}
                  </span>
                ) : null}
              </div>
              {t.state !== 'active' ? <StatusChip kind={STATE[t.state][1]}>{STATE[t.state][0]}</StatusChip> : null}
            </div>
            {t.state === 'not_approved' ? (
              <p className="text-sm leading-5 text-on-surface-variant">
                The AA Pro team didn&apos;t approve this teacher, so they can&apos;t see your children.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={`Children and requests for ${t.name}`}>
                {t.children.map((c) => {
                  const [label, kind] = requestChip(c, now);
                  const waitOver = !c.askAgainFrom || c.askAgainFrom <= now;
                  return (
                    <li
                      key={c.linkId}
                      className="flex flex-col gap-2 rounded-[16px] border border-card-border bg-surface-container-low p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-[15px]">
                          <strong>{c.name}</strong>
                          {c.subjects.map((s) => (
                            <span
                              key={s}
                              className="inline-flex rounded-full bg-primary-fixed/60 px-2.5 py-0.5 text-[13px] font-bold text-on-primary-fixed"
                            >
                              {subjectName(s)}
                            </span>
                          ))}
                          <StatusChip kind={kind}>{label}</StatusChip>
                        </div>
                        <RequestDetail c={c} now={now} tz={tz} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {c.status === 'requested' || c.status === 'pending' ? (
                          <WithdrawRequestButton requestId={c.linkId} teacher={t.name} child={c.name} />
                        ) : null}
                        {canAskAgain && (c.status === 'expired' || c.status === 'withdrawn') ? (
                          <SendAgainButton requestId={c.linkId} primary={c.status === 'expired'} />
                        ) : null}
                        {canAskAgain && c.status === 'declined' && waitOver ? (
                          <SendAgainButton requestId={c.linkId} />
                        ) : null}
                        {c.status === 'declined' && !waitOver ? (
                          <LinkButton href="/parent/teachers/find" variant="secondary">
                            Find another teacher
                          </LinkButton>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {t.state === 'waiting' ? (
              <p className="text-sm leading-5 text-on-surface-variant">
                Added on {shortDay(t.addedAt, tz)}. We emailed the teacher a link to set up their account and send their
                profile. After the AA Pro team approves them, they have {REQUEST_DAYS} days to accept or decline each
                child, and only for subjects they are approved to teach.
              </p>
            ) : null}
            {live.length ? (
              <div className="flex flex-wrap gap-2.5">
                {t.state !== 'not_approved' ? (
                  <LinkButton href={`/parent/teachers/${t.id}`} variant="secondary">
                    Change children and subjects
                  </LinkButton>
                ) : null}
                <RemoveTeacherButton
                  teacherId={t.id}
                  label={
                    t.state === 'not_approved' ? 'Remove from list' : anyActive ? 'Remove teacher' : 'Cancel requests'
                  }
                  title={anyActive ? `Remove ${t.name}?` : `Cancel the requests to ${t.name}?`}
                  confirmLabel={anyActive ? 'Remove' : 'Cancel requests'}
                  body={
                    anyActive
                      ? `They will stop seeing ${kids} and their books straight away. Waiting requests are withdrawn. Booked lessons with them are cancelled, except lessons starting within the next 30 minutes, which stay booked.`
                      : `${t.name} will no longer be able to accept the requests for ${kids}.`
                  }
                />
              </div>
            ) : null}
          </Card>
        );
      })}
      <p className="text-sm leading-5 text-on-surface-variant">
        Declined, expired and withdrawn requests never give the teacher access to your children. Emails about requests
        are queued and go out once email is switched on; answers always appear here.
      </p>
    </div>
  );
}

function RequestDetail({ c, now, tz }: { c: MyTeacherChild; now: Date; tz: string }) {
  const cls = 'text-sm leading-5 text-on-surface-variant';
  switch (c.status) {
    case 'active':
      return (
        <span className={cls}>
          {c.answeredAt ? `Accepted on ${shortDay(c.answeredAt, tz)}. The link has started.` : 'Linked.'}
        </span>
      );
    case 'requested':
      return (
        <span className={cls}>
          Sent {shortDay(c.requestedAt!, tz)} · the teacher has until <strong>{dayAndTime(c.expiresAt!, tz)}</strong>
        </span>
      );
    case 'pending':
      return <span className={cls}>After AA Pro approval the teacher has {REQUEST_DAYS} days to answer.</span>;
    case 'declined':
      return (
        <span className={cls}>
          {shortDay(c.endedAt!, tz)} · Reason:{' '}
          <strong>{c.declineReason ? DECLINE_REASON_TEXT[c.declineReason] : ''}</strong>
          {c.declineNote ? (
            <>
              <br />
              <span className="whitespace-pre-line break-words">“{c.declineNote}”</span>
            </>
          ) : null}
          {c.askAgainFrom && c.askAgainFrom > now ? (
            <>
              <br />
              You can ask this teacher again for {c.name} from <strong>{dayAndTime(c.askAgainFrom, tz)}</strong>. You
              can ask any other teacher now.
            </>
          ) : null}
        </span>
      );
    case 'expired':
      return (
        <span className={cls}>
          {c.requestedAt ? `Sent ${shortDay(c.requestedAt, tz)} · ` : ''}no answer in {REQUEST_DAYS} days (ended{' '}
          {shortDay(c.endedAt!, tz)})
        </span>
      );
    default:
      return <span className={cls}>You withdrew this on {shortDay(c.endedAt!, tz)}.</span>;
  }
}
