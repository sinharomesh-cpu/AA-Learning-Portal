import type { ReactNode } from 'react';
import { AdultShell } from '@/components/shell/AdultShell';
import { TEACHER_MENU, TEACHER_PENDING_MENU } from '@/config/menus';
import { triggerSignedInMaintenance } from '@/server/notifications/pageLoad';
import { shellNotifications } from '@/server/notifications/view';
import { teacherApprovalStatus } from '@/server/teacherProfile';
import { getViewer } from '@/server/session';

/** Presentation only; each page performs its own server-side role check (server/authz.ts). */
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (viewer?.role !== 'teacher') return <>{children}</>;
  const pending = viewer.status === 'pending_approval';
  // A rejected teacher sees only the status message (OC-72): no menu at all.
  const rejected = pending && (await teacherApprovalStatus(viewer.id)) === 'rejected';
  // CR-16 §7.2: the shared sweep and clean-up (not for a not-approved teacher, Q-2).
  if (!rejected) await triggerSignedInMaintenance();
  return (
    <AdultShell
      role="teacher"
      // While waiting for approval: status and profile only, the rest greyed out (OC-38, M-20).
      menu={rejected ? [] : pending ? TEACHER_PENDING_MENU : TEACHER_MENU}
      menuNote={pending && !rejected ? 'Other pages open once your profile is approved.' : undefined}
      displayName={viewer.displayName}
      initial={viewer.initial}
      // CR-16: no bell for a not-approved teacher (Q-2); status and profile only while waiting (D-5).
      notifications={rejected ? null : await shellNotifications()}
    >
      {children}
    </AdultShell>
  );
}
