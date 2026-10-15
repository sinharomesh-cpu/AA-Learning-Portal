import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { findPersona, type Persona } from '@/fixtures/personas';
import type { SubjectId } from '@/fixtures/subjects';
import { isRole } from '@/lib/roles';
import { type ActiveSession, loadSession, SESSION_COOKIE } from './auth/sessions';
import { db } from './db/client';
import { isDemoMode } from './demo';
import { realAuthEnabled } from './realAuth';

/**
 * Who is signed in. Demo mode (OC-27/OC-34): a cookie holding a synthetic persona id.
 * Otherwise, with real accounts on (Phase 2): the server-side session from `aa_session`.
 * The checks in `authz.ts` are the same for both.
 */
export const DEMO_SESSION_COOKIE = 'aa_demo_session';
export const DEMO_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** The real server-side session for this request, with its cookie token (Phase 2). */
export const getRealSession = cache(async (): Promise<{ token: string; session: ActiveSession } | null> => {
  if (isDemoMode() || !realAuthEnabled()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await loadSession(db(), token);
  return session ? { token, session } : null;
});

export const getViewer = cache(async (): Promise<Persona | null> => {
  const store = await cookies();
  if (isDemoMode()) return findPersona(store.get(DEMO_SESSION_COOKIE)?.value) ?? null;
  if (!realAuthEnabled()) return null;
  const session = (await getRealSession())?.session;
  if (!session || !isRole(session.role)) return null;
  const viewer: Persona = {
    id: session.accountId,
    role: session.role,
    displayName: session.displayName,
    initial: [...session.displayName][0]?.toUpperCase() ?? '?',
    timeZone: session.timeZone,
    status: session.status,
    mfaPending: session.role === 'superadmin' && !session.mfaVerifiedAt,
  };
  if (session.role === 'parent') {
    const rows = await db()<Array<{ student_id: string }>>`
      SELECT student_id FROM guardian_links WHERE parent_id = ${session.accountId} AND status = 'active'`;
    viewer.childIds = rows.map((r) => r.student_id);
  }
  if (session.role === 'student') {
    const [profile] = await db()<Array<{ grade: number; subjects: SubjectId[] }>>`
      SELECT grade, subjects FROM student_profiles WHERE account_id = ${session.accountId}`;
    viewer.grade = profile?.grade;
    viewer.subjects = profile?.subjects ?? [];
  }
  return viewer;
});
