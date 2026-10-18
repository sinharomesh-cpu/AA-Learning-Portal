'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { DECLINE_NOTE_MAX } from '@/lib/linkRequests';
import { db } from '@/server/db/client';
import { siteBaseUrl } from '@/server/requestInfo';
import { getRealSession } from '@/server/session';
import { acceptLinkRequest, type AnswerRefusal, declineLinkRequest } from '@/server/teacherLinks';

/**
 * CR-12 board TR4: the teacher accepts or declines one child's request. The teacher comes from the
 * session only; server/teacherLinks.ts and the database check the request again.
 */
export interface RequestFormState {
  error?: string;
  at?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

async function teacherId(): Promise<string> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'teacher') redirect('/sign-in');
  return real.session.accountId;
}

const REFUSED: Record<AnswerRefusal, string> = {
  expired: "This request has expired, so it can't be accepted. The parent can send a new one.",
  withdrawn: 'The parent withdrew this request a moment ago. Nothing was changed.',
  answered: 'This request has already been answered.',
  not_found: 'This request is no longer available.',
  not_allowed: 'Your account cannot answer requests right now.',
  not_taught:
    "A subject in this request is no longer on your approved profile, so it can't be accepted. AA Pro reviews subject changes.",
};

export async function acceptRequestAction(_prev: RequestFormState, fd: FormData): Promise<RequestFormState> {
  const id = await teacherId();
  const r = await acceptLinkRequest(db(), id, str(fd, 'requestId'), await siteBaseUrl());
  if (r.ok) {
    revalidatePath('/teacher/students');
    revalidatePath('/teacher');
    redirect(`/teacher/students?accepted=${r.studentId}`);
  }
  revalidatePath('/teacher/students');
  return { error: REFUSED[r.reason], at: Date.now() };
}

export async function declineRequestAction(_prev: RequestFormState, fd: FormData): Promise<RequestFormState> {
  const id = await teacherId();
  const r = await declineLinkRequest(
    db(),
    id,
    str(fd, 'requestId'),
    { reason: str(fd, 'reason'), note: str(fd, 'note') },
    await siteBaseUrl(),
  );
  if (r.ok) {
    revalidatePath('/teacher/students');
    revalidatePath('/teacher');
    redirect('/teacher/students?declined=1');
  }
  if (r.reason === 'invalid') {
    return { error: `Choose a reason. A note can be up to ${DECLINE_NOTE_MAX} characters.`, at: Date.now() };
  }
  revalidatePath('/teacher/students');
  return { error: REFUSED[r.reason], at: Date.now() };
}
