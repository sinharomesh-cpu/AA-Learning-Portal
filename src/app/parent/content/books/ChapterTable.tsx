'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { INPUT, INPUT_FIT } from '@/components/ui/styles';
import { cx } from '@/lib/cx';
import { drawPage } from '@/lib/pdfClient';

export interface Row {
  key: string;
  number: string;
  title: string;
  firstPage: string;
  lastPage: string;
  origin: 'bookmarks' | 'contents' | 'typed';
  needsCheck: boolean;
}

const ORIGIN: Record<Row['origin'], string> = { bookmarks: 'Bookmarks', contents: 'Contents page', typed: 'Typed' };

export function rowsToChapters(rows: Row[]) {
  return rows.map((r) => ({
    number: Number(r.number),
    title: r.title,
    firstPage: Number(r.firstPage),
    lastPage: Number(r.lastPage),
    origin: r.origin,
  }));
}

/** Pages not in any chapter, as "1–4 and 71–120". */
export function uncovered(rows: Row[], pageCount: number): string {
  const used = new Array<boolean>(pageCount + 1).fill(false);
  for (const r of rows) {
    const a = Number(r.firstPage);
    const b = Number(r.lastPage);
    if (Number.isInteger(a) && Number.isInteger(b))
      for (let p = Math.max(1, a); p <= Math.min(pageCount, b); p++) used[p] = true;
  }
  const out: string[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (used[p]) continue;
    let q = p;
    while (q + 1 <= pageCount && !used[q + 1]) q++;
    out.push(p === q ? `${p}` : `${p}–${q}`);
    p = q;
  }
  return out.length > 1 ? `${out.slice(0, -1).join(', ')} and ${out.at(-1)}` : (out[0] ?? '');
}

const SMALL = cx(INPUT_FIT, 'min-h-11 w-20 px-3 max-sm:block max-sm:w-full');

/**
 * The chapter list the parent checks and edits (board B1; the approved R7 actions: merge,
 * split, remove, add). Suggestions are marked with where they came from; a title edited by the
 * parent becomes "Typed". Nothing here is saved by itself.
 */
