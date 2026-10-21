/**
 * Chapter suggestions for parents' books (CR-17 PR B1; B-1, B-2). Runs in the parent's browser
 * with pdf.js; the book does not leave AA Pro for this, and nothing is saved until the parent has
 * checked and confirmed every name and page range. No AI and no OCR: only the PDF's own
 * bookmarks (outline) or the text of a readable contents page. A scanned book has neither, so
 * nothing is suggested. Titles come from the book; nothing is invented (OC-63).
 *
 * The functions take a small slice of pdf.js's document interface, so they can be tested with
 * fakes and used with the real library.
 */

export type Found = 'bookmarks' | 'contents';

export interface Suggestion {
  number: number;
  title: string;
  firstPage: number;
  lastPage: number;
  origin: Found;
  /** The contents page gave a title but no usable page: the parent must check it. */
  needsCheck?: boolean;
}

export interface PdfDocLike {
  numPages: number;
  getOutline(): Promise<Array<{ title: string; dest: unknown; items?: unknown[] }> | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  getPageLabels(): Promise<string[] | null>;
  getPage(
    n: number,
  ): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean; transform?: number[] }> }> }>;
}

const clean = (s: string) =>
  s
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

/** Turns starting pages into ranges: each chapter ends where the next begins. */
export function toRanges(
  starts: Array<{ title: string; firstPage: number; needsCheck?: boolean }>,
  numPages: number,
  origin: Found,
): Suggestion[] {
  const sorted = starts
    .filter((s) => s.firstPage >= 1 && s.firstPage <= numPages && s.title)
    .sort((a, b) => a.firstPage - b.firstPage)
    .filter((s, i, all) => i === 0 || s.firstPage !== all[i - 1]!.firstPage);
  return sorted.map((s, i) => ({
    number: i + 1,
    title: s.title,
    firstPage: s.firstPage,
    lastPage: i + 1 < sorted.length ? sorted[i + 1]!.firstPage - 1 : numPages,
    origin,
    ...(s.needsCheck ? { needsCheck: true } : {}),
  }));
}

/** Top-level bookmarks with a page each. Fewer than two usable bookmarks suggests nothing. */
export async function fromBookmarks(doc: PdfDocLike): Promise<Suggestion[]> {
  const outline = await doc.getOutline().catch(() => null);
  if (!outline || outline.length < 2) return [];
  const starts: Array<{ title: string; firstPage: number }> = [];
  for (const item of outline.slice(0, 200)) {
    try {
      const dest =
        typeof item.dest === 'string' ? await doc.getDestination(item.dest) : (item.dest as unknown[] | null);
      if (!dest || !dest[0]) continue;
      const ref = dest[0];
      const index = typeof ref === 'number' ? ref : await doc.getPageIndex(ref);
      starts.push({ title: clean(item.title ?? ''), firstPage: index + 1 });
    } catch {
      // A bookmark without a page is skipped.
    }
  }
  const r = toRanges(starts, doc.numPages, 'bookmarks');
  return r.length >= 2 ? r : [];
}

/**
 * Lines of a contents page: "1 Plants around us .... 12", "Chapter 3: Fractions 45",
 * "4. Light 61". Returns the title and the printed page number.
 */
export function parseContentsLines(lines: string[]): Array<{ title: string; printed: number }> {
  const out: Array<{ title: string; printed: number }> = [];
  const re = /^(?:(?:chapter|unit|lesson|ch\.?)\s*)?(\d{1,3})?[\s.):–-]*([^\d].*?)[\s.·…_-]{1,}(\d{1,4})$/i;
  for (const raw of lines) {
    const line = clean(raw);
    if (line.length < 4 || line.length > 160) continue;
    const m = line.match(re);
    if (!m) continue;
    const title = clean(m[2]!.replace(/[.·…_]{2,}.*$/, ''));
    const printed = Number(m[3]);
    if (title.length < 2 || /^(page|contents|index)$/i.test(title)) continue;
    out.push({ title, printed });
  }
  // Keep the longest run of increasing page numbers (a contents page lists pages in order).
  const run: Array<{ title: string; printed: number }> = [];
  for (const e of out) if (!run.length || e.printed > run[run.length - 1]!.printed) run.push(e);
  return run.length >= 2 ? run : [];
}

