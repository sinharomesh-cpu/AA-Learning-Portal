'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { QuestionDraft, QuestionProblem } from '@/lib/worksheetQuestions';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getRealSession } from '@/server/session';
import {
  assignWorksheet,
  changeAssignmentDates,
  releaseResults,
  saveReview,
  withdrawAssignment,
} from '@/server/assignments';
import {
  type DetailsField,
  duplicateWorksheet,
  questionsToCopy,
  saveWorksheet,
  setWorksheetArchived,
} from '@/server/worksheets';

/**
 * Worksheet library actions (CR-17 PR 4; boards W1, W2). The teacher comes from the session
 * only; the server functions check approval, ownership and every field again. Nothing here is
 * shown to a student: assigning (PR 5) makes a separate, frozen copy.
 */

async function teacherId(): Promise<string> {
  if (isDemoMode()) redirect('/teacher/homework');
  const real = await getRealSession();
  if (!real || real.session.role !== 'teacher') redirect('/sign-in');
  return real.session.accountId;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

export interface BuilderState {
  error?: string;
  fields?: DetailsField[];
  problems?: Array<{ index: number; problems: QuestionProblem[] }>;
  notice?: string;
  at?: number;
}

const FIELD_TEXT: Record<DetailsField, string> = {
  kind: 'Choose the kind of worksheet.',
  title: 'Add a title (up to 120 characters).',
  grade: 'Choose a grade.',
  board: 'Choose a board.',
  subject: 'Choose one of the subjects you teach.',
  chapter: 'The chapter can be up to 120 characters.',
  topic: 'The topic can be up to 120 characters.',
  difficulty: 'Choose Easy, Medium, Hard or Not set.',
  instructions: 'Instructions can be up to 4,000 characters.',
  source: 'Check the source: one of your shared files, with a first page and a last page that is not before it.',
};

/** Saves from the builder (W2). `payload` is the builder's state as JSON; `intent` is draft or ready. */
export async function saveWorksheetAction(_prev: BuilderState, fd: FormData): Promise<BuilderState> {
  const id = await teacherId();
  let payload: { id?: string; details?: Record<string, unknown>; questions?: unknown };
  try {
    payload = JSON.parse(str(fd, 'payload') || '{}');
  } catch {
    return { error: 'Something went wrong with the form. Please reload the page and try again.' };
  }
  const ready = str(fd, 'intent') === 'ready';
  const r = await saveWorksheet(db(), id, {
    id: payload.id,
    details: payload.details ?? {},
    questions: payload.questions,
    ready,
  });
  if (r.ok) {
    revalidatePath('/teacher/homework');
    if (!payload.id) redirect(`/teacher/homework/${r.id}?saved=${r.status}`);
    revalidatePath(`/teacher/homework/${r.id}`);
    return {
      notice: r.status === 'ready' ? 'Saved and marked ready. You can assign it now.' : 'Draft saved.',
      at: Date.now(),
    };
  }
  switch (r.reason) {
    case 'not_allowed':
      return { error: 'Your account cannot create worksheets yet.' };
    case 'not_found':
      return { error: 'This worksheet is no longer available. It may be archived.' };
    case 'invalid':
      return { error: 'Some questions could not be saved. Please check them and try again.' };
    case 'details':
      return { error: r.fields.map((f) => FIELD_TEXT[f]).join(' '), fields: r.fields };
    case 'not_ready':
      return {
        error: r.empty
          ? 'Add at least one question before marking it ready. You can save it as a draft.'
          : "Can't mark it ready yet: some questions need finishing (see below). You can save it as a draft.",
        problems: r.problems,
      };
  }
}

export interface LibraryState {
  error?: string;
  notice?: string;
}

export async function duplicateWorksheetAction(_prev: LibraryState, fd: FormData): Promise<LibraryState> {
  const id = await teacherId();
  const r = await duplicateWorksheet(db(), id, str(fd, 'worksheetId'));
  if (!r.ok) return { error: 'That worksheet is no longer available.' };
  revalidatePath('/teacher/homework');
  return { notice: 'Copy saved as a draft. Nothing was assigned.' };
}

export async function archiveWorksheetAction(_prev: LibraryState, fd: FormData): Promise<LibraryState> {
  const id = await teacherId();
  const restore = str(fd, 'restore') === '1';
  const r = await setWorksheetArchived(db(), id, str(fd, 'worksheetId'), !restore);
  if (!r.ok) return { error: 'That worksheet is no longer available.' };
  revalidatePath('/teacher/homework');
  return {
    notice: restore ? 'Restored.' : 'Archived. It can’t be assigned now. Students who already have a copy keep it.',
  };
}

/** "Copy questions from my worksheets" (W2): only the teacher's own; the copies are independent. */
export async function copyQuestionsAction(fromId: string): Promise<QuestionDraft[] | null> {
  const id = await teacherId();
  return questionsToCopy(db(), id, fromId);
}

// ------------------------------------------------------------------ PR 5: assign, review, release

export interface AssignState {
  error?: string;
  /** W-2: the student's grade or board differs; the teacher must tick to confirm. */
  mismatch?: { grade: boolean; board: boolean };
}

const DATE_TEXT = {
  past: 'The assignment date can’t be in the past.',
  due_before: 'The due date must be on or after the assignment date.',
  bad: 'Check the dates.',
} as const;

/** "Assign" (W3): one student, one frozen copy. */
export async function assignAction(_prev: AssignState, fd: FormData): Promise<AssignState> {
  const id = await teacherId();
  const worksheetId = str(fd, 'worksheetId');
  const later = str(fd, 'when') === 'later';
  const r = await assignWorksheet(db(), id, {
    worksheetId,
    studentId: str(fd, 'studentId'),
    visibleOn: later ? str(fd, 'visibleOn') : '',
    dueOn: str(fd, 'dueOn'),
    dueTime: str(fd, 'dueTime'),
    releaseMode: str(fd, 'releaseMode'),
    showAnswers: str(fd, 'showAnswers') === '1',
    confirmMismatch: str(fd, 'confirmMismatch') === '1',
  });
  if (r.ok) {
    revalidatePath('/teacher/homework');
    redirect(`/teacher/homework?assigned=${r.scheduled ? 'later' : 'now'}#library`);
  }
  switch (r.reason) {
    case 'mismatch':
      return {
        error: 'This student’s grade or board is different. Tick “I’ve checked it suits” to assign it anyway.',
        mismatch: { grade: r.grade, board: r.board },
      };
    case 'not_linked':
      return { error: 'Choose a student. Only children linked to you for this subject can be given it.' };
    case 'not_ready':
      return { error: 'Mark the worksheet ready before assigning it.' };
    case 'dates':
      return { error: DATE_TEXT[r.problem] };
    case 'invalid':
      return { error: '“As soon as marked” works only when every question is marked automatically.' };
    case 'handwritten_later':
      return { error: 'Handwritten work can be assigned once parents can upload pages (coming in a later release).' };
    default:
      return { error: 'This worksheet is no longer available.' };
  }
}

export interface ReviewState {
  error?: string;
  notice?: string;
}

const NOT_AVAILABLE = 'This homework is no longer available to you.';

/** Marks, feedback and outcome (HW4). */
export async function saveReviewAction(_prev: ReviewState, fd: FormData): Promise<ReviewState> {
  const id = await teacherId();
  const targetId = str(fd, 'targetId');
  const count = Number(str(fd, 'count'));
  const marks: Array<string | null> = [];
  const comments: string[] = [];
  for (let i = 0; i < (Number.isInteger(count) && count >= 0 && count <= 100 ? count : 0); i++) {
    const m = str(fd, `mark-${i}`).trim();
    marks.push(m === '' ? null : m);
    comments.push(str(fd, `comment-${i}`));
  }
  const intent = str(fd, 'intent');
  const r = await saveReview(db(), id, targetId, {
    marks: marks.map((m) => (m === null ? null : Number(m))),
    comments,
    feedback: str(fd, 'feedback'),
    outcome: intent === 'revision' ? 'revision' : 'reviewed',
    note: str(fd, 'note'),
    release: intent === 'release',
  });
  if (r.ok) {
    revalidatePath('/teacher/homework/review');
    revalidatePath(`/teacher/homework/review/${targetId}`);
    return {
      notice:
        r.status === 'revision_required'
          ? 'Sent back for a revision. The student and parent can see your note.'
          : r.released
            ? 'Marked and released. The student and parent can see the marks now.'
            : 'Marked. The student sees the marks when you release them.',
    };
  }
  switch (r.reason) {
    case 'marks':
      return { error: 'Give a mark for every written answer, from 0 up to the question’s marks.' };
    case 'invalid':
      return {
        error: 'Add a note saying what to change (up to 500 characters). Feedback can be up to 4,000 characters.',
      };
    case 'closed':
      return { error: 'This homework can’t be marked now. It may already be released or withdrawn.' };
    default:
      return { error: NOT_AVAILABLE };
  }
}

export async function releaseAction(_prev: ReviewState, fd: FormData): Promise<ReviewState> {
  const id = await teacherId();
  const targetId = str(fd, 'targetId');
  const r = await releaseResults(db(), id, targetId);
  if (!r.ok) return { error: r.reason === 'closed' ? 'Already released, or not marked yet.' : NOT_AVAILABLE };
  revalidatePath('/teacher/homework/review');
  revalidatePath(`/teacher/homework/review/${targetId}`);
  return { notice: 'Released. The student and parent can see the marks now.' };
}

export async function withdrawAction(_prev: ReviewState, fd: FormData): Promise<ReviewState> {
  const id = await teacherId();
  const r = await withdrawAssignment(db(), id, str(fd, 'assignmentId'));
  if (!r.ok) return { error: r.reason === 'closed' ? 'Reviewed work can’t be withdrawn.' : NOT_AVAILABLE };
  revalidatePath('/teacher/homework/review');
  revalidatePath('/teacher/homework');
  return { notice: 'Withdrawn. It is kept as history and is no longer due.' };
}

/** W-10: only while the work is still hidden from the student. */
export async function changeDatesAction(_prev: ReviewState, fd: FormData): Promise<ReviewState> {
  const id = await teacherId();
  const r = await changeAssignmentDates(db(), id, str(fd, 'assignmentId'), {
    visibleOn: str(fd, 'visibleOn'),
    dueOn: str(fd, 'dueOn'),
    dueTime: str(fd, 'dueTime'),
  });
  if (r.ok) {
    revalidatePath('/teacher/homework/review');
    return { notice: 'Dates changed.' };
  }
  if (r.reason === 'dates') return { error: DATE_TEXT[r.problem] };
  if (r.reason === 'visible')
    return { error: 'The student can already see it, so its date can’t change. Withdraw it instead.' };
  return { error: NOT_AVAILABLE };
}
