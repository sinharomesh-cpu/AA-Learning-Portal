import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BackToHome } from '@/components/BackToHome';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { Wordmark } from '@/components/Wordmark';
import { ROLE_HOME } from '@/lib/roles';
import { isDemoMode } from '@/server/demo';
import { realAuthEnabled } from '@/server/realAuth';
import { getViewer } from '@/server/session';
import { CreateAccountForm } from './CreateAccountForm';

export const metadata: Metadata = { title: 'Create an account' };

/** Board 62 (approved, OC-55). In demo mode or without a database: accounts are not open. */
export default async function CreateAccountPage() {
  const viewer = await getViewer();
  if (viewer) redirect(ROLE_HOME[viewer.role]);
  if (!realAuthEnabled()) {
    return (
      <>
        <BackToHome />
        <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-12">
          <Wordmark size={36} href="/" />
          <Card className="flex flex-col gap-4">
            <h1 className="text-headline-md">Create an account</h1>
            <p className="text-body-lg text-on-surface-variant">
              Parent and teacher accounts are not open yet. They are being built now and will open before launch.
            </p>
            {isDemoMode() ? (
              <p className="text-body-md">
                This preview uses sample accounts instead. You can try them from the sign-in page.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/sign-in">Go to sign in</LinkButton>
              <LinkButton href="/" variant="secondary">
                Back to home
              </LinkButton>
            </div>
          </Card>
        </main>
      </>
    );
  }
  return (
    <>
      <BackToHome />
      <main className="mx-auto grid max-w-[1120px] items-start gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2 lg:gap-10">
        <Card className="flex flex-col gap-5 p-6 lg:p-8">
          <Wordmark size={32} href="/" />
          <h1 className="text-headline-lg-mobile">Create an account</h1>
          <CreateAccountForm />
        </Card>
        <section className="flex flex-col gap-4" aria-labelledby="next-steps">
          <h2 id="next-steps" className="text-headline-sm">
            What happens next
          </h2>
          <Card className="flex flex-col gap-2">
            <h3 className="text-label-lg font-bold">1. Check your email</h3>
            <p className="text-body-md text-on-surface-variant">
              We send you a link to confirm your address. It works once and expires in 24 hours.
            </p>
          </Card>
          <Card className="flex flex-col gap-2">
            <h3 className="text-label-lg font-bold">2. Parents: add your children</h3>
            <p className="text-body-md text-on-surface-variant">
              You choose each child&apos;s username and password. Children never need an email or phone.
            </p>
          </Card>
          <Card className="flex flex-col gap-2">
            <h3 className="text-label-lg font-bold">2. Teachers: tell us about your teaching</h3>
            <p className="text-body-md text-on-surface-variant">
              The AA Pro team checks every teacher before they can see any child.
            </p>
          </Card>
        </section>
      </main>
    </>
  );
}
