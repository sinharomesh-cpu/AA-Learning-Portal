import type { Metadata } from 'next';
import { HEAD, SHELL } from '@/components/ui/styles';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NewPasswordForm } from '@/components/account/ActionForms';
import { BackToHome } from '@/components/BackToHome';
import { FormMessage } from '@/components/forms/FormMessage';
import { Wordmark } from '@/components/Wordmark';
import { peekToken } from '@/server/auth/accounts';
import { db } from '@/server/db/client';
import { realAuthEnabled } from '@/server/realAuth';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

/** M-03 reset step and board 59 set-password page (same form, different link purpose). */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; purpose?: string }>;
}) {
  if (!realAuthEnabled()) notFound();
  const { token = '', purpose: rawPurpose } = await searchParams;
  const purpose = rawPurpose === 'set_password' ? 'set_password' : 'password_reset';
  const check = await peekToken(db(), token, purpose);
  return (
    <>
      <BackToHome />
      <main className="mx-auto flex max-w-[560px] flex-col gap-6 px-4 py-10">
        <Wordmark size={32} href="/" />
        <section className={SHELL}>
          <div className={HEAD}>
            <h1 id="page-title" className="font-headline text-[28px] font-bold leading-9">
              {purpose === 'set_password' ? 'Set your password' : 'Choose a new password'}
            </h1>
          </div>
          <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
            {check.ok ? (
              <NewPasswordForm token={token} purpose={purpose} />
            ) : (
              <>
                <FormMessage tone="warning">
                  {check.reason === 'expired'
                    ? purpose === 'set_password'
                      ? 'This link has expired. Ask AA Pro support to send a new one.'
                      : 'This link has expired. Ask for a new one.'
                    : 'This link was already used or is not valid. Sign in with your email and password.'}
                </FormMessage>
                <Link href={purpose === 'set_password' ? '/sign-in' : '/forgot-password'} className="font-bold">
                  {purpose === 'set_password' ? 'Go to sign in' : 'Ask for a new link'}
                </Link>
              </>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
