'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { dayAndTime, MESSAGE_MAX } from '@/lib/linkRequests';
import { db } from '@/server/db/client';
import { allowMeetingLinks, stopMeetingLinks } from '@/server/meetingLinks';
import { siteBaseUrl } from '@/server/requestInfo';
import { getRealSession } from '@/server/session';
import {
  addTeacher,
  addTeacherFromDirectory,
  type ChildSubjects,
  removeTeacher,
  resendLinkRequest,
  updateTeacherLinks,
  withdrawLinkRequest,
} from '@/server/teacherLinks';

/**
 * Parent actions on teacher links (boards 57, 58). The parent comes from the server-side session
 * only; server/teacherLinks.ts checks every child against the parent's guardian links again.
 */
export interface TeacherFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: { name?: string; email?: string; message?: string; picks?: Record<string, string[]> };
  at?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

async function parentSession(): Promise<{ id: string; timeZone: string }> {
  const real = await getRealSession();
  if (!real || real.session.role !== 'parent' || real.session.status !== 'active') redirect('/sign-in');
  return { id: real.session.accountId, timeZone: real.session.timeZone };
}

async function parentId(): Promise<string> {
  return (await parentSession()).id;
}

const MESSAGE_TOO_LONG = `Keep the message to ${MESSAGE_MAX} characters or fewer.`;

/** FR-038.8: the 7-day wait after a decline, with the date it ends. */
const waitText = (teacher: string, child: string, until: Date, timeZone: string) =>
  `${teacher || 'This teacher'} declined your request for ${child} recently. You can ask them again for ${child} from ${dayAndTime(until, timeZone)}. You can ask any other teacher now.`;

const ALREADY = (teacher: string) =>
  `${teacher} already has a request or a link for the children you ticked. See My teachers, where you can change subjects or withdraw a request.`;

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
  const parent = await parentSession();
  const { choice, picks } = readPicks(fd);
  const values = { name: str(fd, 'name'), email: str(fd, 'email'), message: str(fd, 'message'), picks };
  const r = await addTeacher(db(), parent.id, {
    name: values.name,
    email: values.email,
    message: values.message,
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
    case 'message':
      return { values, at, fieldErrors: { message: MESSAGE_TOO_LONG } };
    case 'already':
      return { values, at, error: ALREADY(r.teacherName) };
    case 'wait':
      return { values, at, error: waitText(r.teacherName, r.child, r.until, parent.timeZone) };
    default:
      return { values, at, error: "We couldn't add this teacher. Please reload the page and try again." };
  }
}

/** Board 65 "Add as my teacher": the teacher comes from the directory, so no email is typed or shown. */
export async function addFromDirectoryAction(_prev: TeacherFormState, fd: FormData): Promise<TeacherFormState> {
  const parent = await parentSession();
  const teacherId = str(fd, 'teacherId');
  const { choice, picks } = readPicks(fd);
  const message = str(fd, 'message');
  const r = await addTeacherFromDirectory(db(), parent.id, teacherId, choice, {
    message,
    baseUrl: await siteBaseUrl(),
  });
  if (r.ok) {
    revalidatePath('/parent/teachers');
    redirect(`/parent/teachers?done=sent&who=${encodeURIComponent(r.teacherName)}`);
  }
  const at = Date.now();
  switch (r.reason) {
    case 'message':
      return { values: { picks, message }, at, fieldErrors: { message: MESSAGE_TOO_LONG } };
    case 'already':
      return { values: { picks, message }, at, error: ALREADY(r.teacherName) };
    case 'wait':
      return { values: { picks, message }, at, error: waitText(r.teacherName, r.child, r.until, parent.timeZone) };
    case 'choose':
    case 'subjects':
      return { values: { picks }, at, fieldErrors: { children: CHOOSE } };
    case 'not_taught':
      return {
        values: { picks },
        at,
        fieldErrors: {
          children: `${r.teacherName} teaches only ${r.teaches.map((x) => SUBJECTS[x as SubjectId]?.name ?? x).join(', ')} on AA Pro. Untick the other subjects.`,
        },
      };
    case 'not_listed':
      return { at, error: 'This teacher is no longer listed. Go back to Find a teacher and search again.' };
    default:
      return { values: { picks }, at, error: "We couldn't add this teacher. Please reload the page and try again." };
  }
}

