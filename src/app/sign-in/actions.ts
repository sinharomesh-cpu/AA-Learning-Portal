'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { findPersona } from '@/fixtures/personas';
import { ROLE_HOME } from '@/lib/roles';
import { endRealSession } from '@/app/account/actions';
import { isDemoMode } from '@/server/demo';
import { DEMO_SESSION_COOKIE, DEMO_SESSION_MAX_AGE_SECONDS } from '@/server/session';

export interface SignInState {
  error?: string;
}

async function startSession(personaId: FormDataEntryValue | null, allowed: 'adult' | 'child'): Promise<SignInState> {
  if (!isDemoMode()) return { error: 'Sign-in is not available yet.' };
  const persona = findPersona(typeof personaId === 'string' ? personaId : null);
  const isChild = persona?.role === 'student';
  // The adult form accepts only adult personas and the child form only students.
  if (!persona || (allowed === 'child') !== isChild) {
    return { error: allowed === 'child' ? 'Please pick your name.' : 'Please choose a demo account.' };
  }
  const store = await cookies();
  store.set(DEMO_SESSION_COOKIE, persona.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEMO_SESSION_MAX_AGE_SECONDS,
  });
  redirect(ROLE_HOME[persona.role]);
}

export async function signInAdult(_prev: SignInState, formData: FormData): Promise<SignInState> {
  return startSession(formData.get('persona'), 'adult');
}

export async function signInChild(_prev: SignInState, formData: FormData): Promise<SignInState> {
  return startSession(formData.get('persona'), 'child');
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_SESSION_COOKIE);
  await endRealSession();
  redirect('/sign-in');
}
