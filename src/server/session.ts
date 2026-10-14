import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { findPersona, type Persona } from '@/fixtures/personas';
import { isDemoMode } from './demo';

/**
 * Phase 1 session source (OC-27): a development-only cookie holding a synthetic persona ID.
 * Phase 2 replaces this module with real authentication; the checks in `authz.ts` stay.
 */
export const DEMO_SESSION_COOKIE = 'aa_demo_session';
export const DEMO_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export const getViewer = cache(async (): Promise<Persona | null> => {
  if (!isDemoMode()) return null;
  const store = await cookies();
  return findPersona(store.get(DEMO_SESSION_COOKIE)?.value) ?? null;
});
