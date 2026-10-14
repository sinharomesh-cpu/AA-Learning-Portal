import type { Metadata } from 'next';
import { LinkButton } from '@/components/Button';
import { Card } from '@/components/Card';
import { Wordmark } from '@/components/Wordmark';
import { isDemoMode } from '@/server/demo';

export const metadata: Metadata = { title: 'Create an account' };

/**
 * Placeholder until board 62 (Create an account, OC-38) is approved and built in WP2-3/WP2-6.
 * It says plainly that accounts cannot be created yet, rather than showing a form that does nothing.
 */
export default function CreateAccountPage() {
  const demo = isDemoMode();
  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-12">
      <Wordmark size={36} href="/" />
      <Card className="flex flex-col gap-4">
        <h1 className="text-headline-md">Create an account</h1>
        <p className="text-body-lg text-on-surface-variant">
          Parent and teacher accounts are not open yet. They are being built now and will open before launch.
        </p>
        {demo ? (
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
  );
}
