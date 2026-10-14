import type { ReactNode } from 'react';
import { AdultShell } from '@/components/shell/AdultShell';
import { TEACHER_MENU } from '@/config/menus';
import { getViewer } from '@/server/session';

/** Presentation only; each page performs its own server-side role check (server/authz.ts). */
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (viewer?.role !== 'teacher') return <>{children}</>;
  return (
    <AdultShell role="teacher" menu={TEACHER_MENU} displayName={viewer.displayName} initial={viewer.initial}>
      {children}
    </AdultShell>
  );
}
