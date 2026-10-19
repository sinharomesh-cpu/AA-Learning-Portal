import type { Metadata } from 'next';
import { PanelHead } from '@/components/ui/Panel';
import { SHELL } from '@/components/ui/styles';
import { signOutEverywhereAction } from '@/app/account/actions';
import { ChangePasswordForm } from '@/components/account/ActionForms';
import { Button } from '@/components/Button';
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
      <section aria-labelledby="p-change-password" className={SHELL}>
        <PanelHead id="p-change-password" title="Change password" />
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <ChangePasswordForm />
        </div>
      </section>
      <section aria-labelledby="p-sign-out-everywhere" className={SHELL}>
        <PanelHead id="p-sign-out-everywhere" title="Sign out everywhere" />
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <p className="text-body-md text-on-surface-variant">
            Signs you out on every phone and computer, including this one.
          </p>
          <form action={signOutEverywhereAction}>
            <Button type="submit" variant="secondary">
              Sign out on all devices
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
