'use server';

import { redirect } from 'next/navigation';
import { dayAndTime } from '@/lib/linkRequests';
import { db } from '@/server/db/client';
import { type ProposalProblem, proposeRate } from '@/server/rateNegotiations';
import { siteBaseUrl } from '@/server/requestInfo';
import { getRealSession } from '@/server/session';

export interface ProposeFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  at?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};
const int = (s: string) => (/^\d{1,3}$/.test(s.trim()) ? Number(s.trim()) : NaN);

const PROBLEM: Record<ProposalProblem, [string, string]> = {
  price: ['price', 'Choose one of the prices that take proposals.'],
  slot: ['slot', 'Choose one of the times open to proposals.'],
  child: ['who', 'Choose one of your children, or “A child I haven’t added yet”.'],
  grade: ['grade', 'Choose the child’s grade.'],
  curriculum: ['curriculum', 'Choose a curriculum from the list.'],
  subject: ['subject', 'Choose a subject this teacher teaches and the child studies.'],
  amount: ['amount', 'Enter an amount above zero, like 3400 or 3400.50 (at most two decimals).'],
  sessions: ['sessions', 'Enter a number of lessons from 1 to 31.'],
  minutes: ['minutes', 'Enter minutes per lesson from 10 to 40.'],
  message: ['message', 'Keep the message to 500 characters.'],
};

/** RN2: send a proposal. The parent comes from the session only; the server checks every rule. */
export async function proposeAction(_prev: ProposeFormState, fd: FormData): Promise<ProposeFormState> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'parent') redirect('/sign-in');
  const who = str(fd, 'who');
  // CR-15: "hourly" (with a time "weekday:start:end") or "package"; absent for the earlier prices.
  const kind = str(fd, 'kind');
  const slotText = str(fd, 'slot');
  const slot = /^[1-7]:\d{1,4}:\d{1,4}$/.test(slotText)
    ? (([weekday, start, end]) => ({ weekday: weekday!, start: start!, end: end! }))(slotText.split(':').map(Number))
    : null;
  const r = await proposeRate(
    db(),
    real.session.accountId,
    {
      publicId: str(fd, 'publicId'),
      kind: kind === 'hourly' || kind === 'package' ? kind : undefined,
      slot,
      priceIndex: int(str(fd, 'price')),
      childId: who === 'new' ? null : who,
      grade: who === 'new' ? int(str(fd, 'grade')) : null,
      curriculum: who === 'new' ? str(fd, 'curriculum') || null : null,
      subject: str(fd, 'subject'),
      amount: str(fd, 'amount'),
      sessions: fd.has('sessions') ? int(str(fd, 'sessions')) : null,
      minutes: int(str(fd, 'minutes')),
      message: str(fd, 'message'),
    },
    await siteBaseUrl(),
  );
  if (r.ok) redirect(`/parent/enquiries/rates?sent=${r.id}`);
  const at = Date.now();
  const tz = real.session.timeZone;
  switch (r.reason) {
    case 'invalid': {
      const fieldErrors: Record<string, string> = {};
      for (const p of r.problems) fieldErrors[PROBLEM[p][0]] = PROBLEM[p][1];
      return { at, fieldErrors, error: 'Please check the highlighted answers.' };
    }
    case 'already':
      return {
        at,
        error: 'You already have an open proposal of this kind with this teacher for this child. See Rate proposals.',
      };
    case 'wait':
      return {
        at,
        error: `A recent proposal of this kind for this child was declined. You can propose again from ${dayAndTime(r.until, tz)}.`,
      };
    case 'active_limit':
      return {
        at,
        error: `You have ${r.limit} open proposals, the most at one time. Wait for answers, or withdraw one.`,
      };
    case 'daily_limit':
      return {
        at,
        error: `You have sent ${r.limit} new proposals today. You can send more after midnight (${r.timeZone} time).`,
      };
    case 'not_negotiable':
      return {
        at,
        error:
          'This teacher isn’t accepting proposals for this any more. Nothing was sent; the published price still applies.',
      };
    case 'gone':
      return { at, error: 'This listing is no longer available. Nothing was sent.' };
    default:
      return { at, error: 'Only parent accounts can propose a rate.' };
  }
}
