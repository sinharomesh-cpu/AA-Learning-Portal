'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { getRealSession } from '@/server/session';
import {
  type SaveOutcome,
  saveTeacherProfile,
  setHiddenFromSearch,
  type TeacherProfileProblem,
} from '@/server/teacherProfile';

/**
 * The teacher's own profile (M-20, M-22). The teacher comes from the server-side session only;
 * saveTeacherProfile checks status and approval again in the database.
 */
export interface TeacherProfileFormState {
  error?: string;
  notice?: string;
  outcome?: SaveOutcome;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string | string[]>;
  at?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};
const list = (fd: FormData, key: string) => fd.getAll(key).filter((v): v is string => typeof v === 'string');

const PROBLEM: Record<TeacherProfileProblem, [string, string]> = {
  name: ['name', 'Enter the name families will see (2 to 80 characters).'],
  time_zone: ['timeZone', 'Choose your time zone.'],
  subjects: ['subjects', 'Choose at least one subject.'],
  grades: ['grades', 'Choose at least one grade.'],
  bio: ['bio', 'Write a few sentences about your teaching (20 to 1,000 characters).'],
  curricula: ['curricula', 'Choose curricula from the list.'],
  experience: ['experienceYears', 'Enter whole years from 0 to 60, or leave it empty.'],
  terms: ['terms', 'Please agree to the teacher terms to send your profile.'],
};

const NOTICE: Record<SaveOutcome, string> = {
  draft_saved: 'Draft saved. Send it for approval when you are ready.',
  submitted: 'Sent for approval. We will email you when the AA Pro team has reviewed it.',
  updated_in_queue: 'Saved. The AA Pro team will see your latest profile.',
  saved: 'Your profile is saved.',
  saved_change_pending:
    'Saved. Your new subjects or grades are waiting for review; until then families see your approved ones.',
  saved_change_withdrawn:
    'Saved. Your subjects and grades are back to the approved ones, so nothing is waiting for review.',
};

export async function saveTeacherProfileAction(
  _prev: TeacherProfileFormState,
  fd: FormData,
): Promise<TeacherProfileFormState> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'teacher') redirect('/sign-in');
  const intent = str(fd, 'intent') === 'submit' ? 'submit' : 'draft';
  const values = {
    name: str(fd, 'name'),
    timeZone: str(fd, 'timeZone'),
    bio: str(fd, 'bio'),
    subjects: list(fd, 'subjects'),
    grades: list(fd, 'grades'),
    curricula: list(fd, 'curricula'),
    experienceYears: str(fd, 'experienceYears').trim(),
    terms: str(fd, 'terms'),
  };
  // Empty means "not stated"; anything else must be whole years (checked again on the server).
  const experienceYears =
    values.experienceYears === ''
      ? null
      : /^\d{1,3}$/.test(values.experienceYears)
        ? Number(values.experienceYears)
        : NaN;
  const r = await saveTeacherProfile(
    db(),
    real.session.accountId,
    {
      name: values.name,
      timeZone: values.timeZone,
      bio: values.bio,
      subjects: values.subjects,
      grades: values.grades.map(Number),
      curricula: values.curricula,
      experienceYears,
      acceptTerms: values.terms === 'yes',
    },
    intent,
  );
  if (!r.ok) {
    if (r.reason === 'not_allowed') redirect('/teacher/status');
    return {
      values,
      fieldErrors: Object.fromEntries(r.problems.map((p) => PROBLEM[p])),
      at: Date.now(),
    };
  }
  revalidatePath('/teacher', 'layout');
  if (r.outcome === 'submitted') redirect('/teacher/status?sent=1');
  return { notice: NOTICE[r.outcome], outcome: r.outcome, values, at: Date.now() };
}

export interface VisibilityFormState {
  error?: string;
  notice?: string;
  at?: number;
}

/** OC-54 "Hide me from search": the teacher's own setting, taken from the session only. */
export async function setSearchVisibilityAction(
  _prev: VisibilityFormState,
  fd: FormData,
): Promise<VisibilityFormState> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'teacher') redirect('/sign-in');
  const hidden = str(fd, 'hidden') === 'yes';
  const r = await setHiddenFromSearch(db(), real.session.accountId, hidden);
  if (!r.ok) redirect('/teacher/status');
  revalidatePath('/teacher/profile');
  return {
    notice: hidden
      ? 'Hidden. Parents can no longer find you in Find a teacher. Families who already added you are not affected.'
      : 'You are visible again. Parents can find you in Find a teacher once your profile is approved.',
    at: Date.now(),
  };
}
