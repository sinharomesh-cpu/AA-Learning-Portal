import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';
import { OwnStorageMeter } from '@/server/files/meter';

export const metadata: Metadata = { title: 'Content repository' };
export const dynamic = 'force-dynamic';

export default async function ParentContentPage() {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return (
    <div className="flex flex-col gap-6">
      <NotReadyYet
        title="Content repository"
        body="Uploading and organising learning content comes in Phase 4."
        homeHref="/parent"
        homeLabel="Go to family home"
      />
      <OwnStorageMeter accountId={access.viewer.id} />
    </div>
  );
}
