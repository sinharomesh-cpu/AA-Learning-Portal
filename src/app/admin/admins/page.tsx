import type { Metadata } from 'next';
import { PanelHead } from '@/components/ui/Panel';
import { SHELL } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { Card } from '@/components/Card';
import { StatusChip } from '@/components/StatusChip';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { listAdmins, PERMISSION_LABEL } from '@/server/admin';
import { requireAdmin } from '@/server/authz';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { AddAdminForm, AdminRowForm } from '../AdminForms';

export const metadata: Metadata = { title: 'Admins' };
export const dynamic = 'force-dynamic';

/** Board 66: the Super Admin's list of Admins and what each may manage (OC-50). */
export default async function AdminsPage() {
  const access = await requireAdmin('superadmin');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title="Admins"
        body="Adding Admins works with real accounts. The sample preview has no Admins."
        homeHref="/admin"
        homeLabel="Go to admin home"
      />
    );
  }
  const admins = (await listAdmins(db(), access.viewer.id)) ?? [];
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Admins</h1>
      <Card as="section" aria-labelledby="admin-list" className="flex flex-col gap-3">
        <h2 id="admin-list" className="sr-only">
          Admin list
        </h2>
        {admins.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {admins.map((a, i) => (
              <li
                key={a.id}
                className={`flex flex-col gap-3 py-4 ${i < admins.length - 1 ? 'border-b border-surface-container' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <strong>{a.name}</strong>
                    <span className="text-sm text-on-surface-variant">{a.email}</span>
                    <span className="text-sm">
                      Can manage: {a.permissions.map((p) => PERMISSION_LABEL[p]).join(' · ') || 'nothing'}
                    </span>
                  </div>
                  <StatusChip kind={a.status !== 'active' ? 'neutral' : a.invited ? 'warning' : 'success'}>
                    {a.status !== 'active' ? 'Turned off' : a.invited ? 'Invited' : 'Active'}
                  </StatusChip>
                </div>
                <AdminRowForm admin={a} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-on-surface-variant">No admins yet. Only you can manage AA Pro until you add one.</p>
        )}
      </Card>
      <section aria-labelledby="add-admin" className={cx(SHELL, 'max-w-[640px]')}>
        <PanelHead id="add-admin" title="Add an admin" />
        <div className="px-5 py-5 sm:px-6">
          <AddAdminForm />
        </div>
      </section>
    </div>
  );
}
