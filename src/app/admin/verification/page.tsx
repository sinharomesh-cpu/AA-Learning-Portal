import type { Metadata } from 'next';
import { FormMessage } from '@/components/forms/FormMessage';
import { Icon } from '@/components/icons/Icon';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { Panel } from '@/components/ui/Panel';
import { TILE, TILE_KEY } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { VERIFIED_EXPLANATION, VERIFIED_LABEL } from '@/lib/verification';
import { requireAdmin } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { type HistoryRow, listVerificationCases, type VerificationCase } from '@/server/teacherVerification';
import { DecisionForm, RevokeForm } from './VerificationForms';

export const metadata: Metadata = { title: 'Verification' };
export const dynamic = 'force-dynamic';

const DONE: Record<string, string> = {
  verified: 'Marked verified for 12 months. The tick now shows on the teacher’s public profile and cards.',
  not_verified: 'Recorded as not verified. The teacher can ask again.',
  revoked: 'Verification removed. The tick no longer shows anywhere.',
};

const OUTCOME: Record<HistoryRow['outcome'], [string, 'success' | 'neutral' | 'warning']> = {
  verified: ['Verified', 'success'],
  not_verified: ['Not verified', 'neutral'],
  revoked: ['Removed', 'warning'],
};

/**
 * Admin → Verification (CR-15 §5.1; owner decision OC-106 (2)), the Super Admin's alone: open
 * requests oldest first, then verified teachers with their expiry dates. Each decision is a new
 * record that cannot be changed; the history shows who decided, when, the checks and the note.
 */
