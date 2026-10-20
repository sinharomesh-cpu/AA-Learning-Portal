import type { ReactNode } from 'react';
import { StudentShell } from '@/components/shell/StudentShell';
import { triggerSignedInMaintenance } from '@/server/notifications/pageLoad';
import { getViewer } from '@/server/session';

/**
 * Shows the student shell only to a signed-in student. This is presentation only: each
 * page performs its own server-side role check before loading data (see server/authz.ts).
 */
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (viewer?.role !== 'student') return <>{children}</>;
  await triggerSignedInMaintenance();
  return (
    <StudentShell displayName={viewer.displayName} initial={viewer.initial}>
      {children}
    </StudentShell>
  );
}
