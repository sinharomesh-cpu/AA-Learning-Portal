import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';
import { isDemoMode } from '@/server/demo';

export const metadata: Metadata = { title: 'Propose a meeting' };

/** The demo's wording, unchanged. */
const DEMO_PROPOSE_TEXT =
  'Proposing meetings needs scheduling and the Zoom connection (later phases). Whether a parent must confirm first is still being decided.';

/**
 * F2 (owner, 25 Oct 2026, 18:38 IST), real accounts during private Friends & Family testing: an
 * honest "not available yet" page that asks for feedback. Nothing on it proposes, sends or books
 * anything; teacher proposals (OC-45) are not built.
 */
const REAL_PROPOSE_TEXT =
  'Proposing a meeting isn’t available in AA Pro yet, and nothing is sent or booked from this page. For now, parents request lessons from your usual times, and you accept or decline them in My schedule. We’d like your feedback: would you use this, and how would you want it to work? Please tell the AA Pro team through your Friends & Family feedback channel.';

export default async function ProposeMeetingPage() {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return isDemoMode() ? (
    <NotReadyYet
      title="Propose a meeting"
      body={DEMO_PROPOSE_TEXT}
      homeHref="/teacher"
      homeLabel="Go to my dashboard"
    />
  ) : (
    <NotReadyYet
      title="Propose a meeting"
      body={REAL_PROPOSE_TEXT}
      homeHref="/teacher/schedule"
      homeLabel="Go to My schedule"
    />
  );
}
