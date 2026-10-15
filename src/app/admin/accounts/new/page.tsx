import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/Card';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireAdmin } from '@/server/authz';
import { isDemoMode } from '@/server/demo';
import { CreateAccountForm } from '../../AdminForms';

export const metadata: Metadata = { title: 'Create an account' };

/** M-28 create (board 39). */
export default async function NewAccountPage() {
  const access = await requireAdmin('accounts');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Create an account"
        body="Works with real accounts only."
        homeHref="/admin/accounts"
        homeLabel="Back to accounts"
      />
    );
  }
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-5">
      <Link href="/admin/accounts" className="self-start text-[15px] font-bold">
        ← Back to accounts
      </Link>
      <Card className="flex flex-col gap-4">
        <h1 className="text-[26px] font-bold leading-[34px]">Create an account</h1>
        <CreateAccountForm />
      </Card>
    </div>
  );
}
