import type { ReactNode } from 'react';
import { AdultShell } from '@/components/shell/AdultShell';
import { TEACHER_MENU, TEACHER_PENDING_MENU } from '@/config/menus';
import { teacherApprovalStatus } from '@/server/teacherProfile';
import { getViewer } from '@/server/session';

/** Presentation only; each page performs its own server-side role check (server/authz.ts). */
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (viewer?.role !== 'teacher') return <>{children}</>;
  const pending = viewer.status === 'pending_approval';
  // A rejected teacher sees only the status message (OC-72): no menu at all.
  const rejected = pending && (await teacherApprovalStatus(viewer.id)) === 'rejected';
  return (
    <AdultShell
      role="teacher"
      // While waiting for approval: status and profile only, the rest greyed out (OC-38, M-20).
      menu={rejected ? [] : pending ? TEACHER_PENDING_MENU : TEACHER_MENU}
      menuNote={pending && !rejected ? 'Other pages open once your profile is approved.' : undefined}
      displayName={viewer.displayName}
      initial={viewer.initial}
    >
      {children}
    </AdultShell>
  );
}
