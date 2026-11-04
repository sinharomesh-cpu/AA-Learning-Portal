import { expect, type Page, test } from '@playwright/test';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * TL-4 application layer with real sign-in, desktop and phone. Invented accounts only.
 *
 * - Every run: without the TL-4 SQL (every shared database today) nothing offers a move, the move
 *   pages say it isn't available, and the old wording ("cancel it and request a new time") stays.
 * - Only where the TL-4 SQL is applied to the throw-away database (it is not a migration yet, so CI
 *   skips this): a parent asks to move a lesson, the teacher accepts; the teacher then proposes a new
 *   time, a parent accepts on booking details; the child sees only the current lesson throughout.
 */

const sql = seedDb();
async function check(page: Page, phone: boolean) {
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);
}
async function tl4Applied(): Promise<boolean> {
  const [r] = await sql<{ ok: boolean }[]>`SELECT to_regclass('public.lesson_reschedules') IS NOT NULL AS ok`;
  return !!r?.ok;
}
const HALF_HOUR = 30 * 60_000;
/** Three days ahead, on the half hour (every grid in India and UTC). */
const start = () => new Date(Math.ceil(Date.now() / HALF_HOUR) * HALF_HOUR + 3 * 86_400_000);
const dayIn = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

async function setUp() {
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const parent2 = await seedParent(sql, 'Ravi', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2.id}, ${child.id})`;
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${Math.random().toString(36).slice(2, 12).padEnd(10, 'a')}`}, ${teacher.id}, true, 'INR', 60000, 30)`;
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${teacher.id}, ${d}, 0, 1440)`;
  // A booked lesson: the teacher's proposal, accepted by a parent (the database's own rules).
  const [l] = await sql<{ id: string }[]>`
    INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, proposed_by)
    VALUES (${teacher.id}, ${child.id}, 'maths', ${start()}, 30, 'proposed', ${teacher.id}) RETURNING id`;
  await sql`UPDATE lessons SET status = 'confirmed', confirmed_by = ${parent.id} WHERE id = ${l!.id}`;
  return { parent, parent2, teacher, child, lesson: l!.id };
}

/** With the TL-4 SQL: a book with two chapters, the lesson planned on the first, and two open
 *  material requests (one about that chapter, one described), raised one after the other. */
