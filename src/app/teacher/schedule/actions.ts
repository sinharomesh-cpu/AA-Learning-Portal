'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { answerLesson, cancelLesson, recordOutcome } from '@/server/lessons';
import { requestMaterial, withdrawMaterialRequest } from '@/server/materialRequests';
import { setMeetingLink } from '@/server/meetingLinks';
import { type ProposeReason, proposeLesson, withdrawProposal } from '@/server/proposals';
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

/**
 * TL-3: planned chapters from a form: checkboxes named "planned" (chapter ids) and, for each, an
 * optional select named "intent-<chapter id>" (new, continue, revise). The server checks them again.
 */
function plannedFrom(fd: FormData): Array<{ chapterId: string; intent: string }> {
  return fd
    .getAll('planned')
    .filter((v): v is string => typeof v === 'string')
    .map((chapterId) => ({ chapterId, intent: str(fd, `intent-${chapterId}`) }));
}

/**
 * Accept or decline a lesson request (with an optional reason for a decline). TL-3 (D-E2E-3 (b)):
 * when accepting, optionally with planned chapters; the parents are told.
 */
export async function answerLessonAction(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const id = await teacherId();
  const answer = str(fd, 'answer') === 'accept' ? 'accept' : 'decline';
  const r = await answerLesson(db(), id, str(fd, 'lessonId'), answer, str(fd, 'note'), new Date(), {
    planned: answer === 'accept' ? plannedFrom(fd) : [],
  });
  if (r.ok) return back(answer === 'accept' ? 'accepted' : 'declined');
  if (r.reason === 'chapters') {
    return {
      error:
        'The planned chapters couldn’t be saved, so nothing was changed. A chapter may no longer be shared with you; check the list, or accept without them.',
    };
  }
  if (r.reason === 'time_taken' || r.reason === 'expired' || r.reason === 'not_linked') return back(r.reason);
  return back('closed');
}

const PROPOSE_TEXT: Record<ProposeReason, string> = {
  not_allowed: 'You can’t schedule lessons at the moment. Your teacher account must be approved and active.',
  not_linked: 'You aren’t linked to this child for this subject any more. Check My students.',
  invalid: 'Choose a length from 10 to 40 minutes.',
  step: 'Choose a start time on a 5-minute step (for example 4:05 pm). That time may not exist on that day.',
  notice: 'Lessons need at least 24 hours’ notice. Choose a later time.',
  window: 'Lessons can be scheduled up to 4 weeks ahead. Choose an earlier day.',
  busy: 'That time overlaps a confirmed lesson of yours or of this child. Choose another time.',
  duplicate: 'You already proposed a lesson to this child at that time.',
  limit: 'You already have 10 proposals waiting for this child’s parents. Wait for answers, or withdraw one.',
  no_rate: 'Add your hourly rate to your listing first: a proposal shows the family its price.',
  chapters:
    'Choose up to 5 chapters from the list, each with an optional intent. A chapter may no longer be shared with you: check the list again.',
  material:
    'Describe the material you need (up to 200 characters); the note can be up to 300 characters. Nothing was sent.',
};

/**
 * TL-3: "Schedule a class". The teacher proposes one lesson (OC-45: nothing is booked until a
 * parent accepts). The server and the database check the link, the time, the limits and the
 * chapters again.
 */
export async function proposeLessonAction(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const id = await teacherId();
  const r = await proposeLesson(db(), id, {
    childId: str(fd, 'childId'),
    subject: str(fd, 'subject'),
    date: str(fd, 'date'),
    time: str(fd, 'time'),
    minutes: str(fd, 'minutes'),
    planned: plannedFrom(fd),
    material: { description: str(fd, 'materialDescription'), note: str(fd, 'materialNote') },
  });
  if (r.ok) {
    revalidatePath('/teacher/propose');
    return back('proposed');
  }
  return { error: PROPOSE_TEXT[r.reason] };
}

/** TL-3: withdraw an open proposal (the parents are told). */
export async function withdrawProposalAction(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const id = await teacherId();
  const r = await withdrawProposal(db(), id, str(fd, 'lessonId'));
  if (r.ok) return back('proposal_withdrawn');
  return back(r.reason === 'expired' ? 'expired' : 'closed');
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
