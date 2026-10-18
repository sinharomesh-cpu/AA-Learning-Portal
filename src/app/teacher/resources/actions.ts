'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { FILE_PROBLEM_TEXT, type FileProblem } from '@/server/files/prepare';
import { uploadRefusalText } from '@/lib/storage';
import { db } from '@/server/db/client';
import { getRealSession } from '@/server/session';
import {
  editResource,
  setArchived,
  shareNewResource,
  shareOptions,
  shareWithMore,
  unshareResource,
} from '@/server/teacherResources';

/**
 * Teacher resources (CR-07 H-2b, board HW2). The teacher comes from the session only; the
 * server functions check approval, links, ticked subjects, limits and ownership again.
 */
export interface ResourceFormState {
  error?: string;
  notice?: string;
  /** Changes on each success, so the share form can reset itself. */
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

const NOT_LINKED =
  "A parent hasn't ticked this subject for one of these students, or the student is no longer linked to you. Nothing was shared.";

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export async function shareResourceAction(_prev: ResourceFormState, fd: FormData): Promise<ResourceFormState> {
  const id = await teacherId();
  const studentIds = fd.getAll('studentIds').filter((v): v is string => typeof v === 'string');
  const r = await shareNewResource(db(), id, {
    uploadId: str(fd, 'upload'),
    title: str(fd, 'title'),
    subject: str(fd, 'subject'),
    chapter: str(fd, 'chapter'),
    note: str(fd, 'note'),
    studentIds,
  });
  if (r.ok) {
    revalidatePath('/teacher/resources');
    revalidatePath('/teacher');
    const names = (await shareOptions(db(), id)).filter((o) => r.sharedWith.includes(o.studentId)).map((o) => o.name);
    return {
      notice: `Shared with ${listNames(names)}. They can open it now, and their parents can see it in AA Pro.`,
      at: Date.now(),
    };
  }
  switch (r.reason) {
    case 'not_allowed':
      return { error: 'Your account cannot share resources yet.' };
    case 'invalid':
      return { error: 'Add a title (up to 120 characters), choose a subject and at least one student.' };
    case 'not_linked':
      return { error: NOT_LINKED };
    case 'upload_missing':
      return { error: 'Choose a file and wait until it says "ready", then share.' };
    case 'daily_limit':
    case 'space_full':
    case 'storage_full':
      return { error: uploadRefusalText(r) };
    default:
      return { error: FILE_PROBLEM_TEXT[r.reason as FileProblem] ?? 'The file could not be shared. Please try again.' };
  }
}

const NOT_FOUND = 'That resource is no longer available.';

export async function editResourceAction(_prev: ResourceFormState, fd: FormData): Promise<ResourceFormState> {
  const id = await teacherId();
  const r = await editResource(db(), id, str(fd, 'resourceId'), {
    title: str(fd, 'title'),
    chapter: str(fd, 'chapter'),
    note: str(fd, 'note'),
  });
  if (!r.ok) return { error: r.reason === 'invalid' ? 'Add a title of up to 120 characters.' : NOT_FOUND };
  revalidatePath('/teacher/resources');
  return { notice: 'Saved.', at: Date.now() };
}

export async function shareMoreAction(_prev: ResourceFormState, fd: FormData): Promise<ResourceFormState> {
  const id = await teacherId();
  const studentIds = fd.getAll('studentIds').filter((v): v is string => typeof v === 'string');
  const r = await shareWithMore(db(), id, str(fd, 'resourceId'), studentIds);
  if (!r.ok) {
    if (r.reason === 'invalid') return { error: 'Choose at least one student.' };
    return { error: r.reason === 'not_linked' ? NOT_LINKED : NOT_FOUND };
  }
  revalidatePath('/teacher/resources');
  return { notice: 'Shared.', at: Date.now() };
}

export async function unshareAction(_prev: ResourceFormState, fd: FormData): Promise<ResourceFormState> {
  const id = await teacherId();
  const r = await unshareResource(db(), id, str(fd, 'resourceId'), str(fd, 'studentId'));
  if (!r.ok) return { error: NOT_FOUND };
  revalidatePath('/teacher/resources');
  return { notice: 'Stopped sharing.', at: Date.now() };
}

export async function archiveAction(_prev: ResourceFormState, fd: FormData): Promise<ResourceFormState> {
  const id = await teacherId();
  const restore = str(fd, 'restore') === '1';
  const r = await setArchived(db(), id, str(fd, 'resourceId'), !restore);
  if (!r.ok) return { error: NOT_FOUND };
  revalidatePath('/teacher/resources');
  revalidatePath('/teacher');
  return {
    notice: restore ? 'Restored. Students can see it again.' : 'Deleted. You can restore it for 30 days.',
    at: Date.now(),
  };
}
