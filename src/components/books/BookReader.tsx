'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { INPUT_FIT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { drawPage, openPdf } from '@/lib/pdfClient';
import { fetchInPieces } from '@/lib/uploadClient';

export interface ReaderChapter {
  id: string;
  number: number;
  title: string;
  firstPage: number | null;
  lastPage: number | null;
  files: Array<{ id: string; mediaType: string }>;
}

interface Props {
  title: string;
  /** Complete book: its one PDF. */
  fileId: string | null;
  pageOffset: number | null;
  chapters: ReaderChapter[];
  initialChapter: string | null;
}

type Source =
  | { kind: 'pdf'; fileId: string; from: number; to: number | null }
  | { kind: 'photos'; files: string[] }
  | { kind: 'none' };

function sourceFor(fileId: string | null, chapter: ReaderChapter | null): Source {
  if (fileId) return { kind: 'pdf', fileId, from: chapter?.firstPage ?? 1, to: chapter?.lastPage ?? null };
  if (!chapter || !chapter.files.length) return { kind: 'none' };
  const pdf = chapter.files.find((f) => f.mediaType === 'application/pdf');
  if (pdf) return { kind: 'pdf', fileId: pdf.id, from: 1, to: null };
  return { kind: 'photos', files: chapter.files.map((f) => f.id) };
}

/**
 * The book reader (CR-17 PR B1): pages are drawn inside AA Pro, one at a time. The file is
 * fetched in pieces and kept in this tab's memory only (W-6): nothing is written to the browser's
 * lasting storage, and there is no download here (OC-41(5)); the parent owner downloads from the
 * book page.
 */
