import type { Metadata } from 'next';
import { HEAD, SHELL } from '@/components/ui/styles';
import { BackToHome } from '@/components/BackToHome';
import { LinkButton } from '@/components/Button';
import { FormMessage } from '@/components/forms/FormMessage';
import { Wordmark } from '@/components/Wordmark';

export const metadata: Metadata = { title: 'Check your email' };

/** Board 62 step 2. The same page appears whether or not the email already had an account. */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; connect?: string }>;
}) {
  const { to, connect } = await searchParams;
  const masked = typeof to === 'string' && /^.{1,3}•••@[^\s]{1,200}$/.test(to) ? to : 'your email address';
  return (
    <>
      <BackToHome />
      <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-10">
        <Wordmark size={32} href="/" />
        <section className={SHELL}>
          <div className={HEAD}>
            <h1 id="page-title" className="font-headline text-[28px] font-bold leading-9">
              Check your email
            </h1>
          </div>
          <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
            <FormMessage tone="info">
              We sent a link to <strong>{masked}</strong>. Open it to confirm your email. The link works once and
              expires in 24 hours.
            </FormMessage>
            {connect ? (
              <p className="text-body-md">
                After you confirm and sign in, we&apos;ll take you back to the teacher you chose, even if you open the
                link on another device. We remember your choice for 7 days.
              </p>
            ) : null}
            <p className="text-body-md text-on-surface-variant">
              No email after a few minutes? Check your spam folder, or sign in and ask for a new link.
            </p>
            <LinkButton href="/sign-in" variant="secondary">
              Go to sign in
            </LinkButton>
          </div>
        </section>
      </main>
    </>
  );
}
