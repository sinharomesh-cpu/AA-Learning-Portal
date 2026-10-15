import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
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
