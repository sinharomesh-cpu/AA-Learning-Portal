'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { Panel, TickCard } from '@/components/ui/Panel';
import { SelectField } from '@/components/ui/SelectField';
import { CHOICE_CARD, INPUT, INPUT_FIT, OVERLAY_INPUT } from '@/components/ui/styles';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { fromFileName, suggestChapters, type Found } from '@/lib/bookChapters';
import { cx } from '@/lib/cx';
import { FILE_MAX_BYTES, formatFileSize } from '@/lib/filePieces';
import { asDocLike, hasText, openPdf } from '@/lib/pdfClient';
import { sendInPieces } from '@/lib/uploadClient';
import { createCompleteBookAction } from '../../actions';
import { ChapterTable, type Row, rowsToChapters, PagePreview } from '../ChapterTable';

export interface ChildOption {
  id: string;
  name: string;
  grade: number;
  subjects: SubjectId[];
}

type FileState =
  | { kind: 'none' }
  | { kind: 'reading'; file: File }
  | { kind: 'ready'; file: File; pages: number; text: boolean; doc: PDFDocumentProxy }
  | { kind: 'error'; message: string };

const LABEL = 'text-sm font-bold leading-5';

/**
 * Board B1: a complete book (one PDF), used as it is or split into chapters. The PDF is read on
 * this device with pdf.js to count pages and suggest chapters (bookmarks first, then a readable
 * contents page); nothing is uploaded until the parent presses Save, and the server checks every
 * chapter again (B-1, B-2).
 */
