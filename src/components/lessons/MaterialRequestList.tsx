import Link from 'next/link';
import type { ReactNode } from 'react';
import { type ChipKind, StatusChip } from '@/components/StatusChip';
import type { MaterialRequestView } from '@/server/materialRequests';

/**
 * TL-2: a lesson's material requests, for the lesson's teacher (My schedule) and the child's
 * parents (Family calendar). Status in words, never colour only. Shared material links to the
 * view-only reader for the teacher only, and only while they can view it; otherwise it says so
 * and shows no content (as TL-1). Typed notes are shown as plain text.
 */
const STATUS: Record<MaterialRequestView['status'], { kind: ChipKind; parent: string; teacher: string }> = {
  open: { kind: 'warning', parent: 'Waiting for your answer', teacher: 'Waiting for the parent' },
  shared: { kind: 'success', parent: 'Shared', teacher: 'Shared' },
  unavailable: { kind: 'neutral', parent: 'Not available', teacher: 'Not available' },
  no_longer_needed: { kind: 'neutral', parent: 'No longer needed', teacher: 'No longer needed' },
};

export function MaterialRequestList({
  lessonId,
  requests,
  viewer,
  actions,
}: {
  lessonId: string;
  requests: MaterialRequestView[];
  viewer: 'parent' | 'teacher';
  actions?: (r: MaterialRequestView) => ReactNode;
}) {
  if (!requests.length) return null;
  const headingId = `materials-${lessonId}`;
  return (
    <div className="flex flex-col gap-2" data-testid="material-requests">
      <p id={headingId} className="m-0 text-sm font-bold leading-5">
        {viewer === 'teacher' ? 'Material you asked for' : 'Material the teacher asked for'}
      </p>
      <ul aria-labelledby={headingId} className="m-0 flex list-none flex-col gap-2 p-0">
        {requests.map((r) => {
          const s = STATUS[r.status];
          return (
            <li
              key={r.id}
              data-testid="material-request"
              className="flex flex-col gap-1.5 rounded-md border border-card-border px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-words text-sm font-bold leading-5">{r.what}</span>
                <StatusChip kind={s.kind}>{viewer === 'teacher' ? s.teacher : s.parent}</StatusChip>
              </div>
              {r.note ? (
                <p className="m-0 break-words text-sm leading-5">
                  {viewer === 'teacher' ? 'Your note: ' : 'The teacher’s note: '}
                  {r.note}
                </p>
              ) : null}
              {r.status === 'shared' && r.sharedLabel ? (
                <p className="m-0 break-words text-sm leading-5" data-testid="material-shared">
                  {viewer === 'teacher' ? 'Shared with you: ' : 'You shared: '}
                  {r.sharedHref ? (
                    <Link href={r.sharedHref} className="inline-flex min-h-11 items-center font-bold">
                      {r.sharedLabel}
                    </Link>
                  ) : (
                    <span>{r.sharedLabel}</span>
                  )}
                  {r.sharedNoLongerVisible ? (
                    <span className="text-on-surface-variant" data-testid="material-not-visible">
                      {' '}
                      · No longer shared
                    </span>
                  ) : null}
                </p>
              ) : null}
              {r.status === 'unavailable' && r.answerNote ? (
                <p className="m-0 break-words text-sm leading-5">
                  {viewer === 'teacher' ? 'The parent’s note: ' : 'Your note: '}
                  {r.answerNote}
                </p>
              ) : null}
              {actions ? actions(r) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
