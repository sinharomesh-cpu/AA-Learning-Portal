import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { type Sql, seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * TL-1 with real sign-in, desktop and phone (owner, 25 Oct 2026, 21:18 IST; migration 0032): a
 * parent names chapters (or a topic) when requesting a lesson; the teacher sees them, opens one in
 * the view-only reader and accepts; the child sees the titles once confirmed; when the parent stops
 * sharing the book the teacher sees "No longer shared" and no content. Another family and another
 * teacher see nothing. Invented accounts and sample books only. TL1_SHOTS=<folder> saves screenshots.
 */

const sql = seedDb();
const shots = process.env.TL1_SHOTS;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
async function check(page: Page, phone: boolean) {
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);
}
/** Usual times 4:00–6:00 pm IST every day and a listed hourly rate of ₹600 (usual 30 minutes). */
async function bookable(db: Sql, teacher: string) {
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await db`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${teacher}, ${d}, 960, 1080)`;
  await db`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
           VALUES (${`t-${Math.random().toString(36).slice(2, 12).padEnd(10, 'a')}`}, ${teacher}, true, 'INR', 60000, 30)`;
}
/** A published book of separate chapters, assigned to the child (as the parent's own books flow leaves it). */
async function sharedBook(
  db: Sql,
  parent: string,
  child: string,
  title: string,
  chapters: string[],
  status = 'published',
) {
  const [b] = await db<{ id: string }[]>`
    INSERT INTO books (owner_id, title, subject, form, status) VALUES (${parent}, ${title}, 'maths', 'chapter_files', ${status})
    RETURNING id`;
  for (const [i, t] of chapters.entries())
    await db`INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${t})`;
  await db`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${child})`;
  return b!.id;
}
/** Book a teacher: child, teacher and subject; the third free day at 4:30 pm. Returns the form. */
async function openBooking(p: Page, childName: string, teacherName: string) {
  await p.goto('/parent/book-teacher');
  await p.getByRole('radio', { name: new RegExp(`${childName}: Maths with ${teacherName}`) }).check();
  await p.getByRole('button', { name: 'Show free times' }).click();
  const days = p.getByRole('navigation', { name: 'Days with free times' }).getByRole('link');
  await days.nth(2).click();
  await expect(days.nth(2)).toHaveAttribute('aria-current', 'date');
  await p.getByRole('radio', { name: /4:30 pm/ }).check();
}

