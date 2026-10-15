'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { writeAudit } from '@/server/auth/audit';
import { passwordProblemMessage } from '@/server/auth/password';
import { recordReauthFailure, recordReauthSuccess, SESSION_COOKIE } from '@/server/auth/sessions';
import {
  checkParentPassword,
  createChild,
  type ProfileProblem,
  recordChildConsents,
  resetChildPassword,
  setChildPaused,
  signOutChildEverywhere,
  unlockChild,
  updateChildProfile,
} from '@/server/children';
import { db } from '@/server/db/client';
import { getRealSession } from '@/server/session';

/**
 * Parent actions on children (WP2-4; M-06, M-08). Each one finds the parent from the
 * server-side session only, and the child functions check the guardian link again.
 */
export interface ChildFormState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string | string[]>;
  /** Shown once after creating a child or resetting a password. */
  credentials?: { childName: string; username: string; password: string };
  needsReauth?: boolean;
  /** When the server answered, so the page can tell which of two answers is newer. */
  at?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

async function parentSession() {
  const real = await getRealSession();
  if (!real || real.session.role !== 'parent' || real.session.status !== 'active') redirect('/sign-in');
  return real;
}

const PROFILE_MESSAGES: Record<ProfileProblem, [string, string]> = {
  name: ['name', 'Enter a first name (up to 40 characters).'],
  grade: ['grade', 'Choose a grade.'],
  curriculum: ['curriculum', 'Choose a curriculum from the list.'],
  time_zone: ['timeZone', 'Choose a time zone.'],
  subjects: ['subjects', 'Choose at least one subject.'],
  avatar: ['avatar', 'Pick a picture.'],
};

function readProfile(fd: FormData) {
  const curriculum = str(fd, 'curriculum');
  return {
    name: str(fd, 'name'),
    grade: Number(str(fd, 'grade')),
    curriculum: curriculum === '' ? null : curriculum,
    timeZone: str(fd, 'timeZone'),
    subjects: fd.getAll('subjects').filter((s): s is string => typeof s === 'string'),
    avatar: str(fd, 'avatar') || 'star',
  };
}

function echo(fd: FormData): Record<string, string | string[]> {
  return {
    name: str(fd, 'name'),
    grade: str(fd, 'grade'),
    curriculum: str(fd, 'curriculum'),
    timeZone: str(fd, 'timeZone'),
    subjects: fd.getAll('subjects').filter((s): s is string => typeof s === 'string'),
    avatar: str(fd, 'avatar'),
    username: str(fd, 'username'),
  };
}

// ------------------------------------------------------------------ M-06 consent

export async function giveChildConsentAction(_prev: ChildFormState, fd: FormData): Promise<ChildFormState> {
  const { session } = await parentSession();
  const result = await recordChildConsents(db(), session.accountId, {
    guardian: str(fd, 'guardian') === 'yes',
    aiTutor: str(fd, 'aiTutor') === 'yes',
    emailReminders: str(fd, 'emailReminders') === 'yes',
  });
  if (!result.ok) return { error: 'Please tick both required boxes to continue.' };
  revalidatePath('/parent/children/new');
  redirect('/parent/children/new');
}

// ------------------------------------------------------------------ M-08 create and edit

export async function createChildAction(_prev: ChildFormState, fd: FormData): Promise<ChildFormState> {
  const { session } = await parentSession();
  const values = echo(fd);
  const password = str(fd, 'password');
  const result = await createChild(db(), session.accountId, {
    ...readProfile(fd),
    username: str(fd, 'username'),
    password: password === '' ? null : password,
  });
  if (result.ok) {
    revalidatePath('/parent/children');
    return {
      credentials: { childName: readProfile(fd).name.trim(), username: result.username, password: result.password },
    };
  }
  switch (result.reason) {
    case 'consent_required':
      redirect('/parent/children/new');
    case 'not_found':
      redirect('/sign-in');
    case 'profile': {
      const [field, message] = PROFILE_MESSAGES[result.problem];
      return { fieldErrors: { [field]: message }, values };
    }
    case 'password':
      return { fieldErrors: { password: passwordProblemMessage(result.problem, 'child') }, values };
    case 'username':
      return { fieldErrors: { username: 'Use at least 2 letters or numbers.' }, values };
    case 'username_unavailable':
      return { fieldErrors: { username: 'Please try a different name.' }, values };
  }
}

