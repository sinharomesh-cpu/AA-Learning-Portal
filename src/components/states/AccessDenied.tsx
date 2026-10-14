import { ROLE_HOME, type Role } from '@/lib/roles';
import { LinkButton } from '../Button';

/** Role-specific copy from the approved common-states board (board 9). */
const COPY: Record<Role, { title: string; body: string; action: string }> = {
  student: { title: 'This page is for grown-ups', body: "Let's go back to your home page.", action: 'Go to my home' },
  parent: {
    title: 'Page not found',
    body: "This page doesn't exist or isn't linked to your family.",
    action: 'Go to family home',
  },
  teacher: {
    title: "You can't open this",
    body: 'You can only see your own calendar and your assigned students.',
    action: 'Go to my dashboard',
  },
  // Board 9 also says "Attempts are recorded in the audit log." That claim is not shown
  // until the audit log exists (Phase 8; OC-04, deviation DV-06).
  superadmin: {
    title: 'Not available to admins',
    body: "Learning content and child records aren't shown in the Super Admin portal.",
    action: 'Go to admin home',
  },
};

/** Shown when the signed-in role opens an area that belongs to another role (FR-002). */
export function AccessDenied({ viewerRole }: { viewerRole: Role }) {
  const copy = COPY[viewerRole];
  return (
    <main className="mx-auto flex max-w-[640px] flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-[32px] font-extrabold leading-10">{copy.title}</h1>
      <p className="text-lg leading-7 text-on-surface-variant">{copy.body}</p>
      <LinkButton href={ROLE_HOME[viewerRole]} size={viewerRole === 'student' ? 'child' : 'md'}>
        {copy.action}
      </LinkButton>
    </main>
  );
}
