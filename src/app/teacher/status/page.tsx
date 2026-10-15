import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getViewer } from '@/server/session';

export const metadata: Metadata = { title: 'Account status' };

/**
 * M-21 "We're reviewing your profile" (board 33). The only page a teacher waiting for approval
 * can open (OC-38): no calendar, students or books until a Super Admin approves them.
 */
export default async function TeacherStatusPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  if (viewer.role !== 'teacher') redirect('/');
  if (viewer.status !== 'pending_approval') redirect('/teacher');
  const [profile] = isDemoMode()
    ? []
    : await db()<Array<{ approval_status: string; decision_note: string | null }>>`
        SELECT approval_status, decision_note FROM teacher_profiles WHERE account_id = ${viewer.id}`;
  if (profile?.approval_status === 'rejected') {
    return (
      <main className="flex max-w-[720px] flex-col gap-6">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Your profile was not approved</h1>
        <Card className="flex flex-col gap-4">
          <FormMessage tone="warning">
            The AA Pro team could not approve your teacher account, so it cannot be used to teach on AA Pro.
          </FormMessage>
          <p className="text-body-md text-on-surface-variant">
            If you think this is a mistake, contact AA Pro support.
          </p>
        </Card>
      </main>
    );
  }
  if (profile?.approval_status === 'changes_requested') {
    return (
      <main className="flex max-w-[720px] flex-col gap-6">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Please update your profile</h1>
        <Card className="flex flex-col gap-4">
          <FormMessage tone="info">The AA Pro team asked for some changes before approving you.</FormMessage>
          {profile.decision_note ? (
            <blockquote className="m-0 rounded-[16px] bg-surface-container-low px-4 py-3 text-body-md">
              {profile.decision_note}
            </blockquote>
          ) : null}
          <p className="text-body-md text-on-surface-variant">
            The profile form opens in the next update; we will email you when it is ready.
          </p>
        </Card>
      </main>
    );
  }
  return (
    <main className="flex max-w-[720px] flex-col gap-6">
      <h1 className="text-headline-lg-mobile md:text-headline-lg">We&apos;re reviewing your profile</h1>
      <Card className="flex flex-col gap-4">
        <FormMessage tone="info">
          Thanks for confirming your email. The AA Pro team checks every teacher before they can see any child.
        </FormMessage>
        <h2 className="text-headline-sm">Next: tell us about your teaching</h2>
        <p className="text-body-md text-on-surface-variant">
          Your subjects, the grades you teach and a short bio. This form opens in the next update; we will email you
          when your account is approved.
        </p>
      </Card>
      <p className="text-body-sm text-on-surface-variant">Questions? Contact AA Pro support.</p>
    </main>
  );
}
