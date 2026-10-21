'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/Button';
import { Panel, TickCard } from '@/components/ui/Panel';
import { SelectField } from '@/components/ui/SelectField';
import { INPUT, INPUT_FIT } from '@/components/ui/styles';
import { SUBJECTS, type SubjectId } from '@/fixtures/subjects';
import { fromFileName } from '@/lib/bookChapters';
import { cx } from '@/lib/cx';
import { FILE_MAX_BYTES, formatFileSize } from '@/lib/filePieces';
import { openPdf } from '@/lib/pdfClient';
import { sendInPieces } from '@/lib/uploadClient';
import {
  addChapterFileAction,
  createChapterBookAction,
  discardChapterAction,
  finishChapterAction,
  publishBookAction,
  startChapterAction,
} from '../../actions';
import type { ChildOption } from '../new/NewBookForm';

/** B-9 (proposed): the most photos in one chapter; the server holds the same limit. */
const PHOTO_LIMIT = 30;
const PHOTO_TYPES = '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif';

export interface ChapterBookOption {
  id: string;
  title: string;
  subject: SubjectId;
  numbers: number[];
  childNames: string[];
}

interface Photo {
  key: string;
  file: File;
  url: string;
}

interface Entry {
  key: string;
  kind: 'pdf' | 'photos';
  pdf?: File;
  pdfInfo?: string;
  photos: Photo[];
  number: string;
  title: string;
  origin: 'typed' | 'file_name';
  description: string;
  error?: string;
  progress?: string;
}

const LABEL = 'text-sm font-bold leading-5';

/**
 * Board B2: chapters added one by one, each one PDF or 1–30 photos of its pages (B-6, B-7, B-9).
 * Titles are suggested from PDF file names only and the parent checks them; photos suggest
 * nothing. Each file is sent on its own (the free host's 4.5 MB request limit), and a chapter
 * becomes readable only when all its files are in.
 */
