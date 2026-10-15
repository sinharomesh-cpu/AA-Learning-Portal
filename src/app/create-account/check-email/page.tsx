import type { Metadata } from 'next';
import { BackToHome } from '@/components/BackToHome';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { Wordmark } from '@/components/Wordmark';

export const metadata: Metadata = { title: 'Check your email' };

/** Board 62 step 2. The same page appears whether or not the email already had an account. */
export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const { to } = await searchParams;
  const masked = typeof to === 'string' && /^.{1,3}•••@[^\s]{1,200}$/.test(to) ? to : 'your email address';
  return (
    <>
      <BackToHome />
      <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-10">
        <Wordmark size={32} href="/" />
        <Card className="flex flex-col gap-4">
          <h1 className="text-headline-md">Check your email</h1>
          <FormMessage tone="info">
            We sent a link to <strong>{masked}</strong>. Open it to confirm your email. The link works once and expires
            in 24 hours.
          </FormMessage>
          <p className="text-body-md text-on-surface-variant">
            No email after a few minutes? Check your spam folder, or sign in and ask for a new link.
          </p>
          <LinkButton href="/sign-in" variant="secondary">
            Go to sign in
          </LinkButton>
        </Card>
      </main>
    </>
  );
}
