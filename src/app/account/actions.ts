'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ROLE_HOME, isRole } from '@/lib/roles';
import {
  changePassword,
  confirmEmail,
  requestPasswordReset,
  resendConfirmation,
  setPasswordWithToken,
  signInWithEmail,
  signUp,
} from '@/server/auth/accounts';
import { passwordProblemMessage } from '@/server/auth/password';
import { createSession, loadSession, revokeAllSessions, revokeSession, SESSION_COOKIE } from '@/server/auth/sessions';
import { signInChild } from '@/server/children';
import { db } from '@/server/db/client';
import { realAuthEnabled } from '@/server/realAuth';
import { takeRememberedConnect } from '@/server/teacherEnquiries';
import { clientIp, siteBaseUrl } from '@/server/requestInfo';

/**
 * Real account actions (WP2-3; boards 62, M-01, M-03, M-34). Every input is validated here on
 * the server; the browser's own checks are only a convenience.
 */
export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  notice?: string;
  needsConfirm?: boolean;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

function requireRealAuth(): void {
  if (!realAuthEnabled()) redirect('/sign-in');
}

async function startSession(account: { id: string; role: string; credential_version: number }) {
  const { token, absoluteExpiresAt } = await createSession(db(), account);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: absoluteExpiresAt,
  });
}

async function endSessionCookie(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(db(), token);
  store.delete(SESSION_COOKIE);
}

// ------------------------------------------------------------------ sign in (M-01)

const SignInSchema = z.object({ email: z.string().trim().min(1).max(254), password: z.string().min(1).max(256) });

export async function signInWithPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  requireRealAuth();
  const parsed = SignInSchema.safeParse({ email: str(fd, 'email'), password: str(fd, 'password') });
  // "I am signing in as…" (OC-59) only guides the person; the account's own role decides the portal.
  const values = { email: str(fd, 'email'), signInAs: str(fd, 'signInAs') === 'teacher' ? 'teacher' : 'parent' };
  if (!parsed.success) return { error: 'Enter your email and password.', values };
  const result = await signInWithEmail(db(), { ...parsed.data, ip: await clientIp() });
  if (!result.ok) {
    switch (result.reason) {
      case 'locked':
        return { error: 'Too many sign-in attempts. Please wait 15 minutes, or reset your password.', values };
      case 'ip_limited':
        return { error: 'Too many attempts from this network. Please wait a few minutes and try again.', values };
      case 'not_confirmed':
        return { error: 'Please confirm your email first. We can send you a new link.', values, needsConfirm: true };
      case 'inactive':
        return { error: 'This account is not active. Please contact AA Pro support.', values };
      default:
        return { error: "That email and password don't match an account. Check them and try again.", values };
    }
  }
  await startSession(result.account);
  const role = result.account.role;
  // D11: back to the teacher the visitor chose. Only a listing address on AA Pro is accepted.
  const connect = str(fd, 'connect');
  if (/^t-[a-z0-9]{10}$/.test(connect)) redirect(`/teachers/${connect}/connect`);
  if (role === 'parent') {
    const remembered = await takeRememberedConnect(db(), result.account.id);
    if (remembered) redirect(`/teachers/${remembered}/connect`);
  }
  redirect(isRole(role) ? ROLE_HOME[role] : '/');
}

export async function resendConfirmationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  requireRealAuth();
  const result = await resendConfirmation(db(), {
    email: str(fd, 'email'),
    ip: await clientIp(),
    baseUrl: await siteBaseUrl(),
  });
  if (!result.ok) return { error: 'Too many requests from this network. Please try again later.' };
  return { notice: 'If that email is waiting for confirmation, we have sent a new link.' };
}

// ------------------------------------------------------------------ child sign in (M-02)

const ChildSignInSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

/** Child sign-in (M-02, G1-08 §3.2). The messages never reveal whether a username exists. */
export async function childSignInAction(_prev: FormState, fd: FormData): Promise<FormState> {
  requireRealAuth();
  const values = { username: str(fd, 'username') };
  const parsed = ChildSignInSchema.safeParse({ username: str(fd, 'username'), password: str(fd, 'password') });
  if (!parsed.success) return { error: 'Type your username and your password.', values };
  const result = await signInChild(db(), { ...parsed.data, ip: await clientIp() });
  if (!result.ok) {
    switch (result.reason) {
      case 'locked':
        return { error: "Let's take a break. You can try again in 15 minutes, or ask your parent for help.", values };
      case 'ip_limited':
        return { error: 'Lots of tries from this place. Please wait a few minutes and try again.', values };
      case 'paused':
        return { error: 'Your account is paused. Please ask your parent.', values };
      default:
        return { error: "Oops, that didn't match. Check your username and password and try again.", values };
    }
  }
  await startSession(result.account);
  redirect(ROLE_HOME.student);
}

// ------------------------------------------------------------------ create an account (board 62)

const SignUpSchema = z.object({
  role: z.enum(['parent', 'teacher']),
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use no more than 80 characters.'),
  email: z.string().trim().min(3, 'Enter your email.').max(254),
  password: z.string().max(256),
  timeZone: z.string().min(1).max(64),
  consent: z.literal('yes', { error: 'Please agree to the privacy notice and terms.' }),
});

