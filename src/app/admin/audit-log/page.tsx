import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Audit log' };

export default async function AdminAuditLogPage() {
  const access = await requireRole('superadmin');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return (
    <NotReadyYet
      title="Audit log"
      body="The read-only audit log is built in Phase 8 (OC-21)."
      homeHref="/admin"
      homeLabel="Go to admin home"
    />
  );
}
