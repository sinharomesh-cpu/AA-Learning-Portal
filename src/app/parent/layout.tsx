import type { ReactNode } from 'react';
import { AdultShell } from '@/components/shell/AdultShell';
import { PARENT_MENU } from '@/config/menus';
import { triggerSignedInMaintenance } from '@/server/notifications/pageLoad';
import { shellNotifications } from '@/server/notifications/view';
import { getViewer } from '@/server/session';

/** Presentation only; each page performs its own server-side role check (server/authz.ts). */
export default async function ParentLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (viewer?.role !== 'parent') return <>{children}</>;
  await triggerSignedInMaintenance();
  return (
    <AdultShell
      role="parent"
      menu={PARENT_MENU}
      displayName={viewer.displayName}
      initial={viewer.initial}
      notifications={await shellNotifications()}
    >
      {children}
    </AdultShell>
  );
}
