import { StatusChip } from '@/components/StatusChip';
import { brand } from '@/config/brand';
import type { LessonStatus } from '@/fixtures/schedule';

/** Lesson type in words (AI Tutor / Teacher), never colour alone (AX-07). */
export function LessonKindChip({ kind, long = false }: { kind: 'ai' | 'human'; long?: boolean }) {
  return (
    <StatusChip kind={kind === 'ai' ? 'ai' : 'human'}>
      {kind === 'ai' ? brand.tutorNameShort : long ? 'Human teacher' : 'Teacher'}
    </StatusChip>
  );
}

/**
 * Booking status as each role sees it. A teacher-proposed lesson waits for the parent; whether
 * the parent must accept or reject it (OC-45); until then it is not booked and has no Zoom meeting.
 */
export function LessonStatusChip({ status, viewer }: { status: LessonStatus; viewer: 'parent' | 'teacher' }) {
  if (status === 'proposed') {
    return <StatusChip kind="warning">{viewer === 'parent' ? 'Proposed by teacher' : 'Waiting for parent'}</StatusChip>;
  }
  return <StatusChip kind="success">{status === 'confirmed' ? 'Confirmed' : 'Booked'}</StatusChip>;
}