async function pageLines(doc: PdfDocLike, n: number): Promise<string[]> {
  const page = await doc.getPage(n);
  const content = await page.getTextContent();
  const lines: string[] = [];
  let current = '';
  let lastY: number | null = null;
  for (const it of content.items) {
    const y = it.transform?.[5] ?? null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && current) {
      lines.push(current);
      current = '';
    }
    current += `${current && !current.endsWith(' ') ? ' ' : ''}${it.str ?? ''}`;
    if (it.hasEOL) {
      lines.push(current);
      current = '';
    }
    lastY = y;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * A readable contents page in the first pages. Printed page numbers are matched to PDF pages
 * with the PDF's page labels, else by finding the first chapter's title on a later page; if
 * neither works the printed numbers are used and every row is marked for checking.
 */
export async function fromContentsPage(
  doc: PdfDocLike,
  scanPages = 15,
): Promise<{ suggestions: Suggestion[]; offset: number | null }> {
  const last = Math.min(scanPages, doc.numPages);
  for (let p = 1; p <= last; p++) {
    let entries: Array<{ title: string; printed: number }>;
    try {
      entries = parseContentsLines(await pageLines(doc, p));
    } catch {
      continue;
    }
    if (entries.length < 2) continue;
    // 1. Page labels ("1", "2" … printed on the pages).
    const labels = await doc.getPageLabels().catch(() => null);
    let offset: number | null = null;
    if (labels) {
      const i = labels.findIndex((l) => l === String(entries[0]!.printed));
      if (i >= 0) offset = i + 1 - entries[0]!.printed;
    }
    // 2. The first title printed on a later page.
    if (offset === null) {
      const want = entries[0]!.title.toLowerCase();
      for (let q = p + 1; q <= Math.min(doc.numPages, p + 60); q++) {
        try {
          const text = (await pageLines(doc, q)).join(' ').toLowerCase();
          if (text.includes(want)) {
            offset = q - entries[0]!.printed;
            break;
          }
        } catch {
          break;
        }
      }
    }
    const shift = offset ?? 0;
    const suggestions = toRanges(
      entries.map((e) => ({ title: e.title, firstPage: e.printed + shift, needsCheck: offset === null })),
      doc.numPages,
      'contents',
    );
    if (suggestions.length >= 2) return { suggestions, offset: offset === null ? null : 1 + shift };
  }
  return { suggestions: [], offset: null };
}

/** Bookmarks first, otherwise a contents page, otherwise nothing (B-1). */
export async function suggestChapters(
  doc: PdfDocLike,
): Promise<{ method: Found | null; suggestions: Suggestion[]; offset: number | null }> {
  const marks = await fromBookmarks(doc);
  if (marks.length) return { method: 'bookmarks', suggestions: marks, offset: null };
  const contents = await fromContentsPage(doc);
  if (contents.suggestions.length) return { method: 'contents', ...contents };
  return { method: null, suggestions: [], offset: null };
}

/**
 * Board B2: a chapter number and title suggested from a file name, for the parent to check:
 * "Ch 3 Fractions.pdf" → 3, "Fractions"; "chapter_04_decimals.pdf" → 4, "decimals". A name that
 * is only a camera or scanner name ("scan_0043.pdf", "IMG_2041.jpg") suggests no title.
 */
export function fromFileName(name: string): { number: number | null; title: string | null } {
  let stem = name
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let number: number | null = null;
  const lead = stem.match(/^(?:ch(?:apter)?|unit|lesson)\.?\s*0*(\d{1,3})\b[\s.:–-]*/i);
  if (lead) {
    number = Number(lead[1]);
    stem = stem.slice(lead[0].length).trim();
  }
  if (!stem || /^(scan|img|image|dsc|photo|pxl|document|doc|file|page)\s*\d*$/i.test(stem) || !/\p{L}/u.test(stem)) {
    return { number, title: null };
  }
  return { number, title: stem.slice(0, 200) };
}
