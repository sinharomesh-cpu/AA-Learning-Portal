import type { Metadata } from 'next';
import { HEAD, SHELL } from '@/components/ui/styles';
import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/Wordmark';
import { mfaState, pendingEnrolment, startEnrolment } from '@/server/auth/mfa';
import { db } from '@/server/db/client';
import { getRealSession } from '@/server/session';
import { EnrolForm, VerifyForm } from '../admin/security/SecurityForms';

export const metadata: Metadata = { title: 'Confirm it’s you', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * M-26 second-factor step after the password (OC-50). The first time, the Super Admin sets up
 * the authenticator app here and receives the recovery codes; afterwards they type the code.
 */
export default async function AdminVerifyPage() {
  const real = await getRealSession();
  if (!real || (real.session.role !== 'superadmin' && real.session.role !== 'admin')) redirect('/sign-in');
  if (real.session.mfaVerifiedAt) redirect('/admin');
  const sql = db();
  const { enrolled } = await mfaState(sql, real.session.accountId);
  const [account] = await sql<
    Array<{ email: string }>
  >`SELECT email FROM accounts WHERE id = ${real.session.accountId}`;
  const enrolment = enrolled
    ? null
    : ((await pendingEnrolment(sql, { id: real.session.accountId, email: account!.email })) ??
      (await startEnrolment(sql, { id: real.session.accountId, email: account!.email })));
  return (
    <main className="mx-auto flex max-w-[600px] flex-col gap-6 px-4 py-10">
      <Wordmark size={28} />
      <section className={SHELL}>
        <div className={HEAD}>
          <h1 id="page-title" className="font-headline text-[28px] font-bold leading-9">
            {enrolled ? 'Confirm it’s you' : 'Set up your security code'}
          </h1>
        </div>
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <p className="text-sm leading-5 text-on-surface-variant">
            {enrolled
              ? 'Enter the 6-digit code from your authenticator.'
              : 'AA Pro admins sign in with a password and a code from a phone app. This takes about two minutes.'}
          </p>
          {enrolment ? (
            <EnrolForm qrSvg={enrolment.qrSvg} secret={enrolment.secret} uri={enrolment.uri} />
          ) : (
            <VerifyForm />
          )}
        </div>
      </section>
    </main>
  );
}
