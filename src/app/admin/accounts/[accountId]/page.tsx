import type { Metadata } from 'next';
import { PanelHead } from '@/components/ui/Panel';
import { SHELL } from '@/components/ui/styles';
import Link from 'next/link';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/forms/FormMessage';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { getAccount } from '@/server/admin';
import { requireAdmin } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { AccountStatusForm, EditAccountForm } from '../../AdminForms';
import { STATUS_LABEL } from '../RealAccounts';

export const metadata: Metadata = { title: 'Edit account' };
export const dynamic = 'force-dynamic';

/** M-28 edit and deactivate (board 39). Parent and teacher accounts only. */
export default async function EditAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const access = await requireAdmin('accounts');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Edit account"
        body="Works with real accounts only."
        homeHref="/admin/accounts"
        homeLabel="Back to accounts"
      />
    );
  }
  const { accountId } = await params;
  const account = await getAccount(db(), access.viewer.id, accountId);
  if (!account) return <AccessDenied viewerRole={access.viewer.role} />;
  const { created } = await searchParams;
  const [label, kind] = STATUS_LABEL[account.status] ?? [account.status, 'neutral'];
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-5">
      <Link href="/admin/accounts" className="self-start text-[15px] font-bold">
        ← Back to accounts
      </Link>
      {created ? (
        <FormMessage tone="success">
          Account created. We sent {account.name} an email to set their password.
        </FormMessage>
      ) : null}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-bold leading-[34px]">{account.name}</h1>
          <StatusChip kind={account.role === 'parent' ? 'human' : 'neutral'}>
            {account.role === 'parent' ? 'Parent' : 'Teacher'}
          </StatusChip>
          <StatusChip kind={kind}>{label}</StatusChip>
        </div>
        <EditAccountForm account={account} />
      </Card>
      <section aria-labelledby="p-sign-in-access" className={SHELL}>
        <PanelHead id="p-sign-in-access" title="Sign-in access" />
        <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
          <AccountStatusForm account={account} />
        </div>
      </section>
    </div>
  );
}
