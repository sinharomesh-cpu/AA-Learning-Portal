import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { findPersona } from '@/fixtures/personas';
import { teacherLinkedTo } from '@/fixtures/teacher';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Student' };

/** M-25 arrives with real accounts (Phase 2). Only linked students are reachable (FR-002.2). */
export default async function TeacherStudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  const access = await requireRole('teacher');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const { studentId } = await params;
  if (!teacherLinkedTo(access.viewer.id, studentId)) return <AccessDenied viewerRole="teacher" />;
  const name = findPersona(studentId)?.displayName ?? '';
  return (
    <NotReadyYet
      title={name}
      body="Student details come with real accounts (Phase 2). How teachers are linked to students is still being decided (D-09)."
      homeHref="/teacher"
      homeLabel="Go to my dashboard"
    />
  );
}
