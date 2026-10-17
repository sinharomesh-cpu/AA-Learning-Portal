'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { siteBaseUrl } from '@/server/requestInfo';
import { getRealSession } from '@/server/session';
import { answerEnquiry } from '@/server/teacherEnquiries';

export interface AnswerState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** Board D6: accept or decline a waiting enquiry (the teacher comes from the session only). */
export async function answerEnquiryAction(_prev: AnswerState, fd: FormData): Promise<AnswerState> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'teacher') redirect('/sign-in');
  const decision = fd.get('decision') === 'accept' ? 'accept' : fd.get('decision') === 'decline' ? 'decline' : null;
  if (!decision) return { error: 'Choose Accept or Decline.' };
  const id = fd.get('enquiryId');
  const note = fd.get('note');
  const r = await answerEnquiry(
    db(),
    real.session.accountId,
    typeof id === 'string' ? id : '',
    decision,
    typeof note === 'string' ? note : '',
    await siteBaseUrl(),
  );
  revalidatePath('/teacher/enquiries');
  if (!r.ok) {
    if (r.reason === 'note') return { fieldErrors: { note: 'Keep the note to 500 characters.' } };
    if (r.reason === 'not_allowed') redirect('/teacher');
    return { error: 'This enquiry was withdrawn, has ended or was already answered.' };
  }
  redirect(`/teacher/enquiries?done=${decision}`);
}
