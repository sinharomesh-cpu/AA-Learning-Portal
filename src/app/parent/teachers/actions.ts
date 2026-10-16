'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { db } from '@/server/db/client';
import { siteBaseUrl } from '@/server/requestInfo';
import { getRealSession } from '@/server/session';
import { addTeacher, type ChildSubjects, removeTeacher, updateTeacherLinks } from '@/server/teacherLinks';

/**
 * Parent actions on teacher links (boards 57, 58). The parent comes from the server-side session
 * only; server/teacherLinks.ts checks every child against the parent's guardian links again.
 */
export interface TeacherFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: { name?: string; email?: string; picks?: Record<string, string[]> };
  at?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

async function parentId(): Promise<string> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'parent' || real.session.status !== 'active') redirect('/sign-in');
  return real.session.accountId;
}

/** Reads "child" checkboxes and "subjects:<childId>" ticks; an unticked child counts as no subjects. */
function readPicks(fd: FormData): { choice: ChildSubjects[]; picks: Record<string, string[]> } {
  const children = fd.getAll('child').filter((v): v is string => typeof v === 'string');
  const picks: Record<string, string[]> = {};
  for (const childId of children) {
    picks[childId] = fd.getAll(`subjects:${childId}`).filter((v): v is string => typeof v === 'string');
  }
  return { choice: Object.entries(picks).map(([childId, subjects]) => ({ childId, subjects })), picks };
}

const CHOOSE = 'Tick at least one child and one subject.';

export async function addTeacherAction(_prev: TeacherFormState, fd: FormData): Promise<TeacherFormState> {
  const parent = await parentId();
  const { choice, picks } = readPicks(fd);
  const values = { name: str(fd, 'name'), email: str(fd, 'email'), picks };
  const r = await addTeacher(db(), parent, {
    name: values.name,
    email: values.email,
    children: choice,
    baseUrl: await siteBaseUrl(),
  });
  if (r.ok) {
    revalidatePath('/parent/teachers');
    redirect(`/parent/teachers?done=${r.outcome}&who=${encodeURIComponent(r.teacherName)}`);
  }
  const at = Date.now();
  switch (r.reason) {
    case 'name':
      return { values, at, fieldErrors: { name: "Enter the teacher's name (2 to 80 characters)." } };
    case 'email':
      return { values, at, fieldErrors: { email: 'Enter a valid email address.' } };
    case 'choose':
    case 'subjects':
      return { values, at, fieldErrors: { children: CHOOSE } };
    case 'too_many':
      return {
        values,
        at,
        error: 'You have added many new teachers today. Please try again tomorrow, or contact support.',
      };
    case 'not_taught':
      return {
        values,
        at,
        fieldErrors: {
          children: `${r.teacherName} teaches only ${r.teaches.map((x) => SUBJECTS[x as SubjectId]?.name ?? x).join(', ') || 'no subjects yet'} on AA Pro. Untick the other subjects.`,
        },
      };
    case 'cannot_add':
      return { values, at, error: "We couldn't add this teacher. Check the email address, or contact support." };
    default:
      return { values, at, error: "We couldn't add this teacher. Please reload the page and try again." };
  }
}

export async function updateLinksAction(_prev: TeacherFormState, fd: FormData): Promise<TeacherFormState> {
  const parent = await parentId();
  const teacherId = str(fd, 'teacherId');
  const { choice, picks } = readPicks(fd);
  const r = await updateTeacherLinks(db(), parent, teacherId, choice);
  if (r.ok) {
    revalidatePath('/parent/teachers');
    redirect(`/parent/teachers?done=${r.removed ? 'removed' : 'changed'}`);
  }
  if (r.reason === 'subjects') {
    return {
      values: { picks },
      at: Date.now(),
      fieldErrors: { children: 'Tick at least one child and one subject this teacher teaches.' },
    };
  }
  return { error: 'This teacher is no longer linked to your children.', at: Date.now() };
}

export async function removeTeacherAction(_prev: TeacherFormState, fd: FormData): Promise<TeacherFormState> {
  const parent = await parentId();
  const r = await removeTeacher(db(), parent, str(fd, 'teacherId'));
  if (r.ok) {
    revalidatePath('/parent/teachers');
    redirect('/parent/teachers?done=removed');
  }
  return { error: 'This teacher is no longer linked to your children.', at: Date.now() };
}
