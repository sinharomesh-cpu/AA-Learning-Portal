'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createAccount,
  createAdmin,
  decideProfileChange,
  decideTeacher,
  resendAdminInvite,
  setAccountActive,
  type TeacherDecision,
  updateAccount,
  updateAdmin,
} from '@/server/admin';
import { db } from '@/server/db/client';
import { siteBaseUrl } from '@/server/requestInfo';
import { getRealSession } from '@/server/session';

/**
 * Admin actions (WP2-5b). The actor comes from the server-side session only, and must have
 * passed the security-code step; the functions in server/admin.ts check role, status and
 * permission again against the database.
 */
export interface AdminFormState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string | string[]>;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};
const list = (fd: FormData, key: string) => fd.getAll(key).filter((v): v is string => typeof v === 'string');

async function actor(): Promise<string> {
  const real = await getRealSession();
  const s = real?.session;
  if (!s || (s.role !== 'superadmin' && s.role !== 'admin')) redirect('/sign-in');
  if (!s.mfaVerifiedAt) redirect('/security-check');
  return s.accountId;
}

const NOT_ALLOWED: AdminFormState = { error: 'Your account is not allowed to do this.' };

// ------------------------------------------------------------------ Admins (board 66)

export async function createAdminAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const actorId = await actor();
  const values = { name: str(fd, 'name'), email: str(fd, 'email'), permissions: list(fd, 'permissions') };
  const r = await createAdmin(db(), actorId, { ...values, baseUrl: await siteBaseUrl() });
  if (r.ok) {
    revalidatePath('/admin/admins');
    return { notice: `Invitation sent to ${values.email.trim()}. They set a password, then a security code.` };
  }
  switch (r.reason) {
    case 'denied':
      return NOT_ALLOWED;
    case 'invalid_name':
      return { fieldErrors: { name: 'Enter a name.' }, values };
    case 'invalid_email':
      return { fieldErrors: { email: 'Enter a valid email address.' }, values };
    case 'email_taken':
      return { fieldErrors: { email: 'An account already uses this email.' }, values };
    case 'no_permissions':
      return { fieldErrors: { permissions: 'Tick at least one thing this admin can manage.' }, values };
  }
}

export async function updateAdminAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const actorId = await actor();
  const adminId = str(fd, 'adminId');
  if (str(fd, 'op') === 'resend') {
    const r = await resendAdminInvite(db(), actorId, adminId, await siteBaseUrl());
    return r.ok ? { notice: 'A new set-password link was sent.' } : NOT_ALLOWED;
  }
  const r = await updateAdmin(db(), actorId, adminId, {
    permissions: list(fd, 'permissions'),
    active: str(fd, 'active') === 'yes',
  });
  if (r.ok) {
    revalidatePath('/admin/admins');
    return { notice: 'Saved.' };
  }
  if (r.reason === 'no_permissions') return { error: 'Tick at least one area, or turn the admin off.' };
  return NOT_ALLOWED;
}

// ------------------------------------------------------------------ Accounts (M-27, M-28)

export async function createAccountAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const actorId = await actor();
  const values = { role: str(fd, 'role'), name: str(fd, 'name'), email: str(fd, 'email') };
  const r = await createAccount(db(), actorId, { ...values, baseUrl: await siteBaseUrl() });
  if (r.ok) redirect(`/admin/accounts/${r.accountId}?created=1`);
  switch (r.reason) {
    case 'denied':
      return NOT_ALLOWED;
    case 'invalid_role':
      return { fieldErrors: { role: 'Choose parent or teacher.' }, values };
    case 'invalid_name':
      return { fieldErrors: { name: 'Enter a name.' }, values };
    case 'invalid_email':
      return { fieldErrors: { email: 'Enter a valid email address.' }, values };
    case 'email_taken':
      return { fieldErrors: { email: 'An account already uses this email.' }, values };
  }
}

export async function updateAccountAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const actorId = await actor();
  const accountId = str(fd, 'accountId');
  const values = { name: str(fd, 'name'), email: str(fd, 'email') };
  const r = await updateAccount(db(), actorId, accountId, values);
  if (r.ok) {
    revalidatePath(`/admin/accounts/${accountId}`);
    return { notice: 'Changes saved and recorded in the audit log.' };
  }
  switch (r.reason) {
    case 'invalid_name':
      return { fieldErrors: { name: 'Enter a name.' }, values };
    case 'invalid_email':
      return { fieldErrors: { email: 'Enter a valid email address.' }, values };
    case 'email_taken':
      return { fieldErrors: { email: 'An account already uses this email.' }, values };
    case 'not_found':
      redirect('/admin/accounts');
    default:
      return NOT_ALLOWED;
  }
}

export async function setAccountActiveAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const actorId = await actor();
  const accountId = str(fd, 'accountId');
  const active = str(fd, 'active') === 'yes';
  const r = await setAccountActive(db(), actorId, accountId, { active, reason: str(fd, 'reason') });
  if (r.ok) {
    revalidatePath(`/admin/accounts/${accountId}`);
    revalidatePath('/admin/accounts');
    return { notice: active ? 'Account reactivated.' : 'Account deactivated. They were signed out everywhere.' };
  }
  if (r.reason === 'reason_required') return { fieldErrors: { reason: 'Write the reason (required).' } };
  if (r.reason === 'not_found') redirect('/admin/accounts');
  return NOT_ALLOWED;
}

// ------------------------------------------------------------------ Teacher approvals (M-29)

export async function decideTeacherAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const actorId = await actor();
  const decision = str(fd, 'decision') as TeacherDecision;
  if (!['approve', 'reject', 'changes'].includes(decision)) return { error: 'Choose a decision.' };
  const r = await decideTeacher(db(), actorId, str(fd, 'teacherId'), {
    decision,
    note: str(fd, 'note'),
    baseUrl: await siteBaseUrl(),
  });
  if (r.ok) {
    revalidatePath('/admin');
    redirect(`/admin/approvals?done=${decision}`);
  }
  if (r.reason === 'note_required') return { fieldErrors: { note: 'Write a short decision note (required).' } };
  if (r.reason === 'not_found') return { error: 'This teacher has already been decided or is no longer waiting.' };
  if (r.reason === 'not_ready') {
    return { error: 'This teacher has not sent their profile yet, so it cannot be approved or sent back for changes.' };
  }
  return NOT_ALLOWED;
}

/** OC-73: accept or decline an approved teacher's subject/grade change. */
export async function decideProfileChangeAction(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const actorId = await actor();
  const decision = str(fd, 'decision');
  if (decision !== 'approve' && decision !== 'decline') return { error: 'Choose a decision.' };
  const r = await decideProfileChange(db(), actorId, str(fd, 'teacherId'), {
    decision,
    note: str(fd, 'note'),
    baseUrl: await siteBaseUrl(),
  });
  if (r.ok) {
    revalidatePath('/admin');
    redirect(`/admin/approvals?done=change_${decision}`);
  }
  if (r.reason === 'note_required') return { fieldErrors: { note: 'Write a short decision note (required).' } };
  if (r.reason === 'not_found') return { error: 'This change has already been decided or was withdrawn.' };
  return NOT_ALLOWED;
}
