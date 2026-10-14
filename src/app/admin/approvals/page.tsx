import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Teacher approvals' };

export default async function AdminApprovalsPage() {
  const access = await requireRole('superadmin');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return (
    <NotReadyYet
      title="Teacher approvals"
      body="Teacher approvals arrive with real accounts in a later phase (D-09 is still open)."
      homeHref="/admin"
      homeLabel="Go to admin home"
    />
  );
}