export async function updateChildAction(_prev: ChildFormState, fd: FormData): Promise<ChildFormState> {
  const { session } = await parentSession();
  const childId = str(fd, 'childId');
  const result = await updateChildProfile(db(), session.accountId, childId, readProfile(fd));
  if (result.ok) {
    revalidatePath('/parent/children');
    revalidatePath(`/parent/children/${childId}`);
    return { notice: 'Changes saved.' };
  }
  if (result.reason === 'not_found') redirect('/parent/children');
  const [field, message] = PROFILE_MESSAGES[result.problem];
  return { fieldErrors: { [field]: message }, values: echo(fd) };
}

// ------------------------------------------------------------------ M-08 sign-in and security

const WRONG_CONFIRMATION = 'That is not your password. Please try again.';

/** Step 1 · Confirm it's you (G1-08 §3.4 step 3). Five wrong tries sign the parent out. */
export async function confirmParentAction(_prev: ChildFormState, fd: FormData): Promise<ChildFormState> {
  const { session, token } = await parentSession();
  const sql = db();
  if (await checkParentPassword(sql, session.accountId, str(fd, 'password'))) {
    await recordReauthSuccess(sql, token);
    await writeAudit(sql, {
      type: 'PARENT_REAUTH_SUCCEEDED',
      outcome: 'success',
      actorId: session.accountId,
      subjectId: session.accountId,
    });
    revalidatePath(`/parent/children/${str(fd, 'childId')}`);
    return { notice: 'Thanks. You can now choose an action below for the next 5 minutes.', at: Date.now() };
  }
  const signedOut = await recordReauthFailure(sql, token);
  await writeAudit(sql, {
    type: 'PARENT_REAUTH_FAILED',
    outcome: 'failure',
    actorId: session.accountId,
    subjectId: session.accountId,
    details: { signedOut },
  });
  if (signedOut) {
    (await cookies()).delete(SESSION_COOKIE);
    redirect('/sign-in?signedOut=reauth');
  }
  return {
    needsReauth: true,
    fieldErrors: { password: WRONG_CONFIRMATION },
    at: Date.now(),
  };
}

const REAUTH_MESSAGE = 'For your security, please confirm your password again.';

export async function childSecurityAction(_prev: ChildFormState, fd: FormData): Promise<ChildFormState> {
  const { session } = await parentSession();
  const sql = db();
  const childId = str(fd, 'childId');
  const childName = str(fd, 'childName');
  const actor = { parentId: session.accountId, reauthenticatedAt: session.reauthenticatedAt };
  const op = str(fd, 'op');
  const done = (notice: string): ChildFormState => {
    revalidatePath(`/parent/children/${childId}`);
    revalidatePath('/parent/children');
    return { notice };
  };
  switch (op) {
    case 'reset': {
      const typed = str(fd, 'newPassword');
      const r = await resetChildPassword(sql, actor, childId, typed === '' ? null : typed);
      if (r.ok) {
        revalidatePath(`/parent/children/${childId}`);
        return { credentials: { childName, username: r.username, password: r.password } };
      }
      if (r.reason === 'password') return { fieldErrors: { newPassword: passwordProblemMessage(r.problem, 'child') } };
      if (r.reason === 'reauth_required') return { needsReauth: true, error: REAUTH_MESSAGE, at: Date.now() };
      redirect('/parent/children');
    }
    case 'unlock':
    case 'signout':
    case 'pause':
    case 'resume': {
      const r =
        op === 'unlock'
          ? await unlockChild(sql, actor, childId)
          : op === 'signout'
            ? await signOutChildEverywhere(sql, actor, childId)
            : await setChildPaused(sql, actor, childId, op === 'pause');
      if (r.ok) {
        return done(
          {
            unlock: `${childName} can sign in again now.`,
            signout: `${childName} is signed out on all devices.`,
            pause: `${childName}'s account is paused. ${childName} cannot sign in until you resume it.`,
            resume: `${childName} can sign in again.`,
          }[op],
        );
      }
      if (r.reason === 'reauth_required') return { needsReauth: true, error: REAUTH_MESSAGE, at: Date.now() };
      redirect('/parent/children');
    }
    default:
      return { error: 'Please choose an action.' };
  }
}
