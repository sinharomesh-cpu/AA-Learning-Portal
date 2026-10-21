'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { QuestionDraft, QuestionProblem } from '@/lib/worksheetQuestions';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getRealSession } from '@/server/session';
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
