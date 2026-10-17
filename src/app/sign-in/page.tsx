import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/public/icons';
import { BackToHomeLink, BrandMark, PUBLIC_WRAP, PublicShell } from '@/components/public/PublicShell';
import { brand } from '@/config/brand';
import { personasWithRole } from '@/fixtures/personas';
import { cx } from '@/lib/cx';
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

const TONE = {
  cyan: 'bg-primary-fixed text-on-primary-fixed-variant',
  violet: 'bg-[var(--pub-violet-bg)] text-[var(--pub-violet)]',
  amber: 'bg-[var(--pub-amber-bg)] text-[var(--pub-amber)]',
} as const;

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
    <PublicShell>
      <main className={cx(PUBLIC_WRAP, 'flex flex-col gap-6 py-8 md:py-12')}>
        <BackToHomeLink />
        <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
          <section
            aria-labelledby="sign-in-title"
            className="pub-card flex flex-col gap-6 rounded-[40px] p-6 sm:p-10 lg:col-span-7"
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <BrandMark />
              <span className="rounded-full bg-[var(--pub-amber-bg)] px-2.5 py-0.5 text-label-sm text-[var(--pub-amber)]">
                Parents and teachers
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <h1
                id="sign-in-title"
                className="font-headline text-[34px] font-extrabold leading-[42px] tracking-[-0.02em] md:text-[44px] md:leading-[52px]"
              >
                Welcome back
              </h1>
              <p className="text-body-lg text-on-surface-variant">
                Sign in to manage your family&apos;s learning, your teaching calendar or the platform.
              </p>
            </div>
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
              </>
            ) : (
              <p className="text-body-md text-on-surface-variant">Sign-in is not available yet.</p>
            )}
            <div className="flex flex-col gap-3">
              {real && !demo ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-surface-container-low px-5 py-3.5">
                  <span className="text-body-md">New to {brand.productName}?</span>
                  <Link
                    href="/create-account"
                    className="inline-flex min-h-11 items-center rounded-full bg-primary-fixed px-5 font-bold text-on-primary-fixed-variant no-underline hover:bg-primary-fixed-dim/50"
                  >
                    Create an account
                  </Link>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-surface-container-low px-5 py-3.5">
                <span className="text-body-md">Are you a student?</span>
                <Link
                  href="/sign-in/child"
                  className="inline-flex min-h-11 items-center rounded-full bg-[var(--pub-amber-bg)] px-5 font-bold text-[var(--pub-amber)] no-underline"
                >
                  I am a student — go to child sign in
                </Link>
              </div>
            </div>
          </section>
          <aside aria-labelledby="how-sign-in" className="flex flex-col gap-5 lg:col-span-5">
            <div className="flex flex-col gap-1.5">
              <h2
                id="how-sign-in"
                className="font-headline text-[30px] font-extrabold leading-[38px] tracking-[-0.02em] md:text-[36px] md:leading-[44px]"
              >
                Who signs in here
              </h2>
              <p className="text-body-md text-on-surface-variant">
                One sign-in page for grown-ups. Your account decides which home opens.
              </p>
            </div>
            {(
              [
                [
                  'family',
                  'Parents',
                  'Use the email you registered with. Your family home shows your children, their teachers and their books.',
                  TONE.cyan,
                ],
                [
                  'teacher',
                  'Teachers',
                  'Use the email you registered with. Until the AA Pro team approves your profile, you see your approval status.',
                  TONE.violet,
                ],
                [
                  'user',
                  'Students',
                  'Students don’t use an email. They sign in with the username and password their parent gave them.',
                  TONE.amber,
                ],
              ] as const
            ).map(([icon, title, body, tone]) => (
              <div key={title} className="pub-card flex items-start gap-4 rounded-[32px] p-6">
                <span className={cx('flex size-11 flex-none items-center justify-center rounded-full', tone)}>
                  <Icon name={icon} size={22} />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-headline text-[20px] font-bold leading-7">{title}</h3>
                  <p className="text-body-md text-on-surface-variant">{body}</p>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-4 rounded-[32px] bg-surface-container p-6">
              <span className="flex size-11 flex-none items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed-variant">
                <Icon name="key" size={20} />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="font-headline text-[20px] font-bold leading-7">Forgotten your password?</h3>
                <p className="text-body-md text-on-surface-variant">
                  Use “Forgot password?” and we email you a link to choose a new one. Only a parent can reset a
                  child&apos;s password.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </PublicShell>
  );
}
