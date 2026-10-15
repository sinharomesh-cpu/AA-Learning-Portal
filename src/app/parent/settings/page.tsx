import type { Metadata } from 'next';
import { signOutEverywhereAction } from '@/app/account/actions';
import { ChangePasswordForm } from '@/components/account/ActionForms';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';
import { realAuthEnabled } from '@/server/realAuth';

export const metadata: Metadata = { title: 'Settings' };

/** M-34 account settings (board 44): password and signing out everywhere. */
export default async function ParentSettingsPage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (!realAuthEnabled()) {
    return (
      <NotReadyYet
        title="Settings"
        body="Account settings work with real accounts. This preview uses sample accounts."
        homeHref="/parent"
        homeLabel="Go to family home"
      />
    );
  }
  return (
    <main className="flex max-w-[720px] flex-col gap-6">
      <h1 className="text-headline-lg-mobile md:text-headline-lg">Settings</h1>
      <Card className="flex flex-col gap-4">
        <h2 className="text-headline-sm">Change password</h2>
        <ChangePasswordForm />
      </Card>
      <Card className="flex flex-col gap-4">
        <h2 className="text-headline-sm">Sign out everywhere</h2>
        <p className="text-body-md text-on-surface-variant">
          Signs you out on every phone and computer, including this one.
        </p>
        <form action={signOutEverywhereAction}>
          <Button type="submit" variant="secondary">
            Sign out on all devices
          </Button>
        </form>
      </Card>
    </main>
  );
}
