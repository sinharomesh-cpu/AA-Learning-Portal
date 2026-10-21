'use client';

import { useRouter } from 'next/navigation';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useActionState, useId, useState, useTransition } from 'react';
import { Button } from '@/components/Button';
import { TickCard } from '@/components/ui/Panel';
import { INPUT, INPUT_FIT } from '@/components/ui/styles';
import { suggestChapters } from '@/lib/bookChapters';
import { cx } from '@/lib/cx';
import { asDocLike, openPdf } from '@/lib/pdfClient';
import { fetchInPieces } from '@/lib/uploadClient';
import {
  archiveBookAction,
  archiveChapterAction,
  bookChildrenAction,
  type BookFormState,
  editChapterAction,
  publishBookAction,
  setBookChaptersAction,
} from '../../actions';
import { ChapterTable, PagePreview, type Row, rowsToChapters } from '../ChapterTable';
import { OffsetField } from '../new/NewBookForm';

function Message({ state }: { state: BookFormState }) {
  if (state.error) {
    return (
      <p role="alert" className="m-0 font-bold text-on-error-container">
        {state.error}
      </p>
    );
  }
  return state.notice ? (
    <p role="status" className="m-0 text-on-success-container">
      {state.notice}
    </p>
  ) : null;
}

export function PublishButton({ bookId, published }: { bookId: string; published: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant={published ? 'secondary' : 'primary'}
        inactive={pending}
        onClick={() =>
          start(async () => {
            const r = await publishBookAction(bookId, !published);
            if (!r.ok) setError(r.message);
            else {
              setError(null);
              router.refresh();
            }
          })
        }
      >
        {published ? 'Back to draft' : 'Publish'}
      </Button>
      {error ? (
        <p role="alert" className="m-0 font-bold text-on-error-container">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ChildrenForm({
  bookId,
  kids,
  chosen,
}: {
  bookId: string;
  kids: Array<{ id: string; name: string; grade: number }>;
  chosen: string[];
}) {
  const [state, action, pending] = useActionState(bookChildrenAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="bookId" value={bookId} />
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-sm font-bold leading-5">Who can read this book</legend>
        <div className="flex flex-wrap gap-2">
          {kids.map((k) => (
            <TickCard
              key={k.id}
              name="child"
              value={k.id}
              defaultChecked={chosen.includes(k.id)}
              className="min-w-[200px]"
            >
              <strong>{k.name}</strong> · Grade {k.grade}
            </TickCard>
          ))}
        </div>
      </fieldset>
      <Button type="submit" variant="secondary" inactive={pending} className="self-start">
        Save who can read it
      </Button>
      <Message state={state} />
    </form>
  );
}

export function ArchiveBookForm({ bookId, archived }: { bookId: string; archived: boolean }) {
  const [state, action, pending] = useActionState(archiveBookAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="bookId" value={bookId} />
      {archived ? <input type="hidden" name="restore" value="1" /> : null}
      <Button type="submit" variant={archived ? 'secondary' : 'danger'} inactive={pending} className="self-start">
        {archived ? 'Restore' : 'Archive this book'}
      </Button>
      <Message state={state} />
    </form>
  );
}

export function ChapterEditForm({
  bookId,
  chapter,
}: {
  bookId: string;
  chapter: { id: string; number: number; title: string; description: string | null };
}) {
  const id = useId();
  const [state, action, pending] = useActionState(editChapterAction, {});
  const [archiveState, archive, archiving] = useActionState(archiveChapterAction, {});
  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="bookId" value={bookId} />
        <input type="hidden" name="chapterId" value={chapter.id} />
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-n`} className="text-sm font-bold">
            No.
          </label>
          <input
            id={`${id}-n`}
            name="number"
            inputMode="numeric"
            defaultValue={chapter.number}
            className={cx(INPUT_FIT, 'min-h-11 w-20')}
          />
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label htmlFor={`${id}-t`} className="text-sm font-bold">
            Title
          </label>
          <input
            id={`${id}-t`}
            name="title"
            maxLength={200}
            defaultValue={chapter.title}
            className={cx(INPUT, 'min-h-11')}
          />
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label htmlFor={`${id}-d`} className="text-sm font-bold">
            Description
          </label>
          <input
            id={`${id}-d`}
            name="description"
            maxLength={500}
            defaultValue={chapter.description ?? ''}
            className={cx(INPUT, 'min-h-11')}
          />
        </div>
        <Button type="submit" variant="secondary" inactive={pending}>
          Save
        </Button>
      </form>
      <form action={archive}>
        <input type="hidden" name="bookId" value={bookId} />
        <input type="hidden" name="chapterId" value={chapter.id} />
        <Button
          type="submit"
          variant="danger"
          inactive={archiving}
          aria-label={`Archive chapter ${chapter.number}`}
          className="min-h-11"
        >
          Archive chapter
        </Button>
      </form>
      <Message state={state.at && (!archiveState.at || state.at > archiveState.at) ? state : archiveState} />
    </div>
  );
}

/**
 * B-8: "Split in Chapters" for a book first used as it is, or "Change chapters" for a split book.
 * The PDF already in AA Pro is read on this device; the same book and PDF are kept, and the
 * parent confirms every chapter before saving.
 */
export function SplitLater({
  bookId,
  fileId,
  pageCount,
  current,
  pageOffset,
}: {
  bookId: string;
  fileId: string;
  pageCount: number;
  current: Row[];
  pageOffset: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'reading' | 'ready' | 'failed'>('idle');
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [rows, setRows] = useState<Row[]>(current);
  const [method, setMethod] = useState<string | null>(current.length ? 'manual' : null);
  const [offset, setOffset] = useState<number | null>(pageOffset);
  const [error, setError] = useState<{ message: string; index?: number } | null>(null);
  const [pending, start] = useTransition();

  async function begin() {
    setOpen(true);
    setState('reading');
    try {
      const d = await openPdf(await fetchInPieces(fileId));
      setDoc(d);
      if (!current.length) {
        const found = await suggestChapters(asDocLike(d));
        setMethod(found.method);
        if (found.offset) setOffset(found.offset);
        setRows(
          found.suggestions.map((s) => ({
            key: crypto.randomUUID(),
            number: String(s.number),
            title: s.title,
            firstPage: String(s.firstPage),
            lastPage: String(s.lastPage),
            origin: s.origin,
            needsCheck: s.needsCheck ?? false,
          })),
        );
      }
      setState('ready');
    } catch {
      setState('failed');
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" className="self-start" onClick={() => void begin()}>
        {current.length ? 'Change chapters' : 'Split in Chapters'}
      </Button>
    );
  }
  if (state === 'reading') return <p role="status">Reading the bookmarks and contents page on this device…</p>;
  if (state === 'failed') {
    return (
      <p role="alert" className="m-0 font-bold text-on-error-container">
        The book could not be opened. Check your connection and try again.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="m-0 rounded-[16px] bg-surface-container-low px-4 py-3 text-[15px] leading-6">
        {current.length
          ? 'Change the chapters below. The same book and PDF are kept; the old chapter list is kept as history.'
          : rows.length
            ? `We suggest ${rows.length} chapters from the PDF’s ${method === 'bookmarks' ? 'bookmarks' : 'contents page'}. Check each title and page range. Nothing is saved until you press Save.`
            : 'We couldn’t find chapters in this PDF. Type the chapters yourself.'}
      </p>
      <ChapterTable
        rows={rows}
        pageCount={pageCount}
        errorIndex={error?.index}
        onChange={(next) => {
          setRows(next);
          setMethod((m) => m ?? 'manual');
        }}
      />
      <OffsetField pageCount={pageCount} offset={offset} onChange={setOffset} />
      {doc ? <PagePreview doc={doc} pageCount={pageCount} /> : null}
      {error ? (
        <p role="alert" className="m-0 font-bold text-on-error-container">
          {error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          inactive={pending}
          onClick={() =>
            start(async () => {
              const r = await setBookChaptersAction(bookId, {
                chapters: rowsToChapters(rows),
                method: method && method !== 'manual' && !current.length ? method : 'manual',
                pageOffset: offset,
              });
              if (!r.ok) return setError(r);
              setError(null);
              setOpen(false);
              void doc?.loadingTask.destroy();
              router.refresh();
            })
          }
        >
          Save chapters
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
