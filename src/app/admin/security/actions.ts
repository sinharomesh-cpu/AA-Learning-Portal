'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/server/auth/sessions';
import {
  confirmEnrolment,
  mfaRecent,
  replaceRecoveryCodes,
  resetAuthenticator,
  redeemRecoveryCode,
  verifyMfaCode,
} from '@/server/auth/mfa';
import { requestOwnerSetup } from '@/server/auth/owner';
import { db } from '@/server/db/client';
import { realAuthEnabled } from '@/server/realAuth';
import { clientIp, siteBaseUrl } from '@/server/requestInfo';
import { getRealSession } from '@/server/session';

/** Super Admin setup, security-code step and security settings (WP2-5a; M-26, board 66). */
export interface SecurityState {
  error?: string;
  notice?: string;
  recoveryCodes?: string[];
  remaining?: number;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

async function adminSession() {
  const real = await getRealSession();
  if (!real || (real.session.role !== 'superadmin' && real.session.role !== 'admin')) redirect('/sign-in');
  return real;
}

async function signedOut(): Promise<never> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/sign-in?signedOut=mfa');
}

const WRONG_CODE = "That code didn't work. Check the 6-digit code in your app and try again.";

export async function confirmEnrolmentAction(_prev: SecurityState, fd: FormData): Promise<SecurityState> {
  const { session, token } = await adminSession();
  const r = await confirmEnrolment(db(), { accountId: session.accountId, sessionToken: token, code: str(fd, 'code') });
  if (r.ok) return { recoveryCodes: r.recoveryCodes };
  if (r.reason === 'signed_out') return signedOut();
  return { error: WRONG_CODE };
}

export async function verifyCodeAction(_prev: SecurityState, fd: FormData): Promise<SecurityState> {
  const { session, token } = await adminSession();
  const r = await verifyMfaCode(db(), { accountId: session.accountId, sessionToken: token, code: str(fd, 'code') });
  if (r.ok) redirect('/admin');
  if (r.reason === 'signed_out') return signedOut();
  return { error: WRONG_CODE };
}

export async function recoveryCodeAction(_prev: SecurityState, fd: FormData): Promise<SecurityState> {
  const { session, token } = await adminSession();
  const r = await redeemRecoveryCode(db(), {
    accountId: session.accountId,
    sessionToken: token,
    code: str(fd, 'code'),
  });
  if (r.ok) redirect(`/admin/security?recovered=${r.remaining}`);
  if (r.reason === 'signed_out') return signedOut();
  return { error: "That recovery code didn't work. Each code works only once." };
}

export async function newRecoveryCodesAction(): Promise<SecurityState> {
  const { session } = await adminSession();
  if (!mfaRecent(session.mfaVerifiedAt)) {
    return { error: 'For your security, sign out and sign in again with your security code first.' };
  }
  const codes = await replaceRecoveryCodes(db(), session.accountId);
  revalidatePath('/admin/security');
  return { recoveryCodes: codes };
}

export async function resetAuthenticatorAction(): Promise<SecurityState> {
  const { session } = await adminSession();
  if (!mfaRecent(session.mfaVerifiedAt)) {
    return { error: 'For your security, sign out and sign in again with your security code first.' };
  }
  await resetAuthenticator(db(), session.accountId);
  redirect('/security-check');
}

export async function ownerSetupAction(_prev: SecurityState, fd: FormData): Promise<SecurityState> {
  if (!realAuthEnabled()) redirect('/');
  const r = await requestOwnerSetup(db(), {
    email: str(fd, 'email'),
    name: str(fd, 'name'),
    ip: await clientIp(),
    baseUrl: await siteBaseUrl(),
  });
  if (!r.ok) {
    return {
      error:
        r.reason === 'rate_limited'
          ? 'Too many requests from this network. Please try again later.'
          : 'Setup is already complete. Sign in instead.',
    };
  }
  return {
    notice:
      "If that is the owner's email address, we've sent a link to set your password. It works once and expires in 72 hours.",
  };
}
