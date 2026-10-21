import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * CR-17 PR B1 (boards B1, B2) with real sign-in, desktop and phone: a parent adds a complete
 * book and splits it from its bookmarks, adds chapters from a PDF and from page photos, and
 * publishes; the child reads it; a linked teacher views it without download; other accounts get
 * "not found" (BK-1 to BK-15, SEC-19, SEC-20). Synthetic sample files and invented accounts only.
 * BK_SHOTS=<folder> saves review screenshots.
 */

const sql = seedDb();
const shots = process.env.BK_SHOTS;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
const fixture = (name: string) => readFileSync(join(process.cwd(), 'tests/fixtures/files', name));

async function pagePhoto(shade: number) {
  return sharp({
    create: {
      width: 600,
      height: 800,
      channels: 3,
      background: { r: 250, g: shade, b: 200 },
      noise: { type: 'gaussian', mean: 128, sigma: 25 },
    },
  })
    .withExif({ IFD0: { Make: 'SampleCam' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '12/1 58/1 0/1' } })
    .png()
    .toBuffer();
}

/** Nothing of the book is kept in the browser's lasting storage (W-6, BK-12). */
async function nothingStored(page: Page) {
  const kept = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    caches: 'caches' in window ? (await caches.keys()).length : 0,
    idb:
      'databases' in indexedDB
        ? (await indexedDB.databases())
            // The development server's own debug channel; not present in a production build.
            .filter((d) => !d.name?.startsWith('__next'))
            .map((d) => d.name)
            .join(',')
        : '',
  }));
  expect(kept).toEqual({ local: 0, session: 0, caches: 0, idb: '' });
}