async function withChaptersAndRequests(s: Awaited<ReturnType<typeof setUp>>) {
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO books (owner_id, title, subject, form, status) VALUES (${s.parent.id}, 'Maths Book 5', 'maths', 'chapter_files', 'published') RETURNING id`;
  const ch: string[] = [];
  for (const [i, title] of ['Fractions', 'Decimals'].entries())
    ch.push(
      (
        await sql<{ id: string }[]>`
          INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${title}) RETURNING id`
      )[0]!.id,
    );
  await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${s.child.id})`;
  // Planned chapters are added with the proposal, so this lesson is booked afresh with its chapter.
  const l = await sql.begin(async (tx) => {
    const [x] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, subject, starts_at, minutes, status, proposed_by)
      VALUES (${s.teacher.id}, ${s.child.id}, 'maths', ${new Date(start().getTime() + 86_400_000)}, 30, 'proposed', ${s.teacher.id})
      RETURNING id`;
    await tx`INSERT INTO lesson_chapters (lesson_id, position, source, book_chapter_id, intent)
             VALUES (${x!.id}, 1, 'planned', ${ch[0]!}, 'new')`;
    return x!.id;
  });
  await sql`UPDATE lessons SET status = 'confirmed', confirmed_by = ${s.parent.id} WHERE id = ${l}`;
  await sql`INSERT INTO material_requests (lesson_id, raised_by, lesson_position, note)
            VALUES (${l}, ${s.teacher.id}, 1, 'Worksheet pages for this chapter')`;
  await sql`INSERT INTO material_requests (lesson_id, raised_by, description) VALUES (${l}, ${s.teacher.id}, 'A ruler and squared paper')`;
  // The first booked lesson isn't needed for this journey: the parent cancels it now (no move open).
  await sql`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${s.parent.id} WHERE id = ${s.lesson}`;
  return { lesson: l, chapters: ch };
}

test('without the TL-4 SQL, nothing offers a move and the move pages say so', async ({ browser }, info) => {
  test.skip(await tl4Applied(), 'The TL-4 SQL is applied to this database.');
  const phone = info.project.name === 'phone';
  const { parent, teacher, lesson } = await setUp();
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent/calendar');
  await expect(p.getByRole('heading', { name: 'Maths with Ms Priya Rao' })).toBeVisible();
  await expect(p.getByRole('link', { name: /^Move lesson/ })).toHaveCount(0);
  await expect(p.getByText(/To move one, cancel it and request a new time\./)).toBeVisible();
  await p.goto(`/parent/calendar/move/${lesson}`);
  await expect(p.getByText(/Moving a lesson isn’t available yet\./)).toBeVisible();
  await check(p, phone);
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher/schedule');
  await expect(t.getByRole('heading', { name: /^Maths with Kiran/ })).toBeVisible();
  await expect(t.getByRole('link', { name: /^Move lesson/ })).toHaveCount(0);
  await t.goto(`/teacher/schedule/move/${lesson}`);
  await expect(t.getByText(/Moving a lesson isn’t available yet\./)).toBeVisible();
  await check(t, phone);
});

test('with the TL-4 SQL: a parent asks to move, the teacher accepts; the teacher proposes a new time, a parent accepts', async ({
  browser,
}, info) => {
  test.skip(!(await tl4Applied()), 'The TL-4 SQL is not applied (it is not a migration yet).');
  // The whole move journey (two moves, both sides, notices) takes 45-55 s locally with desktop and
  // phone running together, too close to the default 60 s; give it room.
  test.setTimeout(120_000);
  const phone = info.project.name === 'phone';
  const s = await setUp();
  const { parent, parent2, teacher, child } = s;
  const { lesson, chapters } = await withChaptersAndRequests(s);
  const requestOrder = ['Maths Book 5 · 1. Fractions', 'A ruler and squared paper'];

  // A parent asks to move it: Family calendar → Move lesson → a time → Ask to move.
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent/calendar');
  await p.getByRole('link', { name: /^Move lesson/ }).click();
  await expect(p.getByRole('heading', { level: 1, name: 'Move lesson' })).toBeVisible();
  await check(p, phone);
  await p.locator('input[name="slot"]').first().check({ force: true });
  await p.getByRole('button', { name: 'Ask to move' }).click();
  await expect(p.getByText(/^Move request sent\./)).toBeVisible();
  await expect(p.getByTestId('move-pending')).toBeVisible();
  await check(p, phone);

  // The child still sees only the booked lesson.
  const k = await (await browser.newContext()).newPage();
  await childSignIn(k, child.username, child.password);
  await k.goto('/student/schedule');
  await expect(k.getByRole('heading', { name: `Maths with ${teacher.name}` })).toHaveCount(1);

  // The teacher sees the request with Now / New (time, length, price) and accepts it.
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher/schedule');
  const requests = t.getByRole('region', { name: 'Requests to answer' });
  await expect(requests.getByTestId('move-note')).toContainText('A new time for the lesson booked on');
  await expect(requests.getByTestId('move-compare')).toContainText(/Now.*30 min · ₹300/);
  await expect(requests.getByTestId('move-compare')).toContainText(/New.*30 min · ₹300/);
  await check(t, phone);
  await requests.getByRole('button', { name: /^Accept:/ }).click();
  await expect(
    t.getByText(/^Moved\. The lesson is booked at the new time and the family has been told\./),
  ).toBeVisible();
  const [moved] = await sql<{ id: string }[]>`
    SELECT replacement_lesson_id AS id FROM lesson_reschedules WHERE original_lesson_id = ${lesson}`;
  expect(moved?.id).toBeTruthy();

  // Teacher: the new lesson is Confirmed, "Moved from …", with the meeting-link prompt and the
  // chapter and requests in their original order; the old one is "Moved", "Moved to …".
  const upcomingT = t.getByRole('region', { name: 'Upcoming lessons' });
  const newCard = upcomingT.getByRole('article').filter({ has: t.getByTestId('move-note') });
  await expect(newCard.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(newCard.getByTestId('move-note')).toContainText(/^Moved from /);
  await expect(upcomingT.getByTestId('move-link-prompt')).toContainText(/meeting link for the old time was removed/);
  await expect(newCard.getByTestId('material-request')).toHaveCount(2);
  for (const [i, what] of requestOrder.entries())
    await expect(newCard.getByTestId('material-request').nth(i)).toContainText(what);
  const pastT = t.getByRole('region', { name: 'Past and closed' });
  const oldCard = pastT.getByRole('article').filter({ hasText: 'Moved to' });
  await expect(oldCard.getByText('Moved', { exact: true })).toBeVisible();
  await expect(oldCard.getByTestId('move-note')).toContainText(/^Moved to /);
  await expect(oldCard.getByText('Moved to the new lesson')).toHaveCount(2);
  await check(t, phone);

  // The parent: "Moved from" on the new lesson, "Moved" on the old one, and one "moved" notice.
  await p.goto('/parent/calendar');
  await expect(p.getByRole('region', { name: 'Upcoming lessons' }).getByTestId('move-note')).toContainText(
    /^Moved from /,
  );
  await expect(p.getByText('Moved', { exact: true })).toBeVisible();
  await check(p, phone);
  await p.goto('/parent/notifications');
  await expect(p.getByText(/Kiran's Maths lesson with Ms Priya Rao moved from /)).toHaveCount(1);
  // No per-request notices for the carried requests (the seeded requests were raised directly in
  // the database, so the only material wording on the page is the move notice's own line).
  await expect(p.getByText(/asked for material|no longer needed/i)).toHaveCount(0);
  await expect(p.getByText('Chapters and open material requests moved with it.')).toHaveCount(1);
  // The teacher was told of the request (one notice) and not of the move they made themselves.
  await t.goto('/teacher/notifications');
  await expect(t.getByText(/^Request to move a lesson: /)).toHaveCount(1);
  await expect(t.getByText(/^Lesson moved: /)).toHaveCount(0);

  // The teacher proposes a new time for the moved lesson. A chapter that drops the requested one is
  // refused at the review, and the entries stay (DEF-TL4-13/14); then reviewed (DEF-TL4-09) and sent.
  await t.goto('/teacher/schedule');
  await t
    .getByRole('region', { name: 'Upcoming lessons' })
    .getByRole('link', { name: /^Move lesson/ })
    .click();
  const form = t.getByTestId('move-form');
  await form.getByLabel('New day').fill(dayIn(new Date(start().getTime() + 3 * 86_400_000)));
  await form.getByLabel('New start time').fill('17:05');
  await form.getByLabel('Length').selectOption('40');
  await t.locator(`input[name="planned"][value="${chapters[1]}"]`).check();
  await form.getByRole('button', { name: 'Review new time' }).click();
  await expect(t.getByText(/a chapter you haven’t chosen/)).toBeVisible();
  await expect(t.locator(`input[name="planned"][value="${chapters[1]}"]`)).toBeChecked();
  await expect(form.getByLabel('New start time')).toHaveValue('17:05');
  await expect(form.getByLabel('Length')).toHaveValue('40');
  await t.locator(`input[name="planned"][value="${chapters[1]}"]`).uncheck();
  await form.getByRole('button', { name: 'Review new time' }).click();
  const review = t.getByTestId('move-review');
  await expect(review.getByRole('heading', { name: 'Check the new time' })).toBeFocused();
  await expect(review).toContainText(/Booked now.*30 min · ₹300/);
  await expect(review).toContainText(/New time.*40 min/);
  await expect(review).toContainText(/New price₹400 for 40 min/);
  await check(t, phone);
  await review.getByRole('button', { name: 'Send new time' }).click();
  await expect(t.getByText(/^New time sent to the parents\./)).toBeVisible();

  const [change] = await sql<{ id: string }[]>`
    SELECT id FROM lessons WHERE replaces_lesson_id = ${moved!.id} AND status = 'proposed'`;
  const q = await (await browser.newContext()).newPage();
  await signInAs(q, parent2.email);
  await q.goto(`/parent/bookings/${change!.id}`);
  await expect(q.getByRole('heading', { level: 1, name: 'A teacher proposed a new time' })).toBeVisible();
  // Before accepting: the booked and the new time, length and price side by side.
  await expect(q.getByTestId('move-compare')).toContainText(/Now.*30 min · ₹300/);
  await expect(q.getByTestId('move-compare')).toContainText(/New.*40 min · ₹400/);
  await check(q, phone);
  await q.getByRole('button', { name: /^Accept:/ }).click();
  await expect(q.getByRole('dialog', { name: 'Move the lesson to this time?' })).toBeVisible();
  await q.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(q.getByText(/^Moved\. The lesson is booked at the new time/)).toBeVisible();
  // The teacher is told once, with the meeting-link prompt in the notice.
  await t.goto('/teacher/notifications');
  await expect(t.getByText(/^Lesson moved: /)).toHaveCount(1);
  await expect(t.getByText(/Add your meeting link for the new time/)).toHaveCount(1);

  // The child sees exactly one lesson, the current one.
  await k.goto('/student/schedule');
  await expect(k.getByRole('heading', { name: `Maths with ${teacher.name}` })).toHaveCount(1);
  await check(k, phone);
});
