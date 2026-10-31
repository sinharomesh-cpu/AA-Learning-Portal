'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { cancelLesson, requestLesson, type RequestReason, withdrawLesson } from '@/server/lessons';
import { markMaterialUnavailable, shareMaterial } from '@/server/materialRequests';
import { answerProposal } from '@/server/proposals';
import { getRealSession } from '@/server/session';

/**
 * Parent lesson actions (CR-17 PR 2). The parent comes from the session only; the server
 * functions and the database check the child, the teacher link, the time and the price again.
 */

async function parentId(): Promise<string> {
  if (isDemoMode()) redirect('/parent/calendar');
  const real = await getRealSession();
  if (!real || real.session.role !== 'parent') redirect('/sign-in');
  return real.session.accountId;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

export interface LessonFormState {
  error?: string;
  notice?: string;
}

const REQUEST_TEXT: Record<RequestReason, string> = {
  not_allowed: 'You can’t request lessons for this child.',
  not_linked: 'This teacher isn’t linked to this child for this subject any more. Check My teachers.',
  invalid: 'Choose a length from 10 to 40 minutes and a start time from the list.',
  notice: 'Lessons need at least 24 hours’ notice. Choose a later time.',
  window: 'Lessons can be requested up to 4 weeks ahead. Choose an earlier time.',
  usual_times: 'That time is no longer inside the teacher’s usual times. Choose a time from the list.',
  busy: 'That time now overlaps a confirmed lesson. Choose another time.',
  duplicate: 'This child already has an open request with this teacher at that time.',
  limit: 'You already have 10 open lesson requests. Wait for answers, or withdraw one, before sending another.',
  price_changed: 'The price has changed since this page opened. Check the new price below and send the request again.',
  no_rate: 'This teacher hasn’t set an hourly rate yet, so lessons can’t be requested.',
  chapters:
    'Choose up to 5 chapters from the list, or type one topic (up to 120 characters), not both. A chapter may no longer be shared: check the list again.',
};

/** "Send request" on Book a teacher. */
export async function requestLessonAction(_prev: LessonFormState, fd: FormData): Promise<LessonFormState> {
  const id = await parentId();
  const [startsAt, priceMinor, currency, basis] = str(fd, 'slot').split('|');
  const r = await requestLesson(db(), id, {
    childId: str(fd, 'childId'),
    teacherId: str(fd, 'teacherId'),
    subject: str(fd, 'subject'),
    minutes: str(fd, 'minutes'),
    startsAt: startsAt ?? '',
    priceMinor: priceMinor ?? '',
    currency: currency ?? '',
    basis: basis ?? '',
    // TL-1: optional chapters (checkboxes) or one topic; the server and the database check them.
    chapterIds: fd.getAll('chapter').filter((v): v is string => typeof v === 'string'),
    topic: str(fd, 'topic'),
  });
  if (r.ok) {
    revalidatePath('/parent/calendar');
    revalidatePath('/parent');
    redirect('/parent/calendar?done=requested');
  }
  if (!str(fd, 'slot')) return { error: 'Choose a start time.' };
  return { error: REQUEST_TEXT[r.reason] };
}

/** The lesson moves to another section after a change, so the result shows at the top (?done=…). */
const back = (done: string): never => {
  revalidatePath('/parent/calendar');
  revalidatePath('/parent');
  redirect(`/parent/calendar?done=${done}`);
};

/**
 * TL-3 (OC-45, TL3-5): accept or decline a teacher's proposal on its booking-details page, with an
 * optional reason (up to 200 characters) for a decline. Either active parent of the child; the
 * server and the database check the deadline, the link and the time again. The result shows on the
 * same page (?done=…).
 */
export async function answerProposalAction(_prev: LessonFormState, fd: FormData): Promise<LessonFormState> {
  const id = await parentId();
  const lessonId = str(fd, 'lessonId');
  const answer = str(fd, 'answer') === 'accept' ? 'accept' : 'decline';
  const r = await answerProposal(db(), id, lessonId, answer, str(fd, 'reason'));
  if (!r.ok && r.reason === 'invalid') return { error: 'The reason can be up to 200 characters.' };
  revalidatePath('/parent/calendar');
  revalidatePath('/parent');
  const done = r.ok ? (answer === 'accept' ? 'accepted' : 'declined') : r.reason;
  redirect(`/parent/bookings/${encodeURIComponent(lessonId)}?done=${done}`);
}

/** Withdraw an open request (either parent of the child). */
export async function withdrawLessonAction(_prev: LessonFormState, fd: FormData): Promise<LessonFormState> {
  const id = await parentId();
  const r = await withdrawLesson(db(), id, str(fd, 'lessonId'));
  if (r.ok) return back('withdrawn');
  return back(r.reason === 'expired' ? 'expired' : 'closed');
}

/** Cancel a confirmed lesson, up to 30 minutes before the start. */
export async function cancelLessonAction(_prev: LessonFormState, fd: FormData): Promise<LessonFormState> {
  const id = await parentId();
  const r = await cancelLesson(db(), { id, role: 'parent' }, str(fd, 'lessonId'));
  if (r.ok) return back('cancelled');
  if (r.reason === 'too_late') return { error: 'Lessons can’t be cancelled within 30 minutes of the start.' };
  return back('closed');
}

/**
 * After a material answer: back to the booking-details page it came from (a proposal the parent may
 * still be deciding on), otherwise to the Family calendar. Only ever a booking page path with a
 * valid id; that page checks again that the lesson is this parent's child's.
 */
const afterMaterial = (fd: FormData, done: string): never => {
  const bookingId = str(fd, 'bookingId');
  if (!UUID_RE.test(bookingId)) return back(done);
  revalidatePath('/parent/calendar');
  revalidatePath('/parent');
  redirect(`/parent/bookings/${bookingId}?done=${done}`);
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * TL-2: share a book (or one chapter of it) for the teacher's material request. Only books the
 * lesson's teacher can already view are offered; the server and the database check that again, so
 * sharing never gives the teacher anything new (safeguard 1). The teacher gets an in-app notice.
 */
export async function shareMaterialAction(_prev: LessonFormState, fd: FormData): Promise<LessonFormState> {
  const id = await parentId();
  const [bookId, chapterId] = str(fd, 'material').split('|');
  if (!bookId) return { error: 'Choose a book or chapter to share.' };
  const r = await shareMaterial(db(), id, { requestId: str(fd, 'requestId'), bookId, chapterId: chapterId ?? '' });
  if (r.ok) return afterMaterial(fd, 'material_shared');
  if (r.reason === 'not_shareable') {
    return {
      error:
        'That book can’t be shared for this lesson any more. Check the list: only published books shared with your child in this subject can be used.',
    };
  }
  return afterMaterial(fd, 'material_closed');
}

/** TL-2: say the material isn't available, with an optional note for the teacher. */
export async function unavailableMaterialAction(_prev: LessonFormState, fd: FormData): Promise<LessonFormState> {
  const id = await parentId();
  const r = await markMaterialUnavailable(db(), id, { requestId: str(fd, 'requestId'), note: str(fd, 'note') });
  if (r.ok) return afterMaterial(fd, 'material_unavailable');
  if (r.reason === 'invalid') return { error: 'The note can be up to 300 characters.' };
  return afterMaterial(fd, 'material_closed');
}
