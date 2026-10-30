import { Fragment } from 'react';
import type { HomeChapter } from '@/fixtures/schedule';
import { cx } from '@/lib/cx';

/**
 * TL-6 (owner authorisation, 30 Oct 2026): a teacher lesson's chapters or topic on a home page,
 * in the same words as the calendars ("Chapter:", "Chapters:", "Topic:"; "No longer shared" for the
 * teacher). Information only: no links and no actions. Nothing is shown when there are none.
 */
export function HomeChapters({
  chapters,
  showSharing = false,
  className,
}: {
  chapters: HomeChapter[] | undefined;
  /** Teacher home: say when the teacher can no longer view a chapter (D-TLS-19). */
  showSharing?: boolean;
  className?: string;
}) {
  if (!chapters?.length) return null;
  const lead = chapters[0]!.topic ? 'Topic' : chapters.length === 1 ? 'Chapter' : 'Chapters';
  return (
    <span className={cx('break-words', className)} data-testid="home-chapters">
      {lead}:{' '}
      {chapters.map((c, i) => (
        <Fragment key={i}>
          {i ? '; ' : ''}
          {c.label}
          {showSharing && !c.topic && !c.shared ? (
            <span data-testid="home-chapter-not-shared"> · No longer shared</span>
          ) : null}
        </Fragment>
      ))}
    </span>
  );
}
