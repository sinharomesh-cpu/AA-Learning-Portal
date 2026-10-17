import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/public/icons';
import { BackToHomeLink, BrandMark, PUBLIC_WRAP, PublicShell } from '@/components/public/PublicShell';
import { cx } from '@/lib/cx';
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
    <PublicShell>
      <main className={cx(PUBLIC_WRAP, 'flex flex-col gap-6 py-8 md:py-12')}>
        <BackToHomeLink />
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <BrandMark size="lg" />
            <h1 className="font-headline text-[38px] font-extrabold leading-[46px] tracking-[-0.02em] md:text-[52px] md:leading-[60px]">
              Hello! <span className="pub-accent">Ready to learn?</span>
            </h1>
            <p className="text-body-lg text-on-surface-variant">
              {demo ? 'Pick your name to start.' : 'Type the username and password your parent gave you.'}
            </p>
            <ul aria-hidden="true" className="flex flex-wrap gap-2.5">
              {(
                [
                  ['calc', 'Maths'],
                  ['flask', 'Science'],
                  ['globe', 'SST'],
                  ['letter', 'English'],
                  ['hindi', 'Hindi'],
                  ['laptop', 'IT'],
                ] as const
              ).map(([icon, label]) => (
                <li
                  key={label}
                  className="pub-card flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 font-headline text-[15px] font-bold"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed-variant">
                    <Icon name={icon} size={16} />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <section aria-label="Child sign in" className="pub-card flex flex-col gap-5 rounded-[40px] p-6 sm:p-10">
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
            <p className="rounded-[24px] bg-surface-container-low px-5 py-3.5 text-center text-body-md text-on-surface-variant">
              Forgot your password? Ask your parent to help you.
            </p>
            <Link href="/sign-in" className="text-center text-[15px] font-bold">
              Grown-up sign in
            </Link>
          </section>
        </div>
      </main>
    </PublicShell>
  );
}
