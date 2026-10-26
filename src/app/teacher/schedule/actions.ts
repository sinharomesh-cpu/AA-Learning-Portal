'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { answerLesson, cancelLesson, recordOutcome } from '@/server/lessons';
import { requestMaterial, withdrawMaterialRequest } from '@/server/materialRequests';
import { setMeetingLink } from '@/server/meetingLinks';
import { getRealSession } from '@/server/session';

/**
 * Teacher lesson actions (CR-17 PR 2). The teacher comes from the session only; the server
 * functions and the database check approval, the link, the deadline and the cut-off again.
 */

async function teacherId(): Promise<string> {
  if (isDemoMode()) redirect('/teacher/schedule');
  const real = await getRealSession();
  if (!real || real.session.role !== 'teacher') redirect('/sign-in');
  return real.session.accountId;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

export interface ScheduleState {
  error?: string;
  notice?: string;
}

/**
 * Each answer moves the lesson to another section of the page, so the result is shown at the
 * top of the page (?done=…) rather than beside the buttons, which are gone after the change.
 */
const back = (done: string): never => {
  revalidatePath('/teacher/schedule');
  revalidatePath('/teacher');
  redirect(`/teacher/schedule?done=${done}`);
};

/** Accept or decline a lesson request (with an optional reason for a decline). */
export async function answerLessonAction(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const id = await teacherId();
  const answer = str(fd, 'answer') === 'accept' ? 'accept' : 'decline';
  const r = await answerLesson(db(), id, str(fd, 'lessonId'), answer, str(fd, 'note'));
  if (r.ok) return back(answer === 'accept' ? 'accepted' : 'declined');
  if (r.reason === 'time_taken' || r.reason === 'expired' || r.reason === 'not_linked') return back(r.reason);
  return back('closed');
}

/** Cancel a confirmed lesson, up to 30 minutes before the start. */
export async function cancelTeacherLessonAction(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const id = await teacherId();
  const r = await cancelLesson(db(), { id, role: 'teacher' }, str(fd, 'lessonId'));
  if (r.ok) return back('cancelled');
  if (r.reason === 'too_late') return { error: 'Lessons can’t be cancelled within 30 minutes of the start.' };
  return back('closed');
}

/** After the lesson: Taught, or Did not take place (D3A-7). */
export async function outcomeAction(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const id = await teacherId();
  const r = await recordOutcome(db(), id, str(fd, 'lessonId'), str(fd, 'outcome'));
  if (r.ok || r.reason === 'done') return back('recorded');
  if (r.reason === 'not_yet') return { error: 'You can record this once the lesson has ended.' };
  return back('closed');
}

/**
 * CR-17 PR 3 (D3A-1): add or change the lesson's own Zoom link. The link is never sent back to
 * the page; the parents are told it was added or changed.
 */
export async function meetingLinkAction(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const id = await teacherId();
  const r = await setMeetingLink(db(), id, str(fd, 'lessonId'), str(fd, 'link'));
  if (r.ok) return back(r.changed ? 'link_saved' : 'link_same');
  if (r.reason === 'invalid') {
    return {
      error: 'Paste the participant link from your Zoom meeting. It must start with https:// and be a zoom.us address.',
    };
  }
  if (r.reason === 'not_allowed') return back('link_not_allowed');
  return back('closed');
}

/**
 * TL-2: ask the parents for material for this lesson: one of the lesson's requested chapters, or a
 * description, with an optional note. The server and the database check the lesson, the link and
 * the limit of five open requests again. The parents get an in-app notice only.
 */
export async function requestMaterialAction(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const id = await teacherId();
  const what = str(fd, 'what');
  const r = await requestMaterial(db(), id, {
    lessonId: str(fd, 'lessonId'),
    position: what === 'other' ? null : what,
    description: what === 'other' ? str(fd, 'description') : null,
    note: str(fd, 'note'),
  });
  if (r.ok) return back('material_requested');
  if (r.reason === 'invalid') {
    return {
      error:
        what === 'other'
          ? 'Describe what you need (up to 200 characters). The note can be up to 300 characters.'
          : 'Choose one of the lesson’s chapters, or “Something else” and describe it.',
    };
  }
  if (r.reason === 'limit')
    return { error: 'This lesson already has 5 open requests. Withdraw one, or wait for answers.' };
  if (r.reason === 'duplicate') return back('material_duplicate');
  return back('material_closed');
}

/** TL-2: withdraw an open material request (the parents' notice then shows "No longer needed"). */
export async function withdrawMaterialAction(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const id = await teacherId();
  const r = await withdrawMaterialRequest(db(), id, str(fd, 'requestId'));
  return back(r.ok ? 'material_withdrawn' : 'material_closed');
}