export async function signUpAction(_prev: FormState, fd: FormData): Promise<FormState> {
  requireRealAuth();
  const raw = {
    role: str(fd, 'role'),
    name: str(fd, 'name'),
    email: str(fd, 'email'),
    password: str(fd, 'password'),
    timeZone: str(fd, 'timeZone') || 'Asia/Kolkata',
    consent: str(fd, 'consent'),
  };
  const values = { role: raw.role, name: raw.name, email: raw.email, timeZone: raw.timeZone };
  // D11: arriving from "Connect with teacher" creates a parent account only.
  const connect = /^t-[a-z0-9]{10}$/.test(str(fd, 'connect')) ? str(fd, 'connect') : undefined;
  if (connect && raw.role !== 'parent')
    return { fieldErrors: { role: 'Only parent accounts can connect with teachers.' }, values };
  const parsed = SignUpSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= key === 'role' ? 'Choose parent or teacher.' : issue.message;
    }
    return { fieldErrors, values };
  }
  if (!isValidTimeZone(parsed.data.timeZone)) return { fieldErrors: { timeZone: 'Choose a time zone.' }, values };
  const result = await signUp(db(), {
    role: parsed.data.role,
    name: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
    timeZone: parsed.data.timeZone,
    acceptedPrivacy: true,
    ip: await clientIp(),
    baseUrl: await siteBaseUrl(),
    connectPublicId: connect,
  });
  if (!result.ok) {
    switch (result.reason) {
      case 'password':
        return { fieldErrors: { password: passwordProblemMessage(result.problem, 'adult') }, values };
      case 'invalid_email':
        return { fieldErrors: { email: 'Enter a valid email address.' }, values };
      case 'invalid_name':
        return { fieldErrors: { name: 'Enter your name.' }, values };
      case 'consent_required':
        return { fieldErrors: { consent: 'Please agree to the privacy notice and terms.' }, values };
      case 'rate_limited':
        return { error: 'Too many requests from this network. Please try again later.', values };
    }
  }
  redirect(`/create-account/check-email?to=${encodeURIComponent(result.maskedEmail)}${connect ? '&connect=1' : ''}`);
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Confirmation happens on a button press, not on opening the link, so email scanners can't use it up. */
export async function confirmEmailAction(_prev: FormState, fd: FormData): Promise<FormState> {
  requireRealAuth();
  const result = await confirmEmail(db(), str(fd, 'token'));
  if (!result.ok) {
    return {
      error:
        result.reason === 'expired'
          ? 'This link has expired. Sign in and ask for a new one.'
          : 'This link was already used or is not valid. Try signing in.',
    };
  }
  redirect(`/sign-in?confirmed=${result.role}`);
}

// ------------------------------------------------------------------ password reset (M-03)

export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  requireRealAuth();
  const result = await requestPasswordReset(db(), {
    email: str(fd, 'email'),
    ip: await clientIp(),
    baseUrl: await siteBaseUrl(),
  });
  if (!result.ok) return { error: 'Too many requests from this network. Please try again later.' };
  redirect('/forgot-password?sent=1');
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  requireRealAuth();
  const password = str(fd, 'password');
  if (password !== str(fd, 'confirm')) return { fieldErrors: { confirm: "The two passwords don't match." } };
  const purpose = str(fd, 'purpose') === 'set_password' ? 'set_password' : 'password_reset';
  const result = await setPasswordWithToken(db(), { token: str(fd, 'token'), purpose, password });
  if (!result.ok) {
    if (result.reason === 'password')
      return { fieldErrors: { password: passwordProblemMessage(result.problem, 'adult') } };
    return {
      error: result.reason === 'expired' ? 'This link has expired.' : 'This link was already used or is not valid.',
    };
  }
  redirect('/sign-in?reset=1');
}

// ------------------------------------------------------------------ account settings (M-34)

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  requireRealAuth();
  const store = await cookies();
  const session = await loadSession(db(), store.get(SESSION_COOKIE)?.value);
  if (!session) redirect('/sign-in');
  const next = str(fd, 'password');
  if (next !== str(fd, 'confirm')) return { fieldErrors: { confirm: "The two passwords don't match." } };
  const result = await changePassword(db(), {
    accountId: session.accountId,
    currentPassword: str(fd, 'current'),
    newPassword: next,
  });
  if (!result.ok) {
    if (result.reason === 'wrong_current') return { fieldErrors: { current: 'That is not your current password.' } };
    return { fieldErrors: { password: passwordProblemMessage(result.problem, 'adult') } };
  }
  store.delete(SESSION_COOKIE);
  redirect('/sign-in?changed=1');
}

export async function signOutEverywhereAction(): Promise<void> {
  requireRealAuth();
  const store = await cookies();
  const session = await loadSession(db(), store.get(SESSION_COOKIE)?.value);
  if (session) await revokeAllSessions(db(), session.accountId);
  store.delete(SESSION_COOKIE);
  redirect('/sign-in?signedOut=all');
}

/** Ends this browser's real session (used by the shared sign-out button). */
export async function endRealSession(): Promise<void> {
  if (realAuthEnabled()) await endSessionCookie();
}
