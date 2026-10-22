import 'server-only';
import { after } from 'next/server';
import { db } from '@/server/db/client';
import { readEmailConfig } from './config';
import { dispatchPendingEmails } from './dispatch';

/**
 * Asks for queued emails to be sent once the current request has finished (and so after the
 * transaction that queued them has committed). Does nothing when sending is off or outside a
 * request (tests, scripts). Several calls in one request are harmless: the dispatcher takes one
 * email at a time under a lock, and each email is sent at most once.
 */
export function sendQueuedEmailsAfterResponse(): void {
  const config = readEmailConfig();
  if (config.mode === 'off') return;
  try {
    after(async () => {
      try {
        await dispatchPendingEmails(db(), config);
      } catch {
        // Emails stay queued and go out with the next request; nothing about them is logged.
      }
    });
  } catch {
    // Not inside a request: the next request sends them.
  }
}
