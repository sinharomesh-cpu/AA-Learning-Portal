import type { ReactNode } from 'react';
import { Card } from '@/components/Card';
import { StatusChip, type ChipKind } from '@/components/StatusChip';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { dayAndTime, DECLINE_REASON_TEXT, shortDay } from '@/lib/linkRequests';
import { amountText, describeTerms, OFFERS_MAX, type Side, modelLabel } from '@/lib/rateNegotiation';
import type { NegotiationView } from '@/server/rateNegotiations';
import { describePackage } from '@/lib/pricing';
import { formatMinute, WEEKDAYS } from '@/lib/usualTimes';
import { RateActions } from './RateActions';

const subjectName = (s: string) => SUBJECTS[s as SubjectId]?.name ?? s;

function chip(n: NegotiationView, side: Side): [string, ChipKind] {
  const stage = n.status === 'pending' ? 'Pending' : 'Counter-proposed';
  switch (n.status) {
    case 'pending':
    case 'countered':
      if (n.turn === side) {
        return n.offers >= OFFERS_MAX
          ? [`Offer ${OFFERS_MAX} of ${OFFERS_MAX} · your turn`, 'warning']
          : [`${stage} · your turn`, 'human'];
      }
      return [`${stage} · waiting for the ${side === 'parent' ? 'teacher' : 'parent'}`, 'neutral'];
    case 'accepted':
      return ['Accepted', 'success'];
    case 'declined':
      return ['Declined', 'warning'];
    case 'withdrawn':
      return ['Withdrawn', 'neutral'];
    default:
      return ['Expired', 'warning'];
  }
}

/**
 * One negotiation, for either side (boards RN3, RN5, RN7). The teacher's view never includes the
 * child's name (FR-040.9); `title` and `about` are built by the page for its side.
 */