export default async function AdminVerificationPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const access = await requireAdmin('superadmin');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Verification"
        body="Teacher verification works with real accounts. The sample preview has no teachers waiting."
        homeHref="/admin"
        homeLabel="Back to home"
      />
    );
  }
  const cases = (await listVerificationCases(db(), access.viewer.id)) ?? { pending: [], verified: [] };
  const { done } = await searchParams;
  const tz = access.viewer.timeZone;
  const day = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  const when = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);

  const history = (c: VerificationCase) =>
    c.history.length ? (
      <div className="flex flex-col gap-2">
        <h4 className={TILE_KEY}>Decision history</h4>
        <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label={`Decision history for ${c.name}`}>
          {c.history.map((h) => (
            <li key={h.id} className={cx(TILE, 'gap-1.5')} data-testid="vf-history">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip kind={OUTCOME[h.outcome][1]}>{OUTCOME[h.outcome][0]}</StatusChip>
                <span className="text-sm text-on-surface-variant">
                  {when(h.decidedAt)} · {h.decidedBy}
                </span>
              </div>
              <p className="m-0 text-sm leading-5">
                Email confirmed: {h.emailConfirmed ? 'yes' : 'no'} · Profile reviewed:{' '}
                {h.profileReviewed ? 'yes' : 'no'} · Identity checked on a video call:{' '}
                {h.identityChecked ? 'yes' : 'no'}
                {h.expiresAt ? ` · Valid until ${day(h.expiresAt)}` : ''}
              </p>
              <p className="m-0 whitespace-pre-line break-words text-[15px] leading-[22px]">
                <span className="font-bold">{h.outcome === 'revoked' ? 'Reason: ' : 'Note: '}</span>
                {h.note}
              </p>
            </li>
          ))}
        </ol>
      </div>
    ) : null;

  const facts = (c: VerificationCase) => (
    <dl className="m-0 grid gap-3 sm:grid-cols-2">
      <div className={TILE}>
        <dt className={TILE_KEY}>Email</dt>
        <dd className="m-0 break-all font-bold">{c.email}</dd>
      </div>
      <div className={TILE}>
        <dt className={TILE_KEY}>Profile</dt>
        <dd className="m-0 font-bold">{c.detail}</dd>
      </div>
      {c.claims ? (
        <div className={TILE}>
          <dt className={TILE_KEY}>As stated by the teacher</dt>
          <dd className="m-0 font-bold">{c.claims}</dd>
        </div>
      ) : null}
      {c.bio ? (
        <div className={cx(TILE, 'sm:col-span-2')}>
          <dt className={TILE_KEY}>About</dt>
          <dd className="m-0 whitespace-pre-line break-words text-[15px] leading-[22px]">{c.bio}</dd>
        </div>
      ) : null}
    </dl>
  );

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-6">
      <h1 className="flex flex-wrap items-center gap-3 text-headline-lg-mobile lg:text-headline-lg">
        Verification
        <StatusChip kind={cases.pending.length ? 'warning' : 'success'}>
          {cases.pending.length ? `${cases.pending.length} waiting` : 'Nobody waiting'}
        </StatusChip>
      </h1>
      {done && DONE[done] ? <FormMessage tone="success">{DONE[done]}</FormMessage> : null}
      <div className={cx(TILE, 'gap-1.5')}>
        <span className="inline-flex items-center gap-1.5 font-extrabold">
          <Icon name="verified_fill" size={18} className="text-on-success-container" />
          {VERIFIED_LABEL}
        </span>
        <p className="m-0 text-[15px] leading-[22px]">{VERIFIED_EXPLANATION}</p>
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          Valid for 12 months from your decision, then the tick disappears until the teacher is checked again. No
          identity document, image or number is stored: only that each check was done, by you, and when. Every decision
          is kept and cannot be changed.
        </p>
      </div>

      <Panel
        id="vf-pending"
        title="Waiting for review"
        intro="Oldest request first."
        badge={<StatusChip kind="neutral">{cases.pending.length}</StatusChip>}
      >
        {cases.pending.length === 0 ? (
          <p className="m-0 text-[15px] text-on-surface-variant">No teacher is waiting for verification.</p>
        ) : (
          cases.pending.map((c) => (
            <article
              key={c.teacherId}
              aria-labelledby={`vp-${c.teacherId}`}
              className="flex flex-col gap-4 border-t border-card-border pt-5 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <h3 id={`vp-${c.teacherId}`} className="font-headline text-[22px] font-bold leading-7">
                  {c.name}
                </h3>
                <span className="text-sm text-on-surface-variant">Asked {c.requestedAt ? day(c.requestedAt) : ''}</span>
              </div>
              {facts(c)}
              <DecisionForm
                teacherId={c.teacherId}
                name={c.name}
                emailConfirmed={c.emailConfirmed}
                eligible={c.eligible}
              />
              {history(c)}
            </article>
          ))
        )}
      </Panel>

      <Panel
        id="vf-verified"
        title="Verified teachers"
        intro="Soonest re-check first. The tick shows only until the date given."
        badge={<StatusChip kind="neutral">{cases.verified.length}</StatusChip>}
      >
        {cases.verified.length === 0 ? (
          <p className="m-0 text-[15px] text-on-surface-variant">No teacher is verified right now.</p>
        ) : (
          cases.verified.map((c) => (
            <article
              key={c.teacherId}
              aria-labelledby={`vv-${c.teacherId}`}
              className="flex flex-col gap-4 border-t border-card-border pt-5 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <h3
                  id={`vv-${c.teacherId}`}
                  className="flex flex-wrap items-center gap-2.5 font-headline text-[22px] font-bold leading-7"
                >
                  {c.name} <StatusChip kind="success">Verified</StatusChip>
                </h3>
                <span className="text-sm text-on-surface-variant">
                  {c.decidedAt ? `Verified ${day(c.decidedAt)}` : ''}
                  {c.expiresAt ? ` · Re-check due ${day(c.expiresAt)}` : ''}
                </span>
              </div>
              <p className="m-0 break-all text-sm text-on-surface-variant">{c.email}</p>
              <RevokeForm teacherId={c.teacherId} name={c.name} />
              {history(c)}
            </article>
          ))
        )}
      </Panel>
    </div>
  );
}
