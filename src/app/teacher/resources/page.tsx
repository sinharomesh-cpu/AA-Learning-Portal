import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { requireRole } from '@/server/authz';
import { OwnStorageMeter } from '@/server/files/meter';

export const metadata: Metadata = { title: 'Learning resources' };
export const dynamic = 'force-dynamic';

export default async function TeacherResourcesPage() {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  return (
    <div className="flex flex-col gap-6">
      <NotReadyYet
        title="Learning resources"
        body="Sharing learning resources comes in Phase 4."
        homeHref="/teacher"
        homeLabel="Go to my dashboard"
      />
      <OwnStorageMeter accountId={access.viewer.id} />
    </div>
  );
}