export function NegotiationCard({
  n,
  side,
  title,
  about,
  otherName,
  timeZone,
  footer,
}: {
  n: NegotiationView;
  side: Side;
  title: string;
  /** Who the lessons are for, in this side's words. */
  about: string;
  otherName: string;
  timeZone: string;
  footer?: ReactNode;
}) {
  const [label, kind] = chip(n, side);
  const terms = { model: n.model, currency: n.currency };
  const latest = n.history.at(-1);
  const asking = describeTerms({ ...terms, ...n.asking });
  const whoName = (by: Side) => (by === side ? 'You' : otherName);
  const active = n.status === 'pending' || n.status === 'countered';
  const headingId = `rate-${n.id}`;
  return (
    <Card
      as="article"
      aria-labelledby={headingId}
      className="flex flex-col gap-3 p-4 sm:p-6"
      data-testid="rate-negotiation"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-[18px] font-bold leading-7">
          {title}
        </h3>
        <StatusChip kind={kind}>{label}</StatusChip>
      </div>
      <p className="text-[15px] leading-[22px]">
        {subjectName(n.subject)} · {n.kind === 'hourly' ? 'Hourly lessons' : modelLabel(n.model)} · asking price{' '}
        {asking}
      </p>
      {n.kind === 'hourly' && n.slot ? (
        <p className="text-sm text-on-surface-variant">
          Time: {WEEKDAYS[n.slot.weekday - 1]} {formatMinute(n.slot.start)}–{formatMinute(n.slot.end)} (
          {n.slot.timeZone}) · {n.asking.minutes}-minute lessons · price only; no commitment to further lessons
        </p>
      ) : null}
      {n.kind === 'package' && n.packageTerms ? (
        <p className="text-sm text-on-surface-variant">
          {describePackage(n.packageTerms)} · price only; these terms don&apos;t change. Agreeing a price doesn&apos;t
          start the package: both of you confirm its terms later.
        </p>
      ) : null}
      {active && latest ? (
        <p className="text-[15px] leading-[22px]">
          <strong>
            Offer {n.offers} of {OFFERS_MAX}
          </strong>{' '}
          · latest offer by {latest.by === side ? 'you' : latest.by === 'teacher' ? 'the teacher' : 'the parent'}:{' '}
          <strong>{describeTerms({ ...terms, ...latest })}</strong> ·{' '}
          {n.turn === side ? 'answer by' : `${side === 'parent' ? 'the teacher' : 'the parent'} has until`}{' '}
          <strong>{dayAndTime(n.expiresAt, timeZone)}</strong>
        </p>
      ) : null}
      {n.status === 'accepted' && n.agreed ? (
        <div className="overflow-x-auto rounded-[14px] border-2 border-success-border p-3">
          <table className="w-full border-collapse text-left text-[15px]">
            <caption className="mb-1 text-left font-bold">
              Agreed rate with {side === 'parent' ? otherName : `${otherName} (parent)`}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-3">
                  Asking price (published)
                </th>
                <th scope="col" className="py-1">
                  Agreed rate
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 pr-3">{asking}</td>
                <td className="py-1 font-bold">{describeTerms({ ...terms, ...n.agreed })}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-sm text-on-surface-variant">
            Agreed {dayAndTime(n.endedAt!, timeZone)} for {about}. If the teacher later changes their asking price, this
            agreed rate stays as recorded. AA Pro does not collect or process payments.
          </p>
        </div>
      ) : null}
      {n.status === 'declined' ? (
        <p className="text-[15px] leading-[22px]">
          {shortDay(n.endedAt!, timeZone)} · declined by{' '}
          <strong>{n.endedBy === side ? 'you' : side === 'parent' ? 'the teacher' : 'the parent'}</strong>
          {n.offers >= OFFERS_MAX ? ` (offer ${OFFERS_MAX} of ${OFFERS_MAX})` : ''}
          {n.declineReason ? ` · Reason: ${DECLINE_REASON_TEXT[n.declineReason]}` : ''}
          {side === 'parent' && n.askAgainFrom && n.askAgainFrom > new Date() ? (
            <>
              {' '}
              · you can start a new proposal with this teacher for {about}&apos;s {modelLabel(n.model).toLowerCase()}{' '}
              price from <strong>{dayAndTime(n.askAgainFrom, timeZone)}</strong>
            </>
          ) : null}
        </p>
      ) : null}
      {n.status === 'withdrawn' ? (
        <p className="text-[15px]">Withdrawn by the parent on {shortDay(n.endedAt!, timeZone)}.</p>
      ) : null}
      {n.status === 'expired' ? (
        <p className="text-[15px]">
          No answer in 14 days (ended {shortDay(n.endedAt!, timeZone)}).
          {side === 'parent' ? ' You can propose again now.' : ''}
        </p>
      ) : null}
      <details open={active}>
        <summary className="min-h-9 cursor-pointer text-sm font-bold">Offer history</summary>
        <ol className="m-0 mt-1 flex flex-col gap-1 pl-5 text-sm leading-5">
          {n.history.map((o) => (
            <li key={o.seq}>
              {shortDay(o.at, timeZone)} · {whoName(o.by)} offered {describeTerms({ ...terms, ...o })} (offer {o.seq})
              {o.message ? <span className="whitespace-pre-line break-words"> — “{o.message}”</span> : null}
            </li>
          ))}
          {n.status === 'accepted' ? (
            <li>
              {shortDay(n.endedAt!, timeZone)} · {n.endedBy ? whoName(n.endedBy) : ''} accepted{' '}
              {latest ? amountText({ currency: n.currency, amountMinor: latest.amountMinor }) : ''}
            </li>
          ) : null}
          {n.status === 'declined' ? (
            <li>
              {shortDay(n.endedAt!, timeZone)} · {n.endedBy ? whoName(n.endedBy) : ''} declined
            </li>
          ) : null}
        </ol>
      </details>
      {latest ? (
        <RateActions
          id={n.id}
          side={side}
          myTurn={n.turn === side}
          active={active}
          offers={n.offers}
          model={n.model}
          kind={n.kind}
          currency={n.currency}
          latestText={describeTerms({ ...terms, ...latest })}
          latestAmount={amountText({ currency: n.currency, amountMinor: latest.amountMinor })}
          latest={{ sessions: latest.sessions, minutes: latest.minutes }}
          about={about}
          otherName={otherName}
        />
      ) : null}
      {footer}
    </Card>
  );
}
