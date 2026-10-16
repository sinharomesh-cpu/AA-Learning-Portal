import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { getViewer } from '@/server/session';

export const metadata: Metadata = { title: 'Account status' };
export const dynamic = 'force-dynamic';

/**
 * M-21 teacher account status (board 33). While waiting for approval a teacher can open only this
 * page and their profile (OC-38); a rejected teacher only this page (OC-72).
 */
export default async function TeacherStatusPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect('/sign-in');
  if (viewer.role !== 'teacher') redirect('/');
  if (viewer.status !== 'pending_approval') redirect('/teacher');
  const [profile] = isDemoMode()
    ? []
    : await db()<Array<{ approval_status: string; decision_note: string | null }>>`
        SELECT approval_status, decision_note FROM teacher_profiles WHERE account_id = ${viewer.id}`;
  const { sent } = await searchParams;
  if (profile?.approval_status === 'rejected') {
    return (
      <div className="flex max-w-[720px] flex-col gap-6">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Your profile was not approved</h1>
        <Card className="flex flex-col gap-4">
          <StatusChip kind="neutral" className="self-start">
            Not approved
          </StatusChip>
          <FormMessage tone="warning">
            The AA Pro team could not approve your teacher account, so it cannot be used to teach on AA Pro.
          </FormMessage>
          <p className="text-body-md text-on-surface-variant">
            If you think this is a mistake, contact AA Pro support.
          </p>
        </Card>
      </div>
    );
  }
  if (profile?.approval_status === 'changes_requested') {
    return (
      <div className="flex max-w-[720px] flex-col gap-6">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">Please update your profile</h1>
        <Card className="flex flex-col gap-4">
          <StatusChip kind="warning" className="self-start">
            Needs changes
          </StatusChip>
          <p className="text-body-md">The AA Pro team asked for some changes before approving you.</p>
          {profile.decision_note ? (
            <div className="rounded-[16px] bg-surface-container-low px-4 py-3 text-[15px] leading-[22px]">
              <strong>Note from AA Pro:</strong> <span className="whitespace-pre-line">{profile.decision_note}</span>
            </div>
          ) : null}
          <LinkButton href="/teacher/profile" className="self-start">
            Edit and resend
          </LinkButton>
        </Card>
      </div>
    );
  }
  if (profile?.approval_status === 'submitted') {
    return (
      <div className="flex max-w-[720px] flex-col gap-6">
        <h1 className="text-headline-lg-mobile md:text-headline-lg">We&apos;re reviewing your profile</h1>
        {sent ? <FormMessage tone="success">Your profile was sent for approval.</FormMessage> : null}
        <Card className="flex flex-col gap-4">
          <StatusChip kind="warning" className="self-start">
            Under review
          </StatusChip>
          <p className="text-body-md text-on-surface-variant">
            You&apos;ll get an email when it&apos;s approved. Until then you can&apos;t publish times or see students.
          </p>
          <LinkButton href="/teacher/profile" variant="secondary" className="self-start">
            View my profile
          </LinkButton>
        </Card>
        <p className="text-body-sm text-on-surface-variant">Questions? Contact AA Pro support.</p>
      </div>
    );
  }
  // Draft: the profile has not been sent yet.
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <h1 className="text-headline-lg-mobile md:text-headline-lg">Welcome! Tell us about your teaching</h1>
      <Card className="flex flex-col gap-4">
        <StatusChip kind="neutral" className="self-start">
          Profile not sent yet
        </StatusChip>
        <FormMessage tone="info">
          Thanks for confirming your email. The AA Pro team checks every teacher before they can see any child.
        </FormMessage>
        <p className="text-body-md text-on-surface-variant">
          Add your subjects, the grades you teach and a short bio, then send your profile for approval. We will email
          you when your account is approved.
        </p>
        <LinkButton href="/teacher/profile" className="self-start">
          Set up my profile
        </LinkButton>
      </Card>
      <p className="text-body-sm text-on-surface-variant">Questions? Contact AA Pro support.</p>
    </div>
  );
}
