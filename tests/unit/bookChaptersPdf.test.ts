// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type PdfDocLike, suggestChapters } from '@/lib/bookChapters';

/**
 * BK-2, BK-3, BK-4 with the real pdf.js (its Node build) and the synthetic sample books in
 * tests/fixtures/files (made by make-sample-books.py; invented text only).
 */
async function open(name: string): Promise<PdfDocLike> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(fileURLToPath(new URL(`../fixtures/files/${name}`, import.meta.url))));
  return (await pdfjs.getDocument({ data, enableXfa: false }).promise) as unknown as PdfDocLike;
}

describe('chapter suggestions from real sample PDFs', () => {
  it('BK-2: a PDF with bookmarks suggests its chapters, marked Bookmarks', async () => {
    const r = await suggestChapters(await open('sample-book-bookmarks.pdf'));
    expect(r.method).toBe('bookmarks');
    expect(r.suggestions.map((s) => [s.title, s.firstPage, s.lastPage, s.origin])).toEqual([
      ['Plants around us (sample)', 3, 10, 'bookmarks'],
      ['Water (sample)', 11, 17, 'bookmarks'],
      ['Light (sample)', 18, 24, 'bookmarks'],
    ]);
  });

  it('BK-3: a contents page without bookmarks gives suggestions marked Contents page, on the right PDF pages', async () => {
    const r = await suggestChapters(await open('sample-book-contents.pdf'));
    expect(r.method).toBe('contents');
    expect(r.offset).toBe(4);
    expect(r.suggestions.map((s) => [s.title, s.firstPage, s.lastPage, s.origin, s.needsCheck ?? false])).toEqual([
      ['Counting in groups', 4, 8, 'contents', false],
      ['Sharing equally', 9, 14, 'contents', false],
      ['Shapes and sides', 15, 20, 'contents', false],
    ]);
  });

  it('BK-4: a picture-only PDF suggests nothing', async () => {
    expect(await suggestChapters(await open('sample-book-scanned.pdf'))).toEqual({
      method: null,
      suggestions: [],
      offset: null,
    });
  });

  it('SEC-15: a PDF carrying a script, actions and an attachment is read for chapters without running anything', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(
      readFileSync(fileURLToPath(new URL('../fixtures/files/sample-book-scripted.pdf', import.meta.url))),
    );
    const doc = await pdfjs.getDocument({ data, enableXfa: false }).promise;
    // The sample really is hostile: pdf.js can see its script and attachment...
    const actions = (await doc.getJSActions()) ?? new Map();
    expect(JSON.stringify([...actions.entries()])).toContain('SCRIPT RAN');
    expect([...((await doc.getAttachments()) ?? new Map()).keys()]).toEqual(['readme.txt']);
    // ...and still only reads its bookmarks. pdf.js runs PDF scripts only through its separate
    // scripting sandbox, which AA Pro never loads.
    const r = await suggestChapters(doc as unknown as PdfDocLike);
    expect(r.suggestions.map((x) => x.title)).toEqual(['Chapter one (sample)', 'Chapter two (sample)']);
    expect(Object.keys(pdfjs)).not.toContain('ScriptingManager');
  });
});