export function ChaptersForm({
  kids,
  books,
  initialBook,
}: {
  kids: ChildOption[];
  books: ChapterBookOption[];
  initialBook: string;
}) {
  const uid = useId();
  const router = useRouter();
  const [bookId, setBookId] = useState(initialBook || (books.length ? books[0]!.id : 'new'));
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newKids, setNewKids] = useState<string[]>(kids.length === 1 ? [kids[0]!.id] : []);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const book = books.find((b) => b.id === bookId) ?? null;
  const taken = book?.numbers ?? [];

  // Photo previews are object URLs on this device; freed when the page closes.
  useEffect(
    () => () => entries.forEach((e) => e.photos.forEach((p) => URL.revokeObjectURL(p.url))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on leaving the page
    [],
  );

  const nextNumber = (list: Entry[]) => {
    const used = new Set([...taken, ...list.map((e) => Number(e.number)).filter(Boolean)]);
    let n = 1;
    while (used.has(n)) n++;
    return String(n);
  };

  const update = (key: string, patch: Partial<Entry>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  async function addPdfs(files: FileList | null) {
    if (!files) return;
    const added: Entry[] = [];
    for (const f of Array.from(files)) {
      const s = fromFileName(f.name);
      const entry: Entry = {
        key: crypto.randomUUID(),
        kind: 'pdf',
        pdf: f,
        photos: [],
        number: '',
        title: s.title ?? '',
        origin: s.title ? 'file_name' : 'typed',
        description: '',
      };
      if (f.size > FILE_MAX_BYTES)
        entry.error = `"${f.name}" is ${formatFileSize(f.size)}. The limit is 20 MB per file.`;
      entry.number = s.number && ![...taken].includes(s.number) ? String(s.number) : '';
      added.push(entry);
    }
    setEntries((list) => {
      const all = [...list];
      for (const e of added) all.push({ ...e, number: e.number || nextNumber(all) });
      return all;
    });
    for (const e of added) {
      if (e.error || !e.pdf) continue;
      try {
        const d = await openPdf(await e.pdf.arrayBuffer());
        update(e.key, { pdfInfo: `${d.numPages} ${d.numPages === 1 ? 'page' : 'pages'} · a real PDF` });
        void d.loadingTask.destroy();
      } catch {
        update(e.key, {
          error: `"${e.pdf.name}" isn't a PDF this device can open. Save it as a PDF and try again, or add photos of the pages.`,
        });
      }
    }
  }

  function addPhotoChapter() {
    setEntries((list) => [
      ...list,
      {
        key: crypto.randomUUID(),
        kind: 'photos',
        photos: [],
        number: nextNumber(list),
        title: '',
        origin: 'typed',
        description: '',
      },
    ]);
  }

  function addPhotos(key: string, list: FileList | null) {
    // Copied now: the file box is cleared straight after, which empties its live list.
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setEntries((list) =>
      list.map((e) => {
        if (e.key !== key) return e;
        const room = PHOTO_LIMIT - e.photos.length;
        const chosen = files.slice(0, Math.max(0, room));
        const big = chosen.find((f) => f.size > FILE_MAX_BYTES);
        return {
          ...e,
          photos: [
            ...e.photos,
            ...chosen
              .filter((f) => f.size <= FILE_MAX_BYTES)
              .map((file) => ({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file) })),
          ],
          error:
            files.length > room
              ? `This chapter has ${PHOTO_LIMIT} photos, the most for one chapter. Upload the rest as the next chapter, or as a PDF.`
              : big
                ? `"${big.name}" is ${formatFileSize(big.size)}. The limit is 20 MB per file.`
                : undefined,
        };
      }),
    );
  }

  function movePhoto(key: string, i: number, by: -1 | 1) {
    setEntries((list) =>
      list.map((e) => {
        if (e.key !== key) return e;
        const p = [...e.photos];
        const j = i + by;
        if (j < 0 || j >= p.length) return e;
        [p[i], p[j]] = [p[j]!, p[i]!];
        return { ...e, photos: p };
      }),
    );
  }

  function removePhoto(key: string, i: number) {
    setEntries((list) =>
      list.map((e) => {
        if (e.key !== key) return e;
        URL.revokeObjectURL(e.photos[i]!.url);
        return { ...e, photos: e.photos.filter((_, j) => j !== i), error: undefined };
      }),
    );
  }

  const problems = entries.flatMap((e, i) => {
    const name = e.kind === 'pdf' ? `"${e.pdf?.name}"` : `Chapter ${e.number || i + 1} (photos)`;
    const out: string[] = [];
    if (!/^\d{1,3}$/.test(e.number) || Number(e.number) < 1) out.push(`${name} needs a chapter number.`);
    else if (taken.includes(Number(e.number)) || entries.some((o) => o !== e && o.number === e.number)) {
      out.push(`${name}: chapter ${e.number} is already used. Choose another number.`);
    }
    if (!e.title.trim()) out.push(`${name} needs a chapter title.`);
    if (e.kind === 'photos' && e.photos.length === 0) out.push(`${name} needs at least one photo.`);
    return out;
  });

  async function save(publish: boolean) {
    setError(null);
    if (!entries.length) return setError('Add at least one chapter.');
    if (problems.length) return setError(`Can't save yet: ${problems.join(' ')}`);
    if (entries.some((e) => e.kind === 'pdf' && e.error && !e.error.startsWith('Upload')))
      return setError('Remove or fix the files marked above.');
    if (!confirmed) return setError('Please tick the box to confirm you may use this material.');
    setBusy(true);
    let target = bookId;
    if (target === 'new') {
      const made = await createChapterBookAction({ title: newTitle, subject: newSubject, childIds: newKids });
      if (!made.ok) {
        setBusy(false);
        return setError(made.message);
      }
      target = made.bookId;
      setBookId(target);
    }
    let saved = 0;
    const left: Entry[] = [];
    for (const [i, e] of entries.entries()) {
      const tag = `Uploading ${i + 1} of ${entries.length}`;
      update(e.key, { progress: tag, error: undefined });
      const start = await startChapterAction(target, {
        number: Number(e.number),
        title: e.title,
        description: e.description,
        origin: e.origin,
      });
      if (!start.ok) {
        update(e.key, { progress: undefined, error: start.message });
        left.push(e);
        continue;
      }
      const files = e.kind === 'pdf' ? [e.pdf!] : e.photos.map((p) => p.file);
      const ids: string[] = [];
      let failed: string | null = null;
      for (const [n, f] of files.entries()) {
        update(e.key, { progress: `${tag} · file ${n + 1} of ${files.length}` });
        const sent = await sendInPieces(f);
        if (!sent.ok) {
          failed = `${f.name}: ${sent.message}`;
          break;
        }
        const added = await addChapterFileAction(start.chapterId, sent.uploadId);
        if (!added.ok) {
          failed = `${f.name}: ${added.message}`;
          break;
        }
        ids.push(added.fileId);
      }
      const finished = failed ? null : await finishChapterAction(target, start.chapterId, ids);
      if (failed || !finished?.ok) {
        await discardChapterAction(start.chapterId);
        update(e.key, {
          progress: undefined,
          error: `Upload failed, nothing of this chapter was kept. ${failed ?? (finished && !finished.ok ? finished.message : '')} You can retry it on its own.`,
        });
        left.push(e);
        continue;
      }
      saved += 1;
    }
    if (publish && saved > 0) {
      const p = await publishBookAction(target, true);
      if (!p.ok) setError(p.message);
    }
    setBusy(false);
    if (left.length === 0) {
      router.push(`/parent/content/books/${target}?saved=${publish ? 'published' : 'draft'}`);
      return;
    }
    setEntries((list) => list.filter((e) => left.some((l) => l.key === e.key)));
    router.refresh();
    if (saved)
      setError(`${saved} saved. The chapters still listed were not saved; check the message on each and retry.`);
  }

  const order = [
    ...taken.map((n) => ({ n, label: `Chapter ${n}`, isNew: false, photos: 0 })),
    ...entries
      .filter((e) => Number(e.number) > 0)
      .map((e) => ({
        n: Number(e.number),
        label: e.title || '[Title you type]',
        isNew: true,
        photos: e.kind === 'photos' ? e.photos.length : 0,
      })),
  ].sort((a, b) => a.n - b.n);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save(true);
      }}
    >
      <Panel id={`${uid}-book`} title="1 · Which book?" level={2}>
        <SelectField
          name="book"
          label="Book"
          value={bookId}
          onChange={setBookId}
          options={[
            ...books.map((b) => [b.id, `${b.title} · ${b.numbers.length} chapters`] as const),
            ['new', 'Start a new book'] as const,
          ]}
          hint="Only books made of separate chapters are listed; a complete-book PDF can't be added to them."
        />
        {book ? (
          <p className="m-0 text-[15px] text-on-surface-variant">
            {SUBJECTS[book.subject].name} · for {book.childNames.join(', ') || 'no child yet'} · separate chapters
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-title`} className={LABEL}>
                Book title
              </label>
              <input
                id={`${uid}-title`}
                className={cx(INPUT, 'min-h-12')}
                maxLength={200}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
            <SelectField
              name="subject"
              label="Subject"
              value={newSubject}
              onChange={setNewSubject}
              options={[['', 'Choose a subject'], ...Object.entries(SUBJECTS).map(([id, s]) => [id, s.name] as const)]}
            />
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className={cx(LABEL, 'mb-2')}>Who can read this book</legend>
              <div className="flex flex-wrap gap-2">
                {kids.map((k) => (
                  <TickCard
                    key={k.id}
                    checked={newKids.includes(k.id)}
                    onChange={(e) =>
                      setNewKids((ids) => (e.target.checked ? [...ids, k.id] : ids.filter((x) => x !== k.id)))
                    }
                    className="min-w-[200px]"
                  >
                    <strong>{k.name}</strong> · Grade {k.grade}
                  </TickCard>
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </Panel>

      <Panel
        id={`${uid}-add`}
        title="2 · Add the chapters"
        intro="Each chapter is a PDF, or photos of its pages. PDFs are kept exactly as uploaded; photos are converted to JPEG and their location and camera details removed."
        level={2}
      >
        <div className="flex flex-col gap-3 rounded-[20px] border-2 border-dashed border-outline p-4">
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex min-h-12 cursor-pointer items-center rounded-full border-2 border-primary bg-primary px-[22px] font-bold text-on-primary has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
              Choose PDFs
              <input
                type="file"
                multiple
                accept=".pdf,application/pdf"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  void addPdfs(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <Button variant="secondary" onClick={addPhotoChapter} inactive={busy}>
              Add a chapter from photos
            </Button>
          </div>
          <p className="m-0 text-sm leading-5 text-on-surface-variant">
            PDF: one file per chapter · Photos: JPG, PNG, WebP or iPhone HEIC, one photo per page, up to {PHOTO_LIMIT}{' '}
            per chapter · up to 20 MB per file. A PDF uses about a tenth of the space of photos, so use one if you have
            it.
          </p>
        </div>

        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {entries.map((e) => (
            <li key={e.key}>
              <EntryCard
                entry={e}
                busy={busy}
                onChange={(patch) => update(e.key, patch)}
                onRemove={() => {
                  e.photos.forEach((p) => URL.revokeObjectURL(p.url));
                  setEntries((list) => list.filter((x) => x.key !== e.key));
                }}
                onAddPhotos={(files) => addPhotos(e.key, files)}
                onMove={(i, by) => movePhoto(e.key, i, by)}
                onRemovePhoto={(i) => removePhoto(e.key, i)}
              />
            </li>
          ))}
        </ol>
      </Panel>

      {entries.length ? (
        <Panel id={`${uid}-order`} title="3 · Order" intro="Chapters are shown in number order." level={2}>
          <ol className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Chapters in this book">
            {order.map((o, i) => (
              <li key={`${o.n}-${i}`} className="flex flex-wrap items-center gap-2 text-[15px]">
                <span className="w-10 font-bold">{o.n}</span>
                <span>{o.label}</span>
                {o.isNew ? (
                  <span className="rounded-full bg-primary-fixed/40 px-2 text-xs font-bold">
                    new{o.photos ? ` · ${o.photos} photos` : ''}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <div className="flex flex-col gap-4">
        <TickCard checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>
          I confirm I am allowed to upload and use this material for my children’s education. It stays private to my
          family on AA Pro.
        </TickCard>
        {error ? (
          <p
            role="alert"
            className="m-0 rounded-[16px] border border-error-border bg-error-container px-4 py-3 text-[15px] leading-6 text-on-error-container"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" inactive={busy}>
            Save and publish {entries.length} {entries.length === 1 ? 'chapter' : 'chapters'}
          </Button>
          <Button variant="secondary" inactive={busy} onClick={() => void save(false)}>
            Save as draft
          </Button>
          <Link href="/parent/content" className="inline-flex min-h-12 items-center px-3 font-bold">
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}

function EntryCard({
  entry: e,
  busy,
  onChange,
  onRemove,
  onAddPhotos,
  onMove,
  onRemovePhoto,
}: {
  entry: Entry;
  busy: boolean;
  onChange: (patch: Partial<Entry>) => void;
  onRemove: () => void;
  onAddPhotos: (files: FileList | null) => void;
  onMove: (i: number, by: -1 | 1) => void;
  onRemovePhoto: (i: number) => void;
}) {
  const id = useId();
  const photoBytes = e.photos.reduce((n, p) => n + p.file.size, 0);
  return (
    <article
      aria-labelledby={`${id}-name`}
      data-testid="chapter-entry"
      className="flex flex-col gap-4 rounded-[20px] border border-card-border bg-surface-container-lowest p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p id={`${id}-name`} className="m-0 break-all text-[15px]">
          {e.kind === 'pdf' ? (
            <>
              <strong>{e.pdf?.name}</strong> · {formatFileSize(e.pdf?.size ?? 0)}
              {e.pdfInfo ? ` · ${e.pdfInfo}` : ''}
            </>
          ) : (
            <>
              <strong>Photos of the pages</strong> · {e.photos.length} {e.photos.length === 1 ? 'photo' : 'photos'}
              {e.photos.length ? ` · ${formatFileSize(photoBytes)} before conversion` : ''}
            </>
          )}
        </p>
        <Button variant="danger" onClick={onRemove} inactive={busy} aria-label={`Remove ${e.title || 'this chapter'}`}>
          Remove
        </Button>
      </div>
      {e.kind === 'photos' ? (
        <div className="flex flex-col gap-2">
          <ol className="m-0 flex list-none flex-wrap gap-3 p-0" aria-label="Pages in order">
            {e.photos.map((p, i) => (
              <li key={p.key} className="flex w-[148px] flex-col items-center gap-1" data-testid="photo-page">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, never uploaded as is */}
                <img
                  src={p.url}
                  alt={`Page ${i + 1}: ${p.file.name}`}
                  className="h-[180px] w-[136px] rounded-[10px] border border-card-border object-cover"
                />
                <span className="text-sm font-bold">Page {i + 1}</span>
                <span className="flex flex-wrap justify-center gap-1">
                  <button
                    type="button"
                    className="min-h-11 min-w-11 rounded-full border border-outline font-bold hover:bg-surface-container-low disabled:opacity-40"
                    aria-label={`Move page ${i + 1} earlier`}
                    disabled={i === 0 || busy}
                    onClick={() => onMove(i, -1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="min-h-11 min-w-11 rounded-full border border-outline font-bold hover:bg-surface-container-low disabled:opacity-40"
                    aria-label={`Move page ${i + 1} later`}
                    disabled={i === e.photos.length - 1 || busy}
                    onClick={() => onMove(i, 1)}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className="min-h-11 w-full rounded-full px-2 font-bold text-on-error-container hover:bg-error-container"
                    aria-label={`Remove page ${i + 1}`}
                    disabled={busy}
                    onClick={() => onRemovePhoto(i)}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ol>
          {e.photos.length < PHOTO_LIMIT ? (
            <label className="inline-flex min-h-12 cursor-pointer items-center self-start rounded-full border-2 border-outline bg-surface-container-lowest px-[22px] font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-primary">
              + Add photos
              <input
                type="file"
                multiple
                accept={PHOTO_TYPES}
                className="sr-only"
                disabled={busy}
                onChange={(ev) => {
                  onAddPhotos(ev.target.files);
                  ev.target.value = '';
                }}
              />
            </label>
          ) : null}
          <p className="m-0 text-sm leading-5 text-on-surface-variant">
            Pages show in this order. iPhone photos are converted to JPEG. Take each photo flat and in good light so
            it’s readable.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-no`} className={LABEL}>
            Chapter no.
          </label>
          <input
            id={`${id}-no`}
            inputMode="numeric"
            className={cx(INPUT_FIT, 'min-h-12 w-24')}
            value={e.number}
            onChange={(ev) => onChange({ number: ev.target.value.replace(/\D/g, '').slice(0, 3) })}
          />
        </div>
        <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <label htmlFor={`${id}-title`} className={LABEL}>
            Chapter title
          </label>
          <input
            id={`${id}-title`}
            className={cx(INPUT, 'min-h-12')}
            maxLength={200}
            value={e.title}
            aria-describedby={`${id}-title-hint`}
            onChange={(ev) => onChange({ title: ev.target.value, origin: 'typed' })}
          />
          <span id={`${id}-title-hint`} className="text-sm leading-5 text-on-surface-variant">
            {e.origin === 'file_name'
              ? 'Suggested from the file name — please check. Use the title printed in the book.'
              : e.kind === 'photos'
                ? 'Photos have no useful name, so nothing is suggested. Type it from the book.'
                : e.title
                  ? 'Use the title printed in the book.'
                  : "The file name doesn't look like a chapter title, so nothing is suggested. Type it from the book."}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-desc`} className={LABEL}>
          Description (optional)
        </label>
        <textarea
          id={`${id}-desc`}
          className={cx(INPUT, 'min-h-20 py-3')}
          maxLength={500}
          value={e.description}
          onChange={(ev) => onChange({ description: ev.target.value })}
        />
        <span className="text-sm leading-5 text-on-surface-variant">
          Up to 500 characters · {e.description.length} used
        </span>
      </div>
      {e.progress ? (
        <p role="status" className="m-0 text-[15px]">
          {e.progress}…
        </p>
      ) : null}
      {e.error ? (
        <p role="alert" className="m-0 font-bold text-on-error-container">
          {e.error}
        </p>
      ) : null}
    </article>
  );
}