export function ChapterTable({
  rows,
  pageCount,
  errorIndex,
  onChange,
}: {
  rows: Row[];
  pageCount: number;
  errorIndex?: number;
  onChange: (rows: Row[]) => void;
}) {
  const uid = useId();
  const set = (i: number, patch: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const renumber = (list: Row[]) => list.map((r, j) => ({ ...r, number: String(j + 1) }));
  const free = uncovered(rows, pageCount);
  return (
    <div className="flex flex-col gap-3">
      <div
        role="region"
        aria-label="Chapters to save, scrollable"
        tabIndex={0}
        className="overflow-x-auto rounded-[20px] max-sm:overflow-visible border border-card-border focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-primary"
      >
        <table className="w-full border-collapse text-[15px] max-sm:block sm:min-w-[720px]">
          <caption className="sr-only">Chapters to save</caption>
          <thead className="bg-surface-container-low text-left text-sm max-sm:hidden">
            <tr>
              <th scope="col" className="px-3 py-2">
                No.
              </th>
              <th scope="col" className="px-3 py-2">
                Chapter title
              </th>
              <th scope="col" className="px-3 py-2">
                First PDF page
              </th>
              <th scope="col" className="px-3 py-2">
                Last PDF page
              </th>
              <th scope="col" className="px-3 py-2">
                Found from
              </th>
              <th scope="col" className="px-3 py-2">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {rows.map((r, i) => {
              const label = `chapter ${r.number || i + 1}`;
              return (
                <tr
                  key={r.key}
                  data-testid="chapter-row"
                  className={cx(
                    'border-t border-card-border max-sm:grid max-sm:grid-cols-3 max-sm:gap-x-2 max-sm:gap-y-1 max-sm:p-3',
                    errorIndex === i && 'bg-error-container',
                  )}
                >
                  <td className="px-3 py-2 max-sm:p-0">
                    <span aria-hidden="true" className="text-xs font-bold sm:hidden">
                      No.
                    </span>
                    <input
                      aria-label={`Number of ${label}`}
                      className={SMALL}
                      inputMode="numeric"
                      value={r.number}
                      onChange={(e) => set(i, { number: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                    />
                  </td>
                  <td className="px-3 py-2 max-sm:order-first max-sm:col-span-3 max-sm:p-0">
                    <span aria-hidden="true" className="text-xs font-bold sm:hidden">
                      Chapter title
                    </span>
                    <input
                      aria-label={`Title of ${label}`}
                      className={cx(INPUT, 'min-h-11 sm:min-w-[220px]')}
                      maxLength={200}
                      value={r.title}
                      placeholder="Type it from the book"
                      aria-invalid={!r.title.trim() || undefined}
                      onChange={(e) => set(i, { title: e.target.value, origin: 'typed' })}
                    />
                    {!r.title.trim() ? (
                      <span className="mt-1 block text-sm text-on-error-container">
                        No title found. Type it from the book.
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 max-sm:p-0">
                    <span aria-hidden="true" className="text-xs font-bold sm:hidden">
                      First page
                    </span>
                    <input
                      aria-label={`First PDF page of ${label}`}
                      className={SMALL}
                      inputMode="numeric"
                      value={r.firstPage}
                      onChange={(e) =>
                        set(i, { firstPage: e.target.value.replace(/\D/g, '').slice(0, 4), needsCheck: false })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 max-sm:p-0">
                    <span aria-hidden="true" className="text-xs font-bold sm:hidden">
                      Last page
                    </span>
                    <input
                      aria-label={`Last PDF page of ${label}`}
                      className={SMALL}
                      inputMode="numeric"
                      value={r.lastPage}
                      onChange={(e) =>
                        set(i, { lastPage: e.target.value.replace(/\D/g, '').slice(0, 4), needsCheck: false })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-sm max-sm:col-span-3 max-sm:p-0">
                    {ORIGIN[r.origin]}
                    {r.needsCheck ? (
                      <span className="block text-on-warning-container">page only, please check</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 max-sm:col-span-3 max-sm:p-0">
                    <div className="flex flex-wrap gap-1">
                      {i + 1 < rows.length ? (
                        <button
                          type="button"
                          className="min-h-11 rounded-full px-3 font-bold text-primary hover:bg-surface-container-low"
                          aria-label={`Merge ${label} with the next chapter`}
                          onClick={() => {
                            const next = rows[i + 1]!;
                            const merged = [...rows];
                            merged.splice(i, 2, { ...r, lastPage: next.lastPage });
                            onChange(renumber(merged));
                          }}
                        >
                          Merge ↓
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="min-h-11 rounded-full px-3 font-bold text-primary hover:bg-surface-container-low"
                        aria-label={`Split ${label} in two`}
                        onClick={() => {
                          const a = Number(r.firstPage);
                          const b = Number(r.lastPage);
                          if (!(b > a)) return;
                          const mid = Math.floor((a + b) / 2);
                          const copy = [...rows];
                          copy.splice(
                            i,
                            1,
                            { ...r, lastPage: String(mid) },
                            {
                              key: crypto.randomUUID(),
                              number: '',
                              title: '',
                              firstPage: String(mid + 1),
                              lastPage: String(b),
                              origin: 'typed',
                              needsCheck: false,
                            },
                          );
                          onChange(renumber(copy));
                        }}
                      >
                        Split
                      </button>
                      <button
                        type="button"
                        className="min-h-11 rounded-full px-3 font-bold text-on-error-container hover:bg-error-container"
                        aria-label={`Remove ${label}`}
                        onClick={() => onChange(renumber(rows.filter((_, j) => j !== i)))}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            const last = rows.at(-1);
            const start = last ? Math.min(pageCount, Number(last.lastPage) + 1 || 1) : 1;
            onChange([
              ...rows,
              {
                key: crypto.randomUUID(),
                number: String(rows.length + 1),
                title: '',
                firstPage: String(start),
                lastPage: String(pageCount),
                origin: 'typed',
                needsCheck: false,
              },
            ]);
          }}
        >
          Add a chapter
        </Button>
        <span id={`${uid}-free`} className="text-sm leading-5 text-on-surface-variant">
          {free
            ? `Pages in no chapter: ${free}. They stay in the PDF; add a chapter for them if you need it.`
            : 'Every page is in a chapter.'}
        </span>
      </div>
    </div>
  );
}

/** A page of the PDF drawn on this device, to check where chapters start (scanned books too). */
export function PagePreview({ doc, pageCount }: { doc: PDFDocumentProxy; pageCount: number }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!open || !canvas.current) return;
    let cancel: (() => void) | null = null;
    void drawPage(doc, page, canvas.current, 320)
      .then((c) => {
        cancel = c;
      })
      .catch(() => {});
    return () => cancel?.();
  }, [doc, page, open]);
  if (!open) {
    return (
      <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        Show page preview
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-[20px] border border-card-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
          ‹
        </Button>
        <label htmlFor={id} className="text-[15px]">
          PDF page
        </label>
        <input
          id={id}
          type="number"
          min={1}
          max={pageCount}
          value={page}
          onChange={(e) => setPage(Math.max(1, Math.min(pageCount, Number(e.target.value) || 1)))}
          className={cx(INPUT_FIT, 'min-h-11 w-24')}
        />
        <span className="text-[15px]">of {pageCount}</span>
        <Button variant="secondary" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} aria-label="Next page">
          ›
        </Button>
      </div>
      <canvas
        ref={canvas}
        aria-label={`PDF page ${page}`}
        className="self-start rounded-[12px] border border-card-border"
      />
    </div>
  );
}
