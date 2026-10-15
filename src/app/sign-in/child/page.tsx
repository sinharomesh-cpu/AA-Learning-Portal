import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BackToHome } from '@/components/BackToHome';
import { Card } from '@/components/Card';
import { Wordmark } from '@/components/Wordmark';
import { personasWithRole } from '@/fixtures/personas';
import { ROLE_HOME } from '@/lib/roles';
import { isDemoMode } from '@/server/demo';
import { realAuthEnabled } from '@/server/realAuth';
import { getViewer } from '@/server/session';
import { signInChild } from '../actions';
import { DemoNotice } from '../DemoNotice';
import { DemoSignInForm } from '../DemoSignInForm';
import { ChildSignInForm } from './ChildSignInForm';

export const metadata: Metadata = { title: 'Child sign in' };

/** M-02 child sign-in layout (boards 12/13), with the Phase 1 demo form (OC-27). */
export default async function ChildSignInPage() {
  const viewer = await getViewer();
  if (viewer) redirect(ROLE_HOME[viewer.role]);
  const demo = isDemoMode();
  const choices = personasWithRole(['student']).map((p) => ({
    id: p.id,
    label: p.displayName,
    detail: p.grade ? `Grade ${p.grade}` : '',
  }));
  return (
    <div className="min-h-dvh bg-surface-container-low">
      <BackToHome />
      <main className="mx-auto grid max-w-[1040px] items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:py-12">
        <div className="flex flex-col gap-4">
          <Wordmark size={36} href="/" />
          <h1 className="text-headline-xl-mobile lg:text-headline-xl">Hello! Ready to learn?</h1>
          <p className="text-body-lg text-on-surface-variant">
            {demo ? 'Pick your name to start.' : 'Type the username and password your parent gave you.'}
          </p>
        </div>
        <Card className="flex flex-col gap-5 p-6 lg:p-9">
          {demo ? (
            <>
              <DemoNotice />
              <DemoSignInForm
                action={signInChild}
                choices={choices}
                legend="Who are you?"
                submitLabel="Let's go"
                variant="child"
              />
            </>
          ) : realAuthEnabled() ? (
            <ChildSignInForm />
          ) : (
            <p className="text-body-lg">Sign-in is not available yet.</p>
          )}
          <p className="text-center text-body-md text-on-surface-variant">
            Forgot your password? Ask your parent to help you.
          </p>
          <Link href="/sign-in" className="text-center text-[15px] font-bold">
            Grown-up sign in
          </Link>
        </Card>
      </main>
    </div>
  );
}
