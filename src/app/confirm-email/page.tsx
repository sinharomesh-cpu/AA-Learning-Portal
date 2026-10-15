import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConfirmEmailForm } from '@/components/account/ActionForms';
import { BackToHome } from '@/components/BackToHome';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { Wordmark } from '@/components/Wordmark';
import { peekToken } from '@/server/auth/accounts';
import { db } from '@/server/db/client';
import { realAuthEnabled } from '@/server/realAuth';

export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false } };

/** Opened from the confirmation email (board 61 email 6). Confirms only on a button press. */
export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (!realAuthEnabled()) notFound();
  const { token = '' } = await searchParams;
  const check = await peekToken(db(), token, 'email_verify');
  return (
    <>
      <BackToHome />
      <main className="mx-auto flex max-w-[560px] flex-col gap-6 px-4 py-10">
        <Wordmark size={32} href="/" />
        <Card className="flex flex-col gap-4">
          <h1 className="text-headline-md">Confirm your email</h1>
          {check.ok ? (
            <>
              <p className="text-body-lg text-on-surface-variant">
                Press the button to confirm this is your email address.
              </p>
              <ConfirmEmailForm token={token} />
            </>
          ) : (
            <FormMessage tone="warning">
              {check.reason === 'expired'
                ? 'This link has expired. Sign in and ask for a new one.'
                : 'This link was already used or is not valid. Try signing in.'}
            </FormMessage>
          )}
        </Card>
      </main>
    </>
  );
}
