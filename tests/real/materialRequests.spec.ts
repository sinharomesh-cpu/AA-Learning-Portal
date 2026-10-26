import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { type Sql, seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * TL-2 with real sign-in, desktop and phone (scope authorised 26 Oct 2026, 08:15 IST; migration
 * 0033 v2): the teacher asks for material on a lesson; the parent sees the home count, shares a
 * chapter the teacher can already view and says another item isn't available; the teacher opens
 * the shared chapter view-only, withdraws a request, and a cancelled lesson closes the last one.
 * The child sees none of it. Another family and another teacher see nothing, including by direct
 * URL to the shared book. Invented accounts and sample books only. TL2_SHOTS=<folder> saves screenshots.
 */

const sql = seedDb();
const shots = process.env.TL2_SHOTS;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
async function check(page: Page, phone: boolean) {
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);
}
async function bookable(db: Sql, teacher: string) {
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await db`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${teacher}, ${d}, 960, 1080)`;
  await db`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
           VALUES (${`t-${Math.random().toString(36).slice(2, 12).padEnd(10, 'a')}`}, ${teacher}, true, 'INR', 60000, 30)`;
}
/** Material requests on this child's lessons, straight from the database. */
async function requestsFor(childId: string) {
  const [r] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM material_requests m JOIN lessons l ON l.id = m.lesson_id WHERE l.student_id = ${childId}`;
  return r!.n;
}
async function sharedBook(db: Sql, parent: string, child: string | null, title: string, chapters: string[]) {
  const [b] = await db<{ id: string }[]>`
    INSERT INTO books (owner_id, title, subject, form, status) VALUES (${parent}, ${title}, 'maths', 'chapter_files', 'published')
    RETURNING id`;
  for (const [i, t] of chapters.entries())
    await db`INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${t})`;
  if (child) await db`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${child})`;
  return b!.id;
}

test('TL-2: teacher asks, parent shares or says unavailable, teacher withdraws, cancellation closes; others see nothing', async ({
  browser,
}, info) => {
  test.setTimeout(600_000);
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await bookable(sql, teacher.id);
  const bookId = await sharedBook(sql, parent.id, child.id, 'Maths Practice (sample)', ['Fractions', 'Decimals']);
  await sharedBook(sql, parent.id, null, 'Unassigned maths (sample)', ['Hidden']);

  // 0. The parent requests a lesson naming chapter 1 (TL-1, unchanged); the teacher accepts.
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent/book-teacher');
  await p.getByRole('radio', { name: new RegExp(`${child.name}: Maths with ${teacher.name}`) }).check();
  await p.getByRole('button', { name: 'Show free times' }).click();
  const days = p.getByRole('navigation', { name: 'Days with free times' }).getByRole('link');
  await days.nth(2).click();
  await expect(days.nth(2)).toHaveAttribute('aria-current', 'date');
  await p.getByRole('radio', { name: /4:30 pm/ }).check();
  await p
    .getByRole('group', { name: 'What should the lesson cover? (optional)' })
    .getByRole('checkbox', { name: 'Maths Practice (sample) · 1. Fractions' })
    .check();
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(p.getByText('Request sent.')).toBeVisible();
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher/schedule');
  const card = () => t.getByTestId('lesson-card').filter({ hasText: 'Maths with Kiran' });
  await card()
    .getByRole('button', { name: /^Accept:/ })
    .click();
  await expect(t.getByText('Accepted. The family has been told.')).toBeVisible();

  // 1. The teacher asks for the requested chapter (with a note), then for something else.
  await card()
    .getByRole('button', { name: /^Ask the parent for material:/ })
    .click();
  const ask = card().getByTestId('ask-material');
  await ask.getByLabel('What do you need?').selectOption({ label: 'Maths Practice (sample) · 1. Fractions' });
  await ask.getByLabel('Note for the parent (optional)').fill('The pages with the pizza diagrams, please.');
  await check(t, phone);
  await shot(t, `TL2-teacher-ask-${device}`);
  await ask.getByRole('button', { name: /^Send material request:/ }).click();
  await expect(
    t.getByText('Material request sent to the parent. They see it in AA Pro; no email or WhatsApp is sent.'),
  ).toBeVisible();
  // One submission, one request: the new request is listed, and the form is closed and empty again.
  await expect(card().getByTestId('material-request')).toHaveCount(1);
  await expect(card().getByTestId('ask-material')).toHaveCount(0);
  await expect(card().getByRole('button', { name: /^Ask the parent for material:/ })).toBeVisible();
  expect(await requestsFor(child.id)).toBe(1);
  await check(t, phone);
  await shot(t, `TL2-teacher-sent-${device}`);
  await card()
    .getByRole('button', { name: /^Ask the parent for material:/ })
    .click();
  await expect(card().getByTestId('ask-material').getByLabel('Note for the parent (optional)')).toHaveValue('');
  await card().getByTestId('ask-material').getByLabel('What do you need?').selectOption('other');
  await card().getByTestId('ask-material').getByLabel('Describe it').fill('Times-tables worksheet');
  // A double click on Send still creates exactly one request.
  await card()
    .getByTestId('ask-material')
    .getByRole('button', { name: /^Send material request:/ })
    .dblclick();
  await expect(card().getByTestId('material-request')).toHaveCount(2);
  await expect(card().getByTestId('ask-material')).toHaveCount(0);
  expect(await requestsFor(child.id)).toBe(2);
  await expect(card().getByTestId('material-request').first()).toContainText('Waiting for the parent');

  // 2. The child sees no material requests (D-TLS-21).
  const k = await (await browser.newContext()).newPage();
  await childSignIn(k, child.username, child.password);
  await k.goto('/student/schedule');
  await expect(k.getByText('Times-tables worksheet')).toHaveCount(0);
  await expect(k.getByTestId('material-requests')).toHaveCount(0);

  // 3. The parent's home shows the count (safeguard 6); the calendar shows both requests.
  await p.goto('/parent');
  await expect(p.getByTestId('materials-requested')).toContainText('2 requests are waiting');
  await check(p, phone);
  await shot(p, `TL2-parent-home-count-${device}`);
  await p.getByTestId('materials-requested').getByRole('link', { name: 'Review requests' }).click();
  await expect(p).toHaveURL(/\/parent\/calendar/);
  const pcard = () => p.getByTestId('lesson-card').filter({ hasText: 'Maths with Ms Priya Rao' });
  const items = () => pcard().getByTestId('material-request');
  await expect(items()).toHaveCount(2);
  await expect(items().first()).toContainText('The teacher’s note: The pages with the pizza diagrams, please.');
  // Only the book the teacher can already view is offered.
  const select = items().first().getByLabel('Share from your books');
  await expect(select.locator('option', { hasText: 'Unassigned maths' })).toHaveCount(0);
  await check(p, phone);
  await shot(p, `TL2-parent-answer-${device}`);
  await select.selectOption({ label: 'Maths Practice (sample) · 1. Fractions' });
  await items()
    .first()
    .getByRole('button', { name: /^Share:/ })
    .click();
  await expect(p.getByText('Shared. The teacher sees it in AA Pro, view only.')).toBeVisible();
  await items()
    .nth(1)
    .getByRole('button', { name: /^Not available:/ })
    .click();
  const dialog = p.getByRole('dialog');
  await dialog.getByLabel('Note for the teacher (optional)').fill('We don’t have one at home.');
  await dialog.getByRole('button', { name: 'Not available', exact: true }).click();
  await expect(p.getByText('Saved. The teacher sees that it isn’t available.')).toBeVisible();
  await expect(items().first()).toContainText('You shared: Maths Practice (sample) · 1. Fractions');
  await expect(items().nth(1)).toContainText('Not available');
  await p.goto('/parent');
  await expect(p.getByTestId('materials-requested')).toHaveCount(0);

  // 4. The teacher sees the answers and opens the shared chapter view-only.
  await t.goto('/teacher/schedule');
  const titems = () => card().getByTestId('material-request');
  await expect(titems().first()).toContainText('Shared');
  await expect(titems().nth(1)).toContainText('The parent’s note: We don’t have one at home.');
  await check(t, phone);
  await shot(t, `TL2-teacher-answers-${device}`);
  await titems().first().getByTestId('material-shared').getByRole('link').click();
  await expect(t).toHaveURL(new RegExp(`/books/${bookId}\\?chapter=`), { timeout: 60_000 });
  await expect(t.getByText('Maths · view only')).toBeVisible();

  // 5. The teacher asks again and withdraws it; then asks once more and the parent cancels the lesson.
  await t.goto('/teacher/schedule');
  for (const what of ['Ruler', 'Graph paper']) {
    await card()
      .getByRole('button', { name: /^Ask the parent for material:/ })
      .click();
    await card().getByTestId('ask-material').getByLabel('What do you need?').selectOption('other');
    await card().getByTestId('ask-material').getByLabel('Describe it').fill(what);
    await card()
      .getByTestId('ask-material')
      .getByRole('button', { name: /^Send material request:/ })
      .click();
    // The banner is already there from earlier requests: wait for this request itself.
    await expect(card().getByTestId('material-request').filter({ hasText: what })).toBeVisible();
  }
  await card()
    .getByTestId('material-request')
    .filter({ hasText: 'Ruler' })
    .getByRole('button', { name: /^Withdraw material request:/ })
    .click();
  await t.getByRole('dialog').getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(t.getByText('Material request withdrawn.')).toBeVisible();
  await expect(card().getByTestId('material-request').filter({ hasText: 'Ruler' })).toContainText('No longer needed');
  await p.goto('/parent/calendar');
  await pcard()
    .getByRole('button', { name: /^Cancel lesson:/ })
    .click();
  await p.getByRole('dialog').getByRole('button', { name: 'Cancel lesson', exact: true }).click();
  await expect(p.getByText('Lesson cancelled. The teacher has been told.')).toBeVisible();
  await t.goto('/teacher/schedule');
  await expect(card().getByTestId('material-request').filter({ hasText: 'Graph paper' })).toContainText(
    'No longer needed',
  );
  await expect(card().getByRole('button', { name: /^Ask the parent for material:/ })).toHaveCount(0);

  // 6. Another family and another teacher see nothing, including by direct URL to the shared book.
  const strangerParent = await seedParent(sql, 'Meera', 'Iyer');
  const strangerTeacher = await seedTeacher(sql, 'approved', 'Mr Arun Iyer');
  for (const [who, path] of [
    [strangerParent, '/parent/calendar'],
    [strangerParent, '/parent'],
    [strangerTeacher, '/teacher/schedule'],
  ] as const) {
    const s = await (await browser.newContext()).newPage();
    await signInAs(s, who.email);
    await s.goto(path);
    await expect(s.getByText('Times-tables worksheet')).toHaveCount(0);
    await expect(s.getByTestId('materials-requested')).toHaveCount(0);
    await expect(s.getByTestId('material-requests')).toHaveCount(0);
    await s.goto(`/books/${bookId}`);
    await expect(s.getByRole('heading', { level: 1, name: 'Maths Practice (sample)' })).toHaveCount(0);
    await s.context().close();
  }
  for (const c of [p, t, k]) await c.context().close();
});