test('TL-1: chapters on a request — parent picks, teacher sees and opens, child sees, “No longer shared”', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await bookable(sql, teacher.id);
  const bookId = await sharedBook(sql, parent.id, child.id, 'Maths Practice (sample)', [
    'Fractions',
    'Decimals',
    'Shapes',
  ]);
  await sharedBook(sql, parent.id, child.id, 'Draft maths (sample)', ['Hidden'], 'draft');

  // 1. The parent picks two chapters; the draft book is not offered.
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await openBooking(p, child.name, teacher.name);
  const cover = p.getByRole('group', { name: 'What should the lesson cover? (optional)' });
  await expect(cover.getByRole('checkbox')).toHaveCount(3);
  await expect(cover).not.toContainText('Hidden');
  await cover.getByRole('checkbox', { name: 'Maths Practice (sample) · 1. Fractions' }).check();
  await cover.getByRole('checkbox', { name: 'Maths Practice (sample) · 3. Shapes' }).check();
  await expect(cover.getByLabel('Or a topic')).toBeDisabled();
  await expect(cover.getByText('2 of 5 chapters chosen.')).toBeVisible();
  await check(p, phone);
  await shot(p, `TL1-parent-picker-${device}`);
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(p.getByText('Request sent.')).toBeVisible();
  const pcard = p.getByTestId('lesson-card').filter({ hasText: 'Maths with Ms Priya Rao' });
  await expect(pcard.getByTestId('lesson-chapters')).toContainText('Requested chapters');
  await expect(pcard.getByTestId('lesson-chapters').getByRole('listitem')).toHaveText([
    'Maths Practice (sample) · 1. Fractions',
    'Maths Practice (sample) · 3. Shapes',
  ]);
  await check(p, phone);
  await shot(p, `TL1-parent-calendar-${device}`);

  // 2. The teacher sees them on the request, opens one view-only, and accepts.
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher/schedule');
  const tcard = t.getByTestId('lesson-card').filter({ hasText: 'Maths with Kiran' });
  await expect(tcard.getByTestId('lesson-chapters').getByRole('link')).toHaveText([
    'Maths Practice (sample) · 1. Fractions',
    'Maths Practice (sample) · 3. Shapes',
  ]);
  await check(t, phone);
  await shot(t, `TL1-teacher-card-${device}`);
  await tcard.getByRole('link', { name: 'Maths Practice (sample) · 1. Fractions' }).click();
  await expect(t).toHaveURL(new RegExp(`/books/${bookId}\\?chapter=`), { timeout: 60_000 });
  await expect(t.getByRole('heading', { level: 1, name: 'Maths Practice (sample)' })).toBeVisible();
  await expect(t.getByText('Maths · view only')).toBeVisible();
  await t.goto('/teacher/schedule');
  await t
    .getByTestId('lesson-card')
    .filter({ hasText: 'Maths with Kiran' })
    .getByRole('button', { name: /^Accept:/ })
    .click();
  await expect(t.getByText('Accepted. The family has been told.')).toBeVisible();

  // 3. The child sees the titles on the confirmed lesson (titles only: no links, no status).
  const k = await (await browser.newContext()).newPage();
  await childSignIn(k, child.username, child.password);
  await k.goto('/student/schedule');
  await expect(k.getByTestId('child-chapters')).toHaveText(
    'Chapters: Maths Practice (sample) · 1. Fractions; Maths Practice (sample) · 3. Shapes',
  );
  await expect(k.getByTestId('child-chapters').getByRole('link')).toHaveCount(0);
  await check(k, phone);
  await shot(k, `TL1-child-schedule-${device}`);

  // 4. The parent stops sharing the book (unpublishes it): the teacher sees "No longer shared",
  //    no link, and the reader refuses; the labels stay for everyone.
  await sql`UPDATE books SET status = 'draft' WHERE id = ${bookId}`;
  await t.goto('/teacher/schedule');
  const tcard2 = t.getByTestId('lesson-card').filter({ hasText: 'Maths with Kiran' });
  await expect(tcard2.getByTestId('chapter-not-shared')).toHaveCount(2);
  await expect(tcard2.getByTestId('lesson-chapters').getByRole('link')).toHaveCount(0);
  await expect(tcard2.getByTestId('lesson-chapters')).toContainText('Maths Practice (sample) · 1. Fractions');
  await check(t, phone);
  await shot(t, `TL1-teacher-no-longer-shared-${device}`);
  await t.goto(`/books/${bookId}`);
  await expect(t.getByRole('heading', { level: 1, name: 'Maths Practice (sample)' })).toHaveCount(0);

  // 5. Another family and another teacher see nothing of it.
  const strangerParent = await seedParent(sql, 'Meera', 'Iyer');
  const strangerTeacher = await seedTeacher(sql, 'approved', 'Mr Arun Iyer');
  for (const [who, path] of [
    [strangerParent, '/parent/calendar'],
    [strangerTeacher, '/teacher/schedule'],
  ] as const) {
    const s = await (await browser.newContext()).newPage();
    await signInAs(s, who.email);
    await s.goto(path);
    await expect(s.getByText('Maths Practice (sample)')).toHaveCount(0);
    await s.context().close();
  }
  for (const c of [p, t, k]) await c.context().close();
});

test('TL-1: with no shared book the parent may type one topic; the teacher sees “Requested topic”', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const phone = info.project.name === 'phone';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await bookable(sql, teacher.id);

  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await openBooking(p, child.name, teacher.name);
  const cover = p.getByRole('group', { name: 'What should the lesson cover? (optional)' });
  await expect(cover.getByRole('checkbox')).toHaveCount(0);
  await expect(cover).toContainText('None of your published books for Maths is shared with Kiran yet.');
  await cover.getByLabel('Topic').fill('Long division revision');
  await check(p, phone);
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(p.getByText('Request sent.')).toBeVisible();

  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher/schedule');
  const chapters = t.getByTestId('lesson-card').filter({ hasText: 'Maths with Kiran' }).getByTestId('lesson-chapters');
  await expect(chapters).toContainText('Requested topic');
  await expect(chapters.getByRole('listitem')).toHaveText(['Long division revision']);
  await expect(chapters.getByTestId('chapter-not-shared')).toHaveCount(0);
  await check(t, phone);
  const [row] = await sql<{ topic: string; label: string }[]>`
    SELECT lc.topic, lc.label FROM lesson_chapters lc JOIN lessons l ON l.id = lc.lesson_id WHERE l.student_id = ${child.id}`;
  expect(row).toEqual({ topic: 'Long division revision', label: 'Long division revision' });
  for (const c of [p, t]) await c.context().close();
});
