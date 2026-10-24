import type { ReactNode } from 'react';
import { Icon } from '@/components/icons/Icon';
import { StatusChip } from '@/components/StatusChip';
import { SUBJECT_ICONS } from '@/config/subjectIcons';
import { SUBJECTS } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { closeReasonText, formatClock, formatLessonTime, formatMoney, lessonStatusText } from '@/lib/lessonDisplay';
import type { LessonItem } from '@/server/lessons';

/** CR-17 PR 3: where the teacher's own meeting link stands, in words (never the link itself). */
function meetingLine(l: LessonItem, viewer: 'parent' | 'teacher', timeZone: string): string {
  if (viewer === 'parent') {
    if (!l.meeting.allowed) return 'Waiting for you to allow this teacher’s meeting links.';
    return l.meeting.added ? 'Meeting link added by the teacher.' : 'The teacher hasn’t added the meeting link yet.';
  }
  if (!l.meeting.allowed) return 'The parent hasn’t allowed your meeting links for this child yet.';
  return l.meeting.added && l.meeting.setAt
    ? `Your meeting link was saved ${formatLessonTime(l.meeting.setAt, timeZone)}.`
    : 'Add your Zoom meeting link so Join Class can open.';
}

/**
 * One Human Teacher lesson or request (CR-17 PR 2), for the parent's lessons page and the
 * teacher's schedule. Built from the approved design system (D3A-22): the subject tile, status in
 * words, and times in the viewer's own time zone. The price is shown for information only.
 */
export function LessonCard({
  lesson: l,
  viewer,
  timeZone,
  actions,
}: {
  lesson: LessonItem;
  viewer: 'parent' | 'teacher';
  timeZone: string;
  actions?: ReactNode;
}) {
  const status = lessonStatusText(l, viewer);
  const subject = SUBJECTS[l.subject].name;
  const title =
    viewer === 'parent'
      ? `${subject} with ${l.teacherName}`
      : `${subject} with ${l.childName}${l.grade ? ` · Grade ${l.grade}` : ''}`;
  const reason = closeReasonText(l.closeReason);
  return (
    <article
      aria-labelledby={`lesson-${l.id}`}
      data-testid="lesson-card"
      className="flex flex-col gap-4 rounded-[24px] border border-card-border bg-surface-container-lowest p-5 md:flex-row md:items-start md:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-md', SUBJECTS[l.subject].tile)}
        >
          <Icon name={SUBJECT_ICONS[l.subject]} size={26} />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`lesson-${l.id}`} className="m-0 break-words text-[19px] font-bold leading-[26px]">
              {title}
            </h3>
            <StatusChip kind={status.kind}>{status.text}</StatusChip>
          </div>
          {viewer === 'parent' ? (
            <p className="m-0 text-[15px] leading-[22px] text-on-surface-variant">For {l.childName}</p>
          ) : null}
          <p className="m-0 flex items-start gap-1 text-[15px] font-bold leading-[22px]">
            <Icon name="schedule" size={18} className="mt-0.5 shrink-0 text-primary" />
            <span>
              {formatLessonTime(l.startsAt, timeZone)}–{formatClock(l.endsAt, timeZone)} · {l.minutes} min
            </span>
          </p>
          {l.price ? (
            <p className="m-0 text-sm leading-5 text-on-surface-variant">
              {formatMoney(l.price.priceMinor, l.price.currency)} for {l.minutes} min ·{' '}
              {l.price.basis === 'agreed' ? 'Agreed rate' : 'Listed rate'}{' '}
              {formatMoney(l.price.rateMinor, l.price.currency)} an hour
            </p>
          ) : null}
          {l.status === 'requested' ? (
            <p className="m-0 text-sm leading-5 text-on-surface-variant">
              {viewer === 'teacher' ? 'Answer by' : 'The teacher has until'}{' '}
              {formatLessonTime(l.replyDeadline, timeZone)}
              {viewer === 'teacher' ? '.' : ' to answer. Nothing is booked until they accept.'}
            </p>
          ) : null}
          {reason && l.closedBy === 'aa_pro' ? <p className="m-0 text-sm leading-5">{reason}</p> : null}
          {l.closeNote ? (
            <p className="m-0 text-sm leading-5">
              {viewer === 'parent' ? 'The teacher’s reason: ' : 'Your reason: '}
              {l.closeNote}
            </p>
          ) : null}
          {l.outcome ? (
            <p className="m-0 text-sm leading-5">
              {l.outcome === 'taught' ? 'Recorded as taught.' : 'Recorded as did not take place.'}
            </p>
          ) : null}
          {l.status === 'confirmed' && !l.ended ? (
            <p className="m-0 flex items-start gap-1 text-sm leading-5" data-testid="meeting-state">
              <Icon name="videocam" size={18} className="mt-0.5 shrink-0 text-primary" />
              <span>{meetingLine(l, viewer, timeZone)}</span>
            </p>
          ) : null}
          {l.status === 'confirmed' && !l.canCancel && !l.ended ? (
            <p className="m-0 text-sm leading-5 text-on-surface-variant">
              Lessons can’t be cancelled within 30 minutes of the start.
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-col gap-2 md:items-end">{actions}</div> : null}
    </article>
  );
}