export function BookReader({ title, fileId, pageOffset, chapters, initialChapter }: Props) {
  const uid = useId();
  const [chapterId, setChapterId] = useState<string | null>(
    initialChapter && chapters.some((c) => c.id === initialChapter) ? initialChapter : (chapters[0]?.id ?? null),
  );
  const chapter = chapters.find((c) => c.id === chapterId) ?? null;
  const source = sourceFor(fileId, chapter);
  const key = source.kind === 'pdf' ? source.fileId : source.kind === 'photos' ? source.files.join(',') : '';

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {chapters.length ? (
        <nav aria-label={`Chapters of ${title}`} className="lg:w-[280px] lg:flex-none">
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {chapters.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={c.id === chapterId ? 'true' : undefined}
                  onClick={() => setChapterId(c.id)}
                  className={cx(
                    'flex min-h-12 w-full items-center gap-2 rounded-[14px] px-3 text-left text-[15px]',
                    c.id === chapterId ? 'bg-primary text-on-primary' : 'hover:bg-surface-container-low',
                  )}
                >
                  <span className="w-8 flex-none font-bold">{c.number}</span>
                  <span className="min-w-0 break-words">{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <section aria-labelledby={`${uid}-h`} className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 id={`${uid}-h`} className="m-0 text-[20px] font-bold leading-7">
          {chapter ? `Chapter ${chapter.number}: ${chapter.title}` : title}
        </h2>
        {source.kind === 'pdf' ? (
          <PdfPages key={key} source={source} pageOffset={fileId ? pageOffset : null} />
        ) : source.kind === 'photos' ? (
          <PhotoPages key={key} files={source.files} />
        ) : (
          <p className="m-0">This chapter has no pages yet.</p>
        )}
      </section>
    </div>
  );
}

function Pager({
  page,
  first,
  last,
  onPage,
  extra,
}: {
  page: number;
  first: number;
  last: number;
  onPage: (n: number) => void;
  extra?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" inactive={page <= first} onClick={() => page > first && onPage(page - 1)}>
        ‹ Previous
      </Button>
      <label htmlFor={id} className="text-[15px]">
        Page
      </label>
      <input
        id={id}
        type="number"
        min={1}
        max={last - first + 1}
        value={page - first + 1}
        onChange={(e) => onPage(Math.max(first, Math.min(last, first + (Number(e.target.value) || 1) - 1)))}
        className={cx(INPUT_FIT, 'min-h-11 w-20')}
      />
      <span className="text-[15px]">of {last - first + 1}</span>
      <Button variant="secondary" inactive={page >= last} onClick={() => page < last && onPage(page + 1)}>
        Next ›
      </Button>
      {extra}
    </div>
  );
}

function Problem({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-[16px] border border-error-border bg-error-container p-4 text-on-error-container"
    >
      <p className="m-0">This book could not be opened. Check your connection and try again.</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function PdfPages({
  source,
  pageOffset,
}: {
  source: { fileId: string; from: number; to: number | null };
  pageOffset: number | null;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The same PDF stays open when the reader moves to another chapter of it (no second download).
  const [view, setView] = useState({ from: source.from, page: source.from });
  const page = view.from === source.from ? view.page : source.from;
  const setPage = (n: number) => setView({ from: source.from, page: n });
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctl = new AbortController();
    let opened: PDFDocumentProxy | null = null;
    fetchInPieces(source.fileId, ctl.signal)
      .then((bytes) => openPdf(bytes))
      .then((d) => {
        opened = d;
        if (ctl.signal.aborted) void d.loadingTask.destroy();
        else setDoc(d);
      })
      .catch(() => {
        if (!ctl.signal.aborted) setFailed(true);
      });
    return () => {
      ctl.abort();
      if (opened) void opened.loadingTask.destroy();
    };
  }, [source.fileId, attempt]);

  useEffect(() => {
    if (!doc || !canvas.current || !box.current) return;
    let cancel: (() => void) | null = null;
    const width = Math.min(box.current.clientWidth, 900);
    drawPage(doc, page, canvas.current, width, zoom)
      .then((c) => {
        cancel = c;
      })
      .catch(() => {});
    return () => cancel?.();
  }, [doc, page, zoom]);

  if (failed) {
    return (
      <Problem
        onRetry={() => {
          setFailed(false);
          setAttempt((a) => a + 1);
        }}
      />
    );
  }
  if (!doc) return <p aria-live="polite">Opening the book…</p>;
  const last = Math.min(source.to ?? doc.numPages, doc.numPages);
  const printed = pageOffset ? page - pageOffset + 1 : null;
  return (
    <div className="flex flex-col gap-3">
      <Pager
        page={page}
        first={source.from}
        last={last}
        onPage={setPage}
        extra={
          <span className="flex items-center gap-1">
            <Button variant="secondary" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">
              −
            </Button>
            <Button variant="secondary" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">
              +
            </Button>
          </span>
        }
      />
      <p className="m-0 text-sm text-on-surface-variant" aria-live="polite">
        PDF page {page}
        {printed && printed >= 1 ? ` · book page ${printed}` : ''}
      </p>
      <div
        ref={box}
        role="region"
        aria-label={`Page ${page}, scrollable`}
        tabIndex={0}
        className="overflow-auto rounded-[16px] border border-card-border bg-surface-container-low p-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-primary"
      >
        <canvas ref={canvas} data-testid="book-page" aria-label={`Page ${page}`} />
      </div>
    </div>
  );
}

function PhotoPages({ files }: { files: string[] }) {
  const [page, setPage] = useState(1);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fileId = files[page - 1]!;

  // Only the page being read is fetched (B-7: page by page).
  useEffect(() => {
    const ctl = new AbortController();
    let made: string | null = null;
    fetchInPieces(fileId, ctl.signal)
      .then((bytes) => {
        made = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
        if (!ctl.signal.aborted) setUrl(made);
      })
      .catch(() => {
        if (!ctl.signal.aborted) setFailed(true);
      });
    return () => {
      ctl.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [fileId, attempt]);

  if (failed) {
    return (
      <Problem
        onRetry={() => {
          setFailed(false);
          setAttempt((a) => a + 1);
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Pager
        page={page}
        first={1}
        last={files.length}
        onPage={(n) => {
          setUrl(null);
          setPage(n);
        }}
      />
      <div
        role="region"
        aria-label={`Page ${page}, scrollable`}
        tabIndex={0}
        className="overflow-auto rounded-[16px] border border-card-border bg-surface-container-low p-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-primary"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a private page held in memory, not an optimisable image
          <img src={url} alt={`Page ${page}`} data-testid="book-photo" className="h-auto max-w-full" />
        ) : (
          <p aria-live="polite">Opening page {page}…</p>
        )}
      </div>
    </div>
  );
}
