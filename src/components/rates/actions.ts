'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import {
  type ActionRefusal,
  answerRate,
  counterRate,
  type OfferProblem,
  withdrawRate,
} from '@/server/rateNegotiations';
import { siteBaseUrl } from '@/server/requestInfo';
import { getRealSession } from '@/server/session';
import type { Side } from '@/lib/rateNegotiation';

/**
 * Rate proposal actions for both sides (boards RN3, RN5, RN6). The side and the account come from
 * the session only; server/rateNegotiations.ts checks ownership, turn, offer limit and expiry again.
 */
export interface RateFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  notice?: string;
  at?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};
const int = (s: string) => (/^\d{1,3}$/.test(s.trim()) ? Number(s.trim()) : NaN);

async function who(): Promise<{ side: Side; id: string; timeZone: string }> {
  const real = await getRealSession();
  if (!real || (real.session.role !== 'parent' && real.session.role !== 'teacher')) redirect('/sign-in');
  return { side: real.session.role, id: real.session.accountId, timeZone: real.session.timeZone };
}

const REFUSED: Record<ActionRefusal, string> = {
  not_found: 'This proposal is no longer available.',
  ended: 'This proposal has already ended. The page now shows the latest status.',
  expired: 'This proposal expired, so it can no longer be answered.',
  not_your_turn: 'It is the other side’s turn. The page now shows the latest offer.',
  final_offer: 'This is the 6th offer, so you can only accept or decline it.',
};

const OFFER_PROBLEM: Record<OfferProblem, [string, string]> = {
  amount: ['amount', 'Enter an amount above zero, like 3400 or 3400.50 (at most two decimals).'],
  sessions: ['sessions', 'Enter a number of lessons from 1 to 31.'],
  minutes: ['minutes', 'Enter minutes per lesson from 10 to 40.'],
  message: ['message', 'Keep the message to 500 characters.'],
};

const page = (side: Side) => (side === 'parent' ? '/parent/enquiries/rates' : '/teacher/enquiries/rates');
const done = (side: Side) => {
  revalidatePath(page(side));
  if (side === 'teacher') revalidatePath('/teacher');
};

export async function counterAction(_prev: RateFormState, fd: FormData): Promise<RateFormState> {
  const me = await who();
  const r = await counterRate(
    db(),
    me.side,
    me.id,
    str(fd, 'id'),
    {
      amount: str(fd, 'amount'),
      sessions: fd.has('sessions') ? int(str(fd, 'sessions')) : null,
      minutes: int(str(fd, 'minutes')),
      message: str(fd, 'message'),
    },
    await siteBaseUrl(),
  );
  done(me.side);
  if (r.ok) redirect(`${page(me.side)}?done=countered&offer=${r.offer}&until=${r.expiresAt.getTime()}`);
  if (r.reason === 'invalid') {
    const fieldErrors: Record<string, string> = {};
    for (const p of r.problems) fieldErrors[OFFER_PROBLEM[p][0]] = OFFER_PROBLEM[p][1];
    return { fieldErrors, at: Date.now() };
  }
  return { error: REFUSED[r.reason], at: Date.now() };
}

export async function answerAction(_prev: RateFormState, fd: FormData): Promise<RateFormState> {
  const me = await who();
  const answer = str(fd, 'answer') === 'accept' ? 'accept' : 'decline';
  const r = await answerRate(
    db(),
    me.side,
    me.id,
    str(fd, 'id'),
    answer,
    str(fd, 'reason') || null,
    await siteBaseUrl(),
  );
  done(me.side);
  if (r.ok) redirect(`${page(me.side)}?done=${answer === 'accept' ? 'accepted' : 'declined'}`);
  return {
    error: r.reason === 'invalid' ? 'Choose a reason from the list, or none.' : REFUSED[r.reason],
    at: Date.now(),
  };
}

export async function withdrawAction(_prev: RateFormState, fd: FormData): Promise<RateFormState> {
  const me = await who();
  if (me.side !== 'parent') return { error: REFUSED.not_found, at: Date.now() };
  const r = await withdrawRate(db(), me.id, str(fd, 'id'), await siteBaseUrl());
  done(me.side);
  if (r.ok) redirect(`${page(me.side)}?done=withdrawn`);
  return { error: REFUSED[r.reason], at: Date.now() };
}
