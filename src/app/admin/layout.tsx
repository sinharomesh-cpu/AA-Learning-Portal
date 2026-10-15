import type { ReactNode } from 'react';
import { AdultShell } from '@/components/shell/AdultShell';
import { adminMenuFor } from '@/config/menus';
import { getViewer } from '@/server/session';

/** Presentation only; each page performs its own server-side role check (server/authz.ts). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== 'superadmin' && viewer.role !== 'admin') || viewer.mfaPending) {
    return <>{children}</>;
  }
  return (
    <AdultShell
      role={viewer.role}
      menu={adminMenuFor(viewer.role, viewer.permissions)}
      displayName={viewer.displayName}
      initial={viewer.initial}
    >
      {children}
    </AdultShell>
  );
}