export async function updateLinksAction(_prev: TeacherFormState, fd: FormData): Promise<TeacherFormState> {
  const parent = await parentSession();
  const teacherId = str(fd, 'teacherId');
  const { choice, picks } = readPicks(fd);
  const r = await updateTeacherLinks(db(), parent.id, teacherId, choice, new Date(), await siteBaseUrl());
  if (r.ok) {
    revalidatePath('/parent/teachers');
    redirect(`/parent/teachers?done=${r.removed ? 'removed' : r.requested ? 'changed_requested' : 'changed'}`);
  }
  if (r.reason === 'wait') {
    return { values: { picks }, at: Date.now(), error: waitText('', r.child, r.until, parent.timeZone) };
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

/** TR2 "Withdraw request": one waiting request, after a confirmation. */
export async function withdrawRequestAction(_prev: TeacherFormState, fd: FormData): Promise<TeacherFormState> {
  const parent = await parentId();
  const r = await withdrawLinkRequest(db(), parent, str(fd, 'requestId'));
  if (r.ok) {
    revalidatePath('/parent/teachers');
    redirect('/parent/teachers?done=withdrawn');
  }
  return {
    error:
      r.reason === 'answered'
        ? 'The teacher has already answered, or the request has ended. The page now shows the latest status.'
        : 'This request is no longer available.',
    at: Date.now(),
  };
}

/** TR2 "Send again": after an expiry, a withdrawal, or once the 7-day wait after a decline is over. */
export async function resendRequestAction(_prev: TeacherFormState, fd: FormData): Promise<TeacherFormState> {
  const parent = await parentSession();
  const r = await resendLinkRequest(db(), parent.id, str(fd, 'requestId'), await siteBaseUrl());
  if (r.ok) {
    revalidatePath('/parent/teachers');
    redirect(`/parent/teachers?done=${r.outcome}&who=${encodeURIComponent(r.teacherName)}`);
  }
  const at = Date.now();
  switch (r.reason) {
    case 'wait':
      return { at, error: `You can send this again from ${dayAndTime(r.until, parent.timeZone)}.` };
    case 'already':
      return { at, error: 'There is already a request or a link for this child with this teacher.' };
    case 'subjects':
      return {
        at,
        error: 'This teacher no longer teaches the subjects you asked for. Use Add a teacher to choose others.',
      };
    case 'cannot_add':
      return { at, error: 'This teacher can no longer be asked on AA Pro.' };
    default:
      return { at, error: 'This request is no longer available.' };
  }
}

/**
 * CR-17 PR 3 (D3A-1, rules 1–4): allow, or stop, a teacher's own Zoom meeting links for one child.
 * Either parent may do either; it takes effect at once and the other parent is told.
 */
export async function meetingPermissionAction(_prev: TeacherFormState, fd: FormData): Promise<TeacherFormState> {
  const id = await parentId();
  const teacherId = str(fd, 'teacherId');
  const childId = str(fd, 'childId');
  const allow = str(fd, 'choice') === 'allow';
  const r = allow
    ? await allowMeetingLinks(db(), id, teacherId, childId)
    : await stopMeetingLinks(db(), id, teacherId, childId);
  if (!r.ok) return { error: 'This teacher isn’t linked to this child any more. Check My teachers.' };
  revalidatePath(`/parent/teachers/${teacherId}`);
  revalidatePath('/parent/calendar');
  redirect(`/parent/teachers/${teacherId}?meeting=${allow ? 'allowed' : 'stopped'}`);
}
