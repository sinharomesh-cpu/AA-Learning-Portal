import type { Metadata } from 'next';
import { HEAD, SHELL } from '@/components/ui/styles';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ForgotPasswordForm } from '@/components/account/ActionForms';
import { BackToHome } from '@/components/BackToHome';
import { FormMessage } from '@/components/forms/FormMessage';
import { Wordmark } from '@/components/Wordmark';
import { realAuthEnabled } from '@/server/realAuth';

export const metadata: Metadata = { title: 'Forgot password' };

/** M-03 recovery (board 14). The answer never says whether the email has an account. */
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  if (!realAuthEnabled()) notFound();
  const { sent } = await searchParams;
  return (
    <>
      <BackToHome />
      <main className="mx-auto flex max-w-[560px] flex-col gap-6 px-4 py-10">
        <Wordmark size={32} href="/" />
        <section className={SHELL}>
          <div className={HEAD}>
            <h1 id="page-title" className="font-headline text-[28px] font-bold leading-9">
              Forgot your password?
            </h1>
          </div>
          <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
            {sent ? (
              <FormMessage tone="success">
                If that email has an AA Pro account, we have sent a link to reset the password. It works once and
                expires in 30 minutes.
              </FormMessage>
            ) : (
              <>
                <p className="text-body-md text-on-surface-variant">
                  Enter the email you use for AA Pro. Children: ask your parent to help you.
                </p>
                <ForgotPasswordForm />
              </>
            )}
            <Link href="/sign-in" className="font-bold">
              Back to sign in
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
