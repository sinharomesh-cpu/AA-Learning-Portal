import type { Metadata } from 'next';
import { AccessDenied } from '@/components/states/AccessDenied';
import { NotReadyYet } from '@/components/states/NotReadyYet';
import { parentOwnsLesson } from '@/fixtures/family';
import { requireRole } from '@/server/authz';

export const metadata: Metadata = { title: 'Booking details' };

/** M-10 arrives with scheduling (Phase 3). The ownership check runs now (FR-002.2). */
export default async function BookingDetailPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const access = await requireRole('parent');
  if (!access.allowed) return <AccessDenied viewerRole={access.viewer.role} />;
  const { bookingId } = await params;
  if (!parentOwnsLesson(access.viewer.id, bookingId)) return <AccessDenied viewerRole="parent" />;
  return (
    <NotReadyYet
      title="Booking details"
      body="Booking details, accepting a teacher's proposal, cancelling and rescheduling come with scheduling (Phase 3). The rules are set: you accept or reject a lesson a teacher proposes; teacher lessons can be cancelled or moved up to 30 minutes before the start; AI lessons any time before the start."
      homeHref="/parent"
      homeLabel="Go to family home"
    />
  );
}
