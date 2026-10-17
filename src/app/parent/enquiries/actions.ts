'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { getRealSession } from '@/server/session';
import { withdrawEnquiry } from '@/server/teacherEnquiries';

export interface WithdrawState {
  error?: string;
}

/** Board D4: the parent withdraws a waiting enquiry of their own (session only). */
export async function withdrawEnquiryAction(_prev: WithdrawState, fd: FormData): Promise<WithdrawState> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'parent') redirect('/sign-in');
  const id = fd.get('enquiryId');
  const r = await withdrawEnquiry(db(), real.session.accountId, typeof id === 'string' ? id : '');
  revalidatePath('/parent/enquiries');
  if (!r.ok) return { error: 'This enquiry has already been answered or has ended.' };
  redirect('/parent/enquiries?withdrawn=1');
}
