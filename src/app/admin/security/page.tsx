import type { Metadata } from 'next';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireAdmin } from '@/server/authz';
import { recoveryCodesLeft } from '@/server/auth/mfa';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { SecuritySettings } from './SecurityForms';

export const metadata: Metadata = { title: 'Security' };
export const dynamic = 'force-dynamic';

/** Super Admin security settings: recovery codes and authenticator (OC-50, board 66). */
export default async function AdminSecurityPage({ searchParams }: { searchParams: Promise<{ recovered?: string }> }) {
  const access = await requireAdmin();
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Security"
        body="Security codes and recovery codes work with real accounts. The sample preview has no sign-in security."
        homeHref="/admin"
        homeLabel="Back to home"
      />
    );
  }
  const left = await recoveryCodesLeft(db(), access.viewer.id);
  const { recovered } = await searchParams;
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-6">
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Security</h1>
      {recovered !== undefined ? (
        <FormMessage tone="warning">
          You signed in with a recovery code. You have {left} left. If you lost your phone, set up a new authenticator
          now.
        </FormMessage>
      ) : null}
      <Card as="section" aria-labelledby="sec-codes" className="flex flex-col gap-4">
        <h2 id="sec-codes" className="text-[20px] font-bold leading-7">
          Security code and recovery codes
        </h2>
        <p className="text-[15px]">
          Security codes are on. Recovery codes left: <strong data-testid="codes-left">{left}</strong>
        </p>
        <SecuritySettings />
      </Card>
    </div>
  );
}
