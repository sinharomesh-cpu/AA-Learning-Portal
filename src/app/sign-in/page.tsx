import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BackToHome } from '@/components/BackToHome';
import { Card } from '@/components/Card';
import { brand } from '@/config/brand';
import { personasWithRole } from '@/fixtures/personas';
import { ROLE_HOME, ROLE_LABEL } from '@/lib/roles';
import { FormMessage } from '@/components/forms/FormMessage';
import { isDemoMode } from '@/server/demo';
import { realAuthEnabled } from '@/server/realAuth';
import { getViewer } from '@/server/session';
import { signInAdult } from './actions';
import { DemoSignInForm } from './DemoSignInForm';
import { DemoNotice } from './DemoNotice';
import { RealSignInForm } from './RealSignInForm';

export const metadata: Metadata = { title: 'Sign in' };

/** M-01 adult sign-in layout (board 11/45), with the Phase 1 demo form (OC-27). */
const NOTICES: Record<string, { tone: 'success' | 'info'; text: string }> = {
  parent: { tone: 'success', text: 'Your email is confirmed. Sign in to add your first child.' },
  teacher: { tone: 'success', text: 'Your email is confirmed. Sign in to tell us about your teaching.' },
  reset: { tone: 'success', text: 'Your password is changed. Sign in with your new password.' },
  changed: { tone: 'success', text: 'Your password is changed. You were signed out everywhere; sign in again.' },
  all: { tone: 'info', text: 'You were signed out on all devices.' },
  mfa: {
    tone: 'info',
    text: 'You were signed out because a security code was entered wrongly 5 times. Please sign in again.',
  },
  reauth: {
    tone: 'info',
    text: 'You were signed out because your password was entered wrongly 5 times. Please sign in again.',
  },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const noticeKey = [
    params.confirmed,
    params.reset ? 'reset' : undefined,
    params.changed ? 'changed' : undefined,
    params.signedOut,
  ].find((v): v is string => typeof v === 'string' && v in NOTICES);
  const notice = noticeKey ? NOTICES[noticeKey] : undefined;
  const real = realAuthEnabled();
  const viewer = await getViewer();
  if (viewer) redirect(ROLE_HOME[viewer.role]);
  const demo = isDemoMode();
  const choices = personasWithRole(['parent', 'teacher', 'superadmin']).map((p) => ({
    id: p.id,
    label: p.displayName,
    detail: `${ROLE_LABEL[p.role]} · ${p.email ?? ''}`,
  }));
  return (
    <>
      <BackToHome />
      <main className="mx-auto grid max-w-[1120px] items-stretch gap-6 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:py-12">
        <Card tone="primary" className="flex flex-col justify-between gap-8 p-8 lg:p-10">
          <Link
            href="/"
            aria-label={`${brand.productName} home`}
            className="self-start font-headline text-[40px] font-extrabold tracking-[-0.02em] text-on-primary no-underline hover:text-on-primary"
          >
            {brand.productName}
          </Link>
          <div className="flex flex-col gap-3">
            <h1 className="text-headline-lg text-on-primary">Welcome back</h1>
            <p className="text-body-lg text-on-primary-panel">
              Sign in to manage your family&apos;s learning, your teaching calendar or the platform.
            </p>
          </div>
          <p className="text-body-sm text-on-primary-panel">Children sign in from the child sign-in page.</p>
        </Card>
        <Card className="flex flex-col gap-5 p-8 lg:p-10">
          <h2 className="text-headline-lg-mobile">Sign in</h2>
          {demo ? (
            <>
              <DemoNotice />
              <DemoSignInForm
                action={signInAdult}
                choices={choices}
                legend="Choose a demo account"
                submitLabel="Sign in"
                variant="adult"
              />
            </>
          ) : real ? (
            <>
              {notice ? <FormMessage tone={notice.tone}>{notice.text}</FormMessage> : null}
              <RealSignInForm />
              <p className="text-center text-[15px]">
                New to AA Pro?{' '}
                <Link href="/create-account" className="font-bold underline">
                  Create an account
                </Link>
              </p>
            </>
          ) : (
            <p className="text-body-md text-on-surface-variant">Sign-in is not available yet.</p>
          )}
          <Link href="/sign-in/child" className="text-center text-[15px] font-bold">
            I am a student — go to child sign in
          </Link>
        </Card>
      </main>
    </>
  );
}
