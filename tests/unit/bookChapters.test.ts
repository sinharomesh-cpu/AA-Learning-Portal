import { describe, expect, it } from 'vitest';
import {
  fromBookmarks,
  fromContentsPage,
  fromFileName,
  parseContentsLines,
  type PdfDocLike,
  suggestChapters,
  toRanges,
} from '@/lib/bookChapters';

/** B-1: chapter suggestions are made from the PDF itself only; the parent always confirms. */

function fakeDoc(o: {
  pages: string[][];
  outline?: Array<{ title: string; page: number }>;
  labels?: string[];
}): PdfDocLike {
  return {
    numPages: o.pages.length,
    getOutline: async () => (o.outline ? o.outline.map((x) => ({ title: x.title, dest: [{ num: x.page }] })) : null),
    getDestination: async () => null,
    getPageIndex: async (ref) => (ref as { num: number }).num - 1,
    getPageLabels: async () => o.labels ?? null,
    getPage: async (n) => ({
      getTextContent: async () => ({ items: (o.pages[n - 1] ?? []).map((str) => ({ str, hasEOL: true })) }),
    }),
  };
}

const blank = (n: number) => Array.from({ length: n }, () => [] as string[]);

describe('from bookmarks', () => {
  it('turns top-level bookmarks into ranges that end where the next begins', async () => {
    const doc = fakeDoc({
      pages: blank(40),
      outline: [
        { title: ' Plants\n', page: 5 },
        { title: 'Water', page: 21 },
        { title: 'Light', page: 30 },
      ],
    });
    expect(await fromBookmarks(doc)).toEqual([
      { number: 1, title: 'Plants', firstPage: 5, lastPage: 20, origin: 'bookmarks' },
      { number: 2, title: 'Water', firstPage: 21, lastPage: 29, origin: 'bookmarks' },
      { number: 3, title: 'Light', firstPage: 30, lastPage: 40, origin: 'bookmarks' },
    ]);
  });

  it('suggests nothing from fewer than two bookmarks', async () => {
    expect(await fromBookmarks(fakeDoc({ pages: blank(10), outline: [{ title: 'Only', page: 2 }] }))).toEqual([]);
  });
});

describe('from a contents page', () => {
  it('reads common contents lines and keeps them in page order', () => {
    expect(
      parseContentsLines([
        'Contents',
        '1 Plants around us ........ 1',
        'Chapter 2: Water 14',
        '3. Light · · · 27',
        'Page 99',
        'Index 120',
      ]),
    ).toEqual([
      { title: 'Plants around us', printed: 1 },
      { title: 'Water', printed: 14 },
      { title: 'Light', printed: 27 },
    ]);
  });

  it('lines printed pages up with PDF pages by page labels or by finding the first title', async () => {
    const pages = blank(50);
    pages[1] = ['Contents', '1 Plants around us .... 1', '2 Water .... 14'];
    const labels = ['i', 'ii', 'iii', 'iv', ...Array.from({ length: 46 }, (_, i) => String(i + 1))];
    const byLabels = await fromContentsPage(fakeDoc({ pages, labels }));
    expect(byLabels.offset).toBe(5);
    expect(byLabels.suggestions.map((s) => [s.firstPage, s.lastPage])).toEqual([
      [5, 17],
      [18, 50],
    ]);
    const withTitle = [...pages];
    withTitle[6] = ['Plants around us'];
    const byTitle = await fromContentsPage(fakeDoc({ pages: withTitle }));
    expect(byTitle.suggestions[0]).toMatchObject({ firstPage: 7, origin: 'contents' });
    expect(byTitle.suggestions[0]).not.toHaveProperty('needsCheck');
    const unknown = await fromContentsPage(fakeDoc({ pages }));
    expect(unknown.offset).toBeNull();
    expect(unknown.suggestions[0]).toMatchObject({ firstPage: 1, needsCheck: true });
  });

  it('a scanned book (no text, no bookmarks) gets no suggestion', async () => {
    expect(await suggestChapters(fakeDoc({ pages: blank(30) }))).toEqual({
      method: null,
      suggestions: [],
      offset: null,
    });
  });
});

describe('ranges and file names', () => {
  it('drops pages outside the book and repeated starts', () => {
    expect(
      toRanges(
        [
          { title: 'A', firstPage: 3 },
          { title: 'B', firstPage: 3 },
          { title: 'C', firstPage: 99 },
        ],
        10,
        'bookmarks',
      ),
    ).toEqual([{ number: 1, title: 'A', firstPage: 3, lastPage: 10, origin: 'bookmarks' }]);
  });

  it('suggests a number and title from a file name, and nothing from a camera name', () => {
    expect(fromFileName('Ch 3 Fractions (sample).pdf')).toEqual({ number: 3, title: 'Fractions (sample)' });
    expect(fromFileName('chapter_04_decimals_sample.pdf')).toEqual({ number: 4, title: 'decimals sample' });
    expect(fromFileName('scan_0043.pdf')).toEqual({ number: null, title: null });
    expect(fromFileName('IMG_2041.HEIC')).toEqual({ number: null, title: null });
    expect(fromFileName('Unit 12 - Maps.pdf')).toEqual({ number: 12, title: 'Maps' });
  });
});