test('a complete book split from its bookmarks: published, read by the child, viewed by the teacher', async ({
  browser,
}, info) => {
  // Six signed-in people and two uploads: longer than the default 60 s on a busy machine.
  test.setTimeout(180_000);
  const phone = info.project.name === 'phone';
  const parent = await seedParent(sql);
  const child = await seedChild(sql, parent.id);
  const teacher = await seedTeacher(sql);
  const other = await seedTeacher(sql);
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await sql`UPDATE teacher_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${teacher.id}`;
  await sql`UPDATE teacher_student_links SET subjects = ${['maths', 'science']} WHERE teacher_id = ${teacher.id}`;
  await seedActiveLink(sql, other.id, child.id, parent.id); // maths only: never sees a science book

  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent/content');
  await p.getByRole('link', { name: 'Add a book' }).first().click();
  await expect(p.getByRole('heading', { level: 1, name: 'Add a book' })).toBeVisible();
  await p.getByRole('button', { name: /Subject/ }).click();
  await p.getByRole('group', { name: 'Subject' }).getByRole('button', { name: 'Science', exact: true }).click();
  await p.getByLabel(new RegExp(child.name)).check();
  await p.getByLabel('The book’s PDF').setInputFiles({
    name: 'Science sample book.pdf',
    mimeType: 'application/pdf',
    buffer: fixture('sample-book-bookmarks.pdf'),
  });
  await expect(p.getByTestId('pdf-ready')).toContainText('24 pages · text found');
  await expect(p.getByLabel('Book title')).toHaveValue('Science sample book');
  await p.getByRole('radio', { name: /Split in Chapters/ }).check();
  await expect(p.getByText('We suggest 3 chapters.')).toBeVisible();
  const rows = p.getByTestId('chapter-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Bookmarks');
  await expect(p.getByLabel('Title of chapter 1')).toHaveValue('Plants around us (sample)');
  await expect(p.getByLabel('First PDF page of chapter 2')).toHaveValue('11');
  await p.getByLabel('Title of chapter 3').fill('Light and shadows (sample)');
  await expect(rows.nth(2)).toContainText('Typed');
  await expect(p.getByText('Pages in no chapter: 1–2.')).toBeVisible();
  // BK-5: a bad range is refused before anything is saved.
  await p.getByLabel('Last PDF page of chapter 1').fill('12');
  await p.getByLabel(/I confirm I am allowed/).check();
  await noSeriousA11yIssues(p);
  if (phone) await expectNoHorizontalScroll(p);
  await shot(p, phone ? 'B1-split-phone' : 'B1-split-desktop');
  await p.getByRole('button', { name: 'Save and publish' }).click();
  await expect(p.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
    'Chapter 2 shares pages with another chapter.',
  );
  expect(await sql`SELECT 1 FROM books WHERE owner_id = ${parent.id}`).toHaveLength(0);
  await p.getByLabel('Last PDF page of chapter 1').fill('10');
  await p.getByRole('button', { name: 'Save and publish' }).click();
  await expect(p.getByText('Saved and published.')).toBeVisible();
  await expect(p.getByTestId('book-chapter')).toHaveCount(3);
  await expect(p.getByTestId('book-chapter').nth(2)).toContainText('3. Light and shadows (sample) · PDF pages 18–24');
  await shot(p, phone ? 'B1-book-page-phone' : 'B1-book-page-desktop');
  const [book] = await sql<
    { id: string; file_id: string }[]
  >`SELECT id, file_id FROM books WHERE owner_id = ${parent.id}`;

  // The same file again is refused and the existing book offered (BK-8).
  await p.goto('/parent/content/books/new');
  await p.getByLabel('The book’s PDF').setInputFiles({
    name: 'copy.pdf',
    mimeType: 'application/pdf',
    buffer: fixture('sample-book-bookmarks.pdf'),
  });
  await expect(p.getByTestId('pdf-ready')).toBeVisible();
  await p.getByRole('button', { name: /Subject/ }).click();
  await p.getByRole('group', { name: 'Subject' }).getByRole('button', { name: 'Science', exact: true }).click();
  await p.getByRole('radio', { name: /Use as it is/ }).check();
  await p.getByLabel(/I confirm I am allowed/).check();
  await p.getByRole('button', { name: 'Save as draft' }).click();
  await expect(p.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
    'You\'ve already uploaded this file as "Science sample book".',
  );
  await expect(p.getByRole('link', { name: 'Use the existing book' })).toHaveAttribute(
    'href',
    `/parent/content/books/${book!.id}`,
  );

  // The child reads chapter 2 in My library; nothing is kept in lasting storage.
  const k = await (await browser.newContext()).newPage();
  // SEC-15: reading a book makes no request outside AA Pro (pdf.js and its worker are bundled).
  const outside: string[] = [];
  k.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(u.hostname)) outside.push(r.url());
  });
  await childSignIn(k, child.username, child.password);
  await k.goto('/student/library');
  await expect(k.getByTestId('library-book')).toHaveCount(1);
  await noSeriousA11yIssues(k);
  if (phone) await expectNoHorizontalScroll(k);
  await shot(k, phone ? 'B-library-phone' : 'B-library-desktop');
  await k.getByRole('link', { name: '2. Water (sample)' }).click();
  await expect(k.getByRole('heading', { name: 'Chapter 2: Water (sample)' })).toBeVisible();
  await expect(k.getByText('PDF page 11')).toBeVisible();
  await expect(k.getByTestId('book-page')).toBeVisible();
  // The page is really drawn (not an empty canvas).
  await expect
    .poll(() =>
      k.getByTestId('book-page').evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let ink = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 0 && d[i]! < 100) ink++;
        return ink;
      }),
    )
    .toBeGreaterThan(50);
  await k.getByRole('button', { name: 'Next ›' }).click();
  await expect(k.getByText('PDF page 12')).toBeVisible();
  await expect(k.getByRole('link', { name: /Download/ })).toHaveCount(0);
  await noSeriousA11yIssues(k);
  if (phone) await expectNoHorizontalScroll(k);
  await shot(k, phone ? 'B-reader-phone' : 'B-reader-desktop');
  await nothingStored(k);
  expect(outside).toEqual([]);
  // The child can't fetch the whole file or a download (only pages, inside the reader).
  expect((await k.request.get(`/files/${book!.file_id}?download=1`)).status()).toBe(404);

  // The linked science teacher views it from the student's page, without download (BK-10).
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto(`/teacher/students/${child.id}`);
  await t.getByTestId('teacher-book').getByRole('link', { name: 'Science sample book' }).click();
  await expect(t.getByText('Science · view only')).toBeVisible();
  await expect(t.getByTestId('book-page')).toBeVisible();
  await expect(t.getByRole('link', { name: /Download/ })).toHaveCount(0);
  expect((await t.request.get(`/files/${book!.file_id}?download=1`)).status()).toBe(404);
  expect((await t.request.get(`/files/${book!.file_id}`)).status()).toBe(404);
  await t.goto(`/files/${book!.file_id}/view`);
  await expect(t.getByRole('heading', { name: /not found|can't open/i })).toBeVisible();

  // The maths-only teacher, another parent and the Super Admin get "not found" (BK-11, W-5).
  const o = await (await browser.newContext()).newPage();
  await signInAs(o, other.email);
  await o.goto(`/teacher/students/${child.id}`);
  await expect(o.getByTestId('teacher-book')).toHaveCount(0);
  await o.goto(`/books/${book!.id}`);
  await expect(o.getByRole('heading', { name: /not found|can't open/i })).toBeVisible();
  expect((await o.request.get(`/files/${book!.file_id}?outline=1`)).status()).toBe(404);
  const stranger = await seedParent(sql);
  const s = await (await browser.newContext()).newPage();
  await signInAs(s, stranger.email);
  await s.goto(`/books/${book!.id}`);
  await expect(s.getByRole('heading', { name: /not found|can't open/i })).toBeVisible();
  await s.goto(`/parent/content/books/${book!.id}`);
  await expect(s.getByRole('heading', { name: /not found|can't open/i })).toBeVisible();

  // The owner may download the original (OC-41(5)).
  expect((await p.request.get(`/files/${book!.file_id}?download=1`)).status()).toBe(200);
});

test('chapters from a PDF and from page photos; a book used as it is is split later (B-7, B-8)', async ({
  browser,
}, info) => {
  const phone = info.project.name === 'phone';
  const parent = await seedParent(sql);
  const child = await seedChild(sql, parent.id);
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);

  await p.goto('/parent/content/books/chapters');
  await expect(p.getByRole('heading', { level: 1, name: 'Add chapters' })).toBeVisible();
  await p.getByLabel('Book title').fill('Maths workbook (sample)');
  await p.getByRole('button', { name: /Subject/ }).click();
  await p.getByRole('group', { name: 'Subject' }).getByRole('button', { name: 'Maths', exact: true }).click();
  await p.getByLabel(new RegExp(child.name)).check();
  await p.getByLabel('Choose PDFs').setInputFiles({
    name: 'Ch 3 Fractions (sample).pdf',
    mimeType: 'application/pdf',
    buffer: fixture('sample-book-contents.pdf'),
  });
  const entries = p.getByTestId('chapter-entry');
  await expect(entries.nth(0)).toContainText('20 pages · a real PDF');
  await expect(entries.nth(0).getByLabel('Chapter no.')).toHaveValue('3');
  await expect(entries.nth(0).getByLabel('Chapter title')).toHaveValue('Fractions (sample)');
  await expect(entries.nth(0)).toContainText('Suggested from the file name — please check');
  await p.getByRole('button', { name: 'Add a chapter from photos' }).click();
  await entries
    .nth(1)
    .getByLabel('+ Add photos')
    .setInputFiles([
      { name: 'IMG_0001.png', mimeType: 'image/png', buffer: await pagePhoto(10) },
      { name: 'IMG_0002.png', mimeType: 'image/png', buffer: await pagePhoto(90) },
    ]);
  await expect(entries.nth(1).getByTestId('photo-page')).toHaveCount(2);
  await entries.nth(1).getByRole('button', { name: 'Move page 2 earlier' }).click();
  await expect(entries.nth(1).getByRole('img', { name: 'Page 1: IMG_0002.png' })).toBeVisible();
  await expect(entries.nth(1).getByLabel('Chapter no.')).toHaveValue('1');
  await entries.nth(1).getByLabel('Chapter title').fill('Numbers (sample)');
  await p.getByLabel(/I confirm I am allowed/).check();
  await noSeriousA11yIssues(p);
  if (phone) await expectNoHorizontalScroll(p);
  await shot(p, phone ? 'B2-chapters-phone' : 'B2-chapters-desktop');
  await p.getByRole('button', { name: 'Save and publish 2 chapters' }).click();
  await expect(p.getByText('Saved and published.')).toBeVisible({ timeout: 30_000 });
  await expect(p.getByTestId('book-chapter').nth(0)).toContainText('1. Numbers (sample) · 2 photos');
  await expect(p.getByTestId('book-chapter').nth(1)).toContainText('3. Fractions (sample) · PDF');
  // SEC-19: stored as JPEGs without camera or location details.
  const pics = await sql<{ media_type: string; body: Buffer }[]>`
    SELECT f.media_type, f.body FROM stored_files f JOIN book_chapter_files x ON x.file_id = f.id
    JOIN book_chapters c ON c.id = x.chapter_id JOIN books b ON b.id = c.book_id
    WHERE c.title = 'Numbers (sample)' AND b.owner_id = ${parent.id} ORDER BY x.position`;
  expect(pics.map((x) => x.media_type)).toEqual(['image/jpeg', 'image/jpeg']);
  for (const pic of pics) expect((await sharp(pic.body).metadata()).exif).toBeUndefined();

  // The child reads the photo chapter page by page.
  const k = await (await browser.newContext()).newPage();
  await childSignIn(k, child.username, child.password);
  await k.goto('/student/library');
  await k.getByRole('link', { name: '1. Numbers (sample)' }).click();
  await expect(k.getByTestId('book-photo')).toBeVisible();
  await k.getByRole('button', { name: 'Next ›' }).click();
  await expect(k.getByRole('img', { name: 'Page 2' })).toBeVisible();
  await nothingStored(k);

  // B-8: a complete book used as it is, then split later on its page; same book, same PDF.
  await p.goto('/parent/content/books/new');
  await p.getByRole('button', { name: /Subject/ }).click();
  await p.getByRole('group', { name: 'Subject' }).getByRole('button', { name: 'Maths', exact: true }).click();
  await p.getByLabel('The book’s PDF').setInputFiles({
    name: 'scan_0043.pdf',
    mimeType: 'application/pdf',
    buffer: fixture('sample-book-bookmarks.pdf'),
  });
  await expect(p.getByTestId('pdf-ready')).toBeVisible();
  await expect(p.getByLabel('Book title')).toHaveValue('');
  await p.getByLabel('Book title').fill('Practice book (sample)');
  await p.getByRole('radio', { name: /Use as it is/ }).check();
  await p.getByLabel(/I confirm I am allowed/).check();
  await p.getByRole('button', { name: 'Save as draft' }).click();
  await expect(p.getByText('Saved as a draft.')).toBeVisible();
  const [before] = await sql<{ id: string; file_id: string }[]>`
    SELECT id, file_id FROM books WHERE owner_id = ${parent.id} AND title = 'Practice book (sample)'`;
  await p.getByRole('button', { name: 'Split in Chapters' }).click();
  await expect(p.getByText('We suggest 3 chapters')).toBeVisible();
  await p.getByRole('button', { name: 'Save chapters' }).click();
  await expect(p.getByTestId('book-chapter')).toHaveCount(3);
  const after = await sql<{ id: string; file_id: string; split: string }[]>`
    SELECT id, file_id, split FROM books WHERE owner_id = ${parent.id} AND title = 'Practice book (sample)'`;
  expect(after).toEqual([{ id: before!.id, file_id: before!.file_id, split: 'chapters' }]);
  await shot(p, phone ? 'B1-split-later-phone' : 'B1-split-later-desktop');
});

test('SEC-15: a PDF carrying a script and actions is added and read without anything running', async ({ browser }) => {
  test.setTimeout(150_000);
  const parent = await seedParent(sql);
  const child = await seedChild(sql, parent.id);
  const ran: string[] = [];
  /** Any dialog, new window or request leaving AA Pro counts as "something ran". */
  const watch = (page: Page) => {
    page.on('dialog', (d) => {
      ran.push(`dialog: ${d.message()}`);
      void d.dismiss();
    });
    page.on('popup', (w) => ran.push(`window: ${w.url()}`));
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(u.hostname))
        ran.push(`request: ${r.url()}`);
    });
  };
  const p = await (await browser.newContext()).newPage();
  watch(p);
  await signInAs(p, parent.email);
  await p.goto('/parent/content/books/new');
  await p.getByRole('button', { name: /Subject/ }).click();
  await p.getByRole('group', { name: 'Subject' }).getByRole('button', { name: 'Science', exact: true }).click();
  await p.getByLabel(new RegExp(child.name)).check();
  await p.getByLabel('The book’s PDF').setInputFiles({
    name: 'Scripted sample.pdf',
    mimeType: 'application/pdf',
    buffer: fixture('sample-book-scripted.pdf'),
  });
  await expect(p.getByTestId('pdf-ready')).toContainText('3 pages');
  await p.getByRole('radio', { name: /Split in Chapters/ }).check();
  await expect(p.getByText('We suggest 2 chapters.')).toBeVisible();
  await p.getByLabel(/I confirm I am allowed/).check();
  await p.getByRole('button', { name: 'Save and publish' }).click();
  await expect(p.getByText('Saved and published.')).toBeVisible();
  const [book] = await sql<
    { id: string; file_id: string }[]
  >`SELECT id, file_id FROM books WHERE owner_id = ${parent.id}`;

  // The child reads both chapters.
  const k = await (await browser.newContext()).newPage();
  watch(k);
  await childSignIn(k, child.username, child.password);
  await k.goto(`/books/${book!.id}`);
  await expect(k.getByTestId('book-page')).toBeVisible();
  await k.getByRole('button', { name: /Chapter two/ }).click();
  await expect(k.getByRole('heading', { name: 'Chapter 2: Chapter two (sample)' })).toBeVisible();
  await expect(k.getByText('PDF page 3')).toBeVisible();

  // The owner opens the original PDF page too.
  await p.goto(`/files/${book!.file_id}/view`);
  await expect(p.getByTestId('file-download')).toBeVisible();
  await p.waitForTimeout(2000);
  expect(ran).toEqual([]);
});
