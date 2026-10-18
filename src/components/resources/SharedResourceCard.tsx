import Link from 'next/link';
import { Icon } from '@/components/icons/Icon';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { cx } from '@/lib/cx';
import { formatFileSize } from '@/lib/filePieces';

export interface SharedResourceView {
  id: string;
  title: string;
  subject: SubjectId;
  chapter: string | null;
  note: string | null;
  fileId: string | null;
  mediaType: string;
  byteSize: number;
  teacherName: string;
  fromCurrentTeacher: boolean;
  children?: Array<{ id: string; name: string }>;
}

/**
 * A file a teacher shared (boards HW5, HW8). Always says where it came from, so it is never
 * mixed up with the parent's own uploads or Google Classroom (master instruction §7).
 */
export function SharedResourceCard({ r, child = false }: { r: SharedResourceView; child?: boolean }) {
  const s = SUBJECTS[r.subject];
  return (
    <article
      aria-labelledby={`res-${r.id}`}
      data-testid="shared-resource"
      className="flex items-start gap-4 rounded-md border border-card-border bg-surface-container-lowest p-4 sm:p-5"
    >
      <span
        aria-hidden="true"
        className={cx(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] font-headline font-extrabold',
          s.tile,
        )}
      >
        <Icon name={r.mediaType === 'application/pdf' ? 'picture_as_pdf' : 'description'} size={26} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-label-sm uppercase tracking-[.06em] text-on-surface-variant">
          {s.name}
          {r.chapter ? ` · ${r.chapter}` : ''}
        </span>
        <h3
          id={`res-${r.id}`}
          className={cx('m-0 break-words font-bold', child ? 'text-[19px] leading-7' : 'text-[17px] leading-6')}
        >
          {r.title}
        </h3>
        <span className="text-[15px] leading-6 text-on-surface-variant">
          {r.fromCurrentTeacher
            ? child
              ? `From your teacher · ${r.teacherName}`
              : `From ${r.teacherName}`
            : `From a teacher you no longer work with · ${r.teacherName}`}
          {r.children?.length ? ` · ${r.children.map((c) => c.name).join(', ')}` : ''}
        </span>
        {r.note ? <p className="m-0 whitespace-pre-line text-[15px] leading-6">{r.note}</p> : null}
        {r.fileId ? (
          <Link
            href={`/files/${r.fileId}/view`}
            className={cx(
              'mt-1 inline-flex items-center justify-center self-start rounded-full border-2 border-primary bg-primary px-5 font-bold text-on-primary no-underline hover:text-on-primary',
              child ? 'min-h-14 text-[17px]' : 'min-h-12 text-[15px]',
            )}
          >
            Open
            <span className="sr-only"> {r.title}</span>
            <span className="font-medium"> · {formatFileSize(r.byteSize)}</span>
          </Link>
        ) : null}
      </div>
    </article>
  );
}
