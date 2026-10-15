import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { clockNow } from '@/lib/clock';
import { formatClockTime } from '@/lib/time';
import { requireRole } from '@/server/authz';
import { CURRICULA, getChild, STEP_UP_MINUTES } from '@/server/children';
import { db } from '@/server/db/client';
import { isDemoMode } from '@/server/demo';
import { ownChildName } from '@/server/family';
import { getRealSession } from '@/server/session';
import { EditChildForm } from '../ChildForms';
import { ChildSecurity } from '../ChildSecurity';

export const metadata: Metadata = { title: 'Child profile' };

/** M-08 child profile: edit, sign-in and security, pause (board 18). The ownership check runs first (FR-002.2). */
export default async function ChildProfilePage({ params }: { params: Promise<{ childId: string }> }) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const { childId } = await params;
  // A child not linked to this parent looks exactly like a page that does not exist.
  const name = await ownChildName(access.viewer, childId);
  if (name === null) return <AccessDenied viewerRole="parent" />;
  if (isDemoMode()) {
    return (
      <NotReadyYet
        title={`${name}'s profile`}
        body="Editing a child's profile and sign-in works with real accounts. The sample preview uses built-in sample children."
        homeHref="/parent/children"
        homeLabel="Back to children"
      />
    );
  }
  const now = clockNow();
  const child = await getChild(db(), access.viewer.id, childId, now);
  if (!child) return <AccessDenied viewerRole="parent" />;
  const session = (await getRealSession())?.session;
  const confirmed = Boolean(session && now.getTime() - session.reauthenticatedAt.getTime() < STEP_UP_MINUTES * 60_000);
  return (
    <div className="flex max-w-[920px] flex-col gap-6">
      <Link href="/parent/children" className="self-start text-[15px] font-bold">
        ← Back to children
      </Link>
      <h1 className="text-headline-lg-mobile lg:text-headline-lg">Edit {child.name}&apos;s profile</h1>
      <EditChildForm
        childId={child.id}
        curricula={CURRICULA}
        initial={{
          name: child.name,
          grade: child.grade,
          curriculum: child.curriculum,
          timeZone: child.timeZone,
          subjects: child.subjects,
          avatar: child.avatar,
        }}
      />
      <ChildSecurity
        childId={child.id}
        childName={child.name}
        username={child.username}
        paused={child.status === 'suspended'}
        confirmed={confirmed}
        lockedUntilLabel={
          child.lockedUntil
            ? formatClockTime(child.lockedUntil.toISOString(), { timeZone: access.viewer.timeZone })
            : null
        }
      />
    </div>
  );
}
