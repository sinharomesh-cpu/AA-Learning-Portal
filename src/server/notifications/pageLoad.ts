import 'server-only';
import { after } from 'next/server';
import { db } from '../db/client';
import { siteBaseUrl } from '../requestInfo';
import { getRealSession } from '../session';
import { onSignedInPageLoad } from './sweep';

/**
 * CR-16 §7.2 (Q-6, Q-8, D-9): a signed-in parent, teacher or student page load triggers the shared
 * sweep and retention clean-up, each only when its stored throttle allows. It runs after the
 * response is sent (`after`), so pages never wait for it, and never throws. Demo mode and signed-out
 * requests do nothing; admin pages do not call it (D-6).
 */
export async function triggerSignedInMaintenance(): Promise<void> {
  try {
    if (!(await getRealSession())) return;
    const baseUrl = await siteBaseUrl();
    after(() => onSignedInPageLoad(db(), baseUrl));
  } catch (error) {
    console.error('CR-16 maintenance was not scheduled.', (error as Error).message);
  }
}