export function NewBookForm({ kids }: { kids: ChildOption[] }) {
  const uid = useId();
  const router = useRouter();
  const [childIds, setChildIds] = useState<string[]>(kids.length === 1 ? [kids[0]!.id] : []);
  const [subject, setSubject] = useState<string>('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [file, setFile] = useState<FileState>({ kind: 'none' });
  const doc = useRef<PDFDocumentProxy | null>(null);
  const [split, setSplit] = useState<'none' | 'chapters' | ''>('');
  const [looking, setLooking] = useState<'idle' | 'looking' | 'done'>('idle');
  const [method, setMethod] = useState<Found | 'manual' | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [offset, setOffset] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState<null | { done: number; total: number }>(null);
  const [error, setError] = useState<{ message: string; index?: number; bookId?: string } | null>(null);

  useEffect(
    () => () => {
      void doc.current?.loadingTask.destroy();
    },
    [],
  );

  async function pick(f: File | undefined) {
    setError(null);
    setSplit('');
    setRows([]);
    setLooking('idle');
    setMethod(null);
    setOffset(null);
    void doc.current?.loadingTask.destroy();
    doc.current = null;
    if (!f) return setFile({ kind: 'none' });
    if (f.size > FILE_MAX_BYTES) {
      return setFile({
        kind: 'error',
        message: `This file is ${formatFileSize(f.size)}. The limit is 20 MB. Add it chapter by chapter instead.`,
      });
    }
    setFile({ kind: 'reading', file: f });
    try {
      const d = await openPdf(await f.arrayBuffer());
      doc.current = d;
      setFile({ kind: 'ready', file: f, pages: d.numPages, text: await hasText(d), doc: d });
      if (!titleTouched) setTitle(fromFileName(f.name).title ?? '');
    } catch (e) {
      const locked = (e as { name?: string } | null)?.name === 'PasswordException';
      setFile({
        kind: 'error',
        message: locked
          ? 'This PDF is password-protected. Please remove the password and try again.'
          : 'This file could not be opened as a PDF. For photos of pages, add the book chapter by chapter.',
      });
    }
  }

  async function chooseSplit(v: 'none' | 'chapters') {
    setSplit(v);
    setError(null);
    if (v !== 'chapters' || looking !== 'idle' || !doc.current) return;
    setLooking('looking');
    try {
      const found = await suggestChapters(asDocLike(doc.current));
      setMethod(found.method);
      setOffset(found.offset);
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
    } catch {
      setMethod(null);
    }
    setLooking('done');
  }

  const ready = file.kind === 'ready' ? file : null;
  const allowed = kids.filter((k) => !subject || k.subjects.includes(subject as SubjectId));

  async function save(publish: boolean) {
    setError(null);
    if (!ready || !split) return setError({ message: 'Choose a PDF and how AA Pro should show it.' });
    if (!title.trim() || !subject) return setError({ message: 'Add a book title and choose a subject.' });
    if (publish && childIds.length === 0) return setError({ message: 'Choose at least one child to publish to.' });
    if (!confirmed) return setError({ message: 'Please tick the box to confirm you may use this material.' });
    setSaving({ done: 0, total: 1 });
    const sent = await sendInPieces(ready.file, (done, total) => setSaving({ done, total }));
    if (!sent.ok) {
      setSaving(null);
      return setError({ message: sent.message });
    }
    const r = await createCompleteBookAction({
      uploadId: sent.uploadId,
      title,
      subject,
      childIds,
      pageCount: ready.pages,
      pageOffset: offset,
      split,
      method: split === 'chapters' ? (method ?? 'manual') : null,
      chapters: split === 'chapters' ? rowsToChapters(rows) : [],
      publish,
      confirmed,
    });
    setSaving(null);
    if (!r.ok) return setError(r);
    router.push(`/parent/content/books/${r.bookId}?saved=${publish ? 'published' : 'draft'}`);
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save(true);
      }}
    >
      <Panel id={`${uid}-who`} title="1 · Who is it for?" level={2}>
        <SelectField
          name="subject"
          label="Subject"
          value={subject}
          onChange={(v) => {
            setSubject(v);
            setChildIds((ids) => ids.filter((id) => kids.find((k) => k.id === id)?.subjects.includes(v as SubjectId)));
          }}
          options={[['', 'Choose a subject'], ...Object.entries(SUBJECTS).map(([id, s]) => [id, s.name] as const)]}
        />
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className={cx(LABEL, 'mb-2')}>Who can read this book</legend>
          {kids.length === 0 ? (
            <p className="m-0 text-[15px]">
              Add a child first on{' '}
              <Link href="/parent/children" className="underline">
                Children
              </Link>
              .
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {kids.map((k) => {
              const off = Boolean(subject) && !allowed.includes(k);
              return (
                <TickCard
                  key={k.id}
                  name="child"
                  value={k.id}
                  disabled={off}
                  checked={childIds.includes(k.id)}
                  onChange={(e) =>
                    setChildIds((ids) => (e.target.checked ? [...ids, k.id] : ids.filter((x) => x !== k.id)))
                  }
                  className={cx('min-w-[200px]', off && 'opacity-60')}
                >
                  <strong>{k.name}</strong> · Grade {k.grade}
                  {off ? <span className="block text-sm">Doesn’t study this subject</span> : null}
                </TickCard>
              );
            })}
          </div>
          <p className="m-0 text-sm leading-5 text-on-surface-variant">
            Teachers linked to these children for this subject can view it inside AA Pro, without download. AA Pro
            administrators can’t open your books.
          </p>
        </fieldset>
      </Panel>

      <Panel
        id={`${uid}-what`}
        title="2 · What are you uploading?"
        intro="A book is one or the other, never a mix."
        level={2}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={CHOICE_CARD}>
            <input type="radio" name="form" defaultChecked className={OVERLAY_INPUT} aria-describedby={`${uid}-f1`} />
            <span className="flex flex-col gap-1">
              <strong>A complete book (one PDF)</strong>
              <span id={`${uid}-f1`} className="text-sm leading-5 text-on-surface-variant">
                Use it as it is, or split it into chapters.
              </span>
            </span>
          </label>
          <Link
            href="/parent/content/books/chapters"
            className="flex flex-col gap-1 rounded-[20px] border border-card-border bg-surface-container-lowest p-4 text-on-surface no-underline hover:border-outline"
          >
            <strong>Separate chapters (a PDF or photos for each)</strong>
            <span className="text-sm leading-5 text-on-surface-variant">Opens Add chapters.</span>
          </Link>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-file`} className={LABEL}>
            The book’s PDF
          </label>
          <input
            id={`${uid}-file`}
            type="file"
            accept=".pdf,application/pdf"
            aria-describedby={`${uid}-file-status`}
            disabled={Boolean(saving)}
            onChange={(e) => void pick(e.target.files?.[0])}
            className={cx(
              'block w-full cursor-pointer rounded-[16px] border-2 border-dashed border-outline bg-surface-container-lowest p-3 text-[15px]',
              'file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-full file:border-0 file:bg-primary file:px-5 file:font-bold file:text-on-primary',
            )}
          />
          <div id={`${uid}-file-status`} aria-live="polite" className="text-[15px] leading-6">
            {file.kind === 'reading' ? (
              <span>Opening {file.file.name} on this device…</span>
            ) : file.kind === 'ready' ? (
              <span data-testid="pdf-ready">
                <strong>{file.file.name}</strong> · {formatFileSize(file.file.size)} · {file.pages}{' '}
                {file.pages === 1 ? 'page' : 'pages'} · {file.text ? 'text found' : 'no text found (scanned)'}
              </span>
            ) : file.kind === 'error' ? (
              <span role="alert" className="font-bold text-on-error-container">
                {file.message}
              </span>
            ) : (
              <span className="text-sm text-on-surface-variant">Up to 20 MB. The PDF is kept exactly as uploaded.</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-title`} className={LABEL}>
            Book title
          </label>
          <input
            id={`${uid}-title`}
            className={cx(INPUT, 'min-h-12')}
            maxLength={200}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
          />
        </div>
      </Panel>

      {ready ? (
        <Panel id={`${uid}-how`} title="3 · How should AA Pro show this book?" level={2}>
          <fieldset className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-2">
            <legend className="sr-only">Choose one</legend>
            <label className={CHOICE_CARD}>
              <input
                type="radio"
                name="split"
                checked={split === 'none'}
                onChange={() => void chooseSplit('none')}
                className={OVERLAY_INPUT}
              />
              <span className="flex flex-col gap-1">
                <strong>Use as it is</strong>
                <span className="text-sm leading-5 text-on-surface-variant">
                  One PDF, no chapters, read from page 1 like a printed book. You can split it later.
                </span>
              </span>
            </label>
            <label className={CHOICE_CARD}>
              <input
                type="radio"
                name="split"
                checked={split === 'chapters'}
                onChange={() => void chooseSplit('chapters')}
                className={OVERLAY_INPUT}
              />
              <span className="flex flex-col gap-1">
                <strong>Split in Chapters</strong>
                <span className="text-sm leading-5 text-on-surface-variant">
                  AA Pro looks for chapters in the PDF’s bookmarks or contents page. You check every name and page range
                  before anything is saved.
                </span>
              </span>
            </label>
          </fieldset>
          {split === 'chapters' ? (
            looking === 'looking' ? (
              <p role="status" className="m-0 text-[15px]">
                Reading the bookmarks and contents page on this device… A long book can take up to a minute on a phone.
              </p>
            ) : (
              <>
                <p
                  role="status"
                  className="m-0 rounded-[16px] bg-surface-container-low px-4 py-3 text-[15px] leading-6"
                >
                  {rows.length && method !== 'manual' ? (
                    <>
                      <strong>
                        We suggest {rows.length} {rows.length === 1 ? 'chapter' : 'chapters'}.
                      </strong>{' '}
                      They come from the PDF’s {method === 'bookmarks' ? 'bookmarks' : 'contents page'}, read on this
                      device. Check each title and page range. Nothing is saved until you press Save.
                    </>
                  ) : ready.text ? (
                    <>We couldn’t find chapters in this PDF. Type the chapters yourself, or use it as it is.</>
                  ) : (
                    <>
                      This PDF is made of pictures, so nothing can be suggested. Type the chapters using the page
                      preview, or use it as it is.
                    </>
                  )}
                </p>
                <ChapterTable
                  rows={rows}
                  pageCount={ready.pages}
                  errorIndex={error?.index}
                  onChange={(next) => {
                    setRows(next);
                    if (!method || (next.length && rows.length === 0)) setMethod('manual');
                  }}
                />
                <OffsetField pageCount={ready.pages} offset={offset} onChange={setOffset} />
                <PagePreview doc={ready.doc} pageCount={ready.pages} />
              </>
            )
          ) : null}
        </Panel>
      ) : null}

      <div className="flex flex-col gap-4">
        <TickCard checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>
          I confirm I am allowed to upload and use this material for my children’s education. It stays private to my
          family on AA Pro.
        </TickCard>
        {error ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-[16px] border border-error-border bg-error-container px-4 py-3 text-[15px] leading-6 text-on-error-container"
          >
            <span>{error.message}</span>
            {error.bookId ? (
              <span className="flex flex-wrap gap-3">
                <Link href={`/parent/content/books/${error.bookId}`} className="font-bold underline">
                  Use the existing book
                </Link>
                <span>Only your own uploads are checked. Other families’ files are never compared.</span>
              </span>
            ) : null}
          </div>
        ) : null}
        {saving ? (
          <p role="status" className="m-0 text-[15px]">
            Saving… {Math.round((saving.done / Math.max(1, saving.total)) * 100)}%
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" inactive={Boolean(saving)}>
            Save and publish
          </Button>
          <Button variant="secondary" inactive={Boolean(saving)} onClick={() => void save(false)}>
            Save as draft
          </Button>
          <Link href="/parent/content" className="inline-flex min-h-12 items-center px-3 font-bold">
            Cancel
          </Link>
        </div>
        <p className="m-0 text-sm leading-5 text-on-surface-variant">
          The original PDF is kept unchanged. Each chapter is a page range inside it, so no copies are made.
        </p>
      </div>
    </form>
  );
}

export function OffsetField({
  pageCount,
  offset,
  onChange,
}: {
  pageCount: number;
  offset: number | null;
  onChange: (v: number | null) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2 text-[15px]">
      <label htmlFor={id}>Printed page 1 of the book is PDF page</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={pageCount}
        value={offset ?? ''}
        onChange={(e) => onChange(e.target.value ? Math.max(1, Math.min(pageCount, Number(e.target.value))) : null)}
        className={cx(INPUT_FIT, 'min-h-11 w-24')}
      />
      <span className="text-sm text-on-surface-variant">(optional; used to show “book page 14 = PDF page 18”)</span>
    </div>
  );
}
