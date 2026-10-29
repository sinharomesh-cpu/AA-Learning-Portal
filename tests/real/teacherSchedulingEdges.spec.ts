import { expect, type Page, test } from '@playwright/test';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * Owner acceptance (30 Oct 2026), TL-3 edge cases through the real screens, desktop and phone:
 * who may schedule (and what an ineligible teacher is told, with no check relaxed), other roles by
 * direct address, a time refused at review, the five-chapter limit, a material request answered on
 * booking details (the parent stays on that page), first accepted wins between two overlapping
 * proposals, and an overdue proposal that can no longer be accepted. Invented accounts only.
 */

const sql = seedDb();
const dayAhead = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(Date.now() + n * 86_400_000);
const listing = (teacher: string) =>
  sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
      VALUES (${`t-${Math.random().toString(36).slice(2, 12).padEnd(10, 'a')}`}, ${teacher}, true, 'INR', 60000, 30)`;
async function check(page: Page, phone: boolean) {
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);
}
async function bookWith(parent: string, child: string, titles: string[]) {
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO books (owner_id, title, subject, form, status) VALUES (${parent}, 'Maths Practice', 'maths', 'chapter_files', 'published')
    RETURNING id`;
  for (const [i, t] of titles.entries())
    await sql`INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${t})`;
  await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${child})`;
  return b!.id;
}
/** Fill the form for the only linked child; returns the form. */
async function fill(t: Page, day: string, time: string, minutes = '25') {
  await t.goto('/teacher/propose');
  const form = t.getByTestId('propose-form');
  await form.getByLabel('Day').fill(day);
  await form.getByLabel('Start time').fill(time);
  await form.getByLabel('Length').selectOption(minutes);
  return form;
}
async function send(t: Page, day: string, time: string, minutes = '25') {
  const form = await fill(t, day, time, minutes);
  await form.getByRole('button', { name: 'Review proposal' }).click();
  await form.getByRole('button', { name: 'Send proposal' }).click();
  await expect(t.getByText(/^Proposal sent\./)).toBeVisible();
}

test('who may schedule: an ineligible teacher is told why; parents and children can’t open the page', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === 'phone';
  const page = async () => (await browser.newContext()).newPage();

  // Approved and active, linked, but no hourly rate: "Add your hourly rate first", no form.
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const child = await seedChild(sql, parent.id, 'Kiran');
  const noRate = await seedTeacher(sql, 'approved', 'Ms No Rate');
  await seedActiveLink(sql, noRate.id, child.id, parent.id);
  const a = await page();
  await signInAs(a, noRate.email);
  await a.goto('/teacher/propose');
  await expect(a.getByText('Add your hourly rate first')).toBeVisible();
  await expect(a.getByTestId('propose-form')).toHaveCount(0);
  await check(a, phone);

  // Approved, with a rate, but no child linked: "No children linked yet", no form.
  const lonely = await seedTeacher(sql, 'approved', 'Ms No Students');
  await listing(lonely.id);
  const b = await page();
  await signInAs(b, lonely.email);
  await b.goto('/teacher/propose');
  await expect(b.getByText('No children linked yet')).toBeVisible();
  await expect(b.getByRole('radio')).toHaveCount(0);

  // Approved and linked, then deactivated by an admin: told the account must be approved and active.
  const off = await seedTeacher(sql, 'approved', 'Ms Paused');
  await listing(off.id);
  await seedActiveLink(sql, off.id, child.id, parent.id);
  const c = await page();
  await signInAs(c, off.email);
  await sql`UPDATE teacher_profiles SET approval_status = 'changes_requested' WHERE account_id = ${off.id}`;
  await c.goto('/teacher/propose');
  await expect(c.getByText('You can schedule classes once your teacher account is approved and active.')).toBeVisible();
  await expect(c.getByTestId('propose-form')).toHaveCount(0);

  // A parent and a child at the teacher's address get the access-denied page.
  const p = await page();
  await signInAs(p, parent.email);
  await p.goto('/teacher/propose');
  await expect(p.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  const k = await page();
  await childSignIn(k, child.username, child.password);
  await k.goto('/teacher/propose');
  await expect(k.getByRole('heading', { name: 'This page is for grown-ups' })).toBeVisible();
  for (const x of [a, b, c, p, k]) await x.context().close();
});

test('review refuses a time under 24 hours; at most five planned chapters; material answered on booking details', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === 'phone';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const child = await seedChild(sql, parent.id, 'Kiran');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await listing(teacher.id);
  await bookWith(parent.id, child.id, ['Fractions', 'Decimals', 'Shapes', 'Time', 'Money', 'Data']);

  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  // The first day the form offers, at midnight: under 24 hours away, refused by the server's review.
  await t.goto('/teacher/propose');
  const first = (await t.getByTestId('propose-form').getByLabel('Day').getAttribute('min'))!;
  let form = await fill(t, first, '00:00');
  await form.getByRole('button', { name: 'Review proposal' }).click();
  await expect(form.getByText('Lessons need at least 24 hours’ notice. Choose a later time.')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Send proposal' })).toHaveCount(0);

  // Five chapters at most: the sixth can't be ticked.
  form = await fill(t, dayAhead(4), '16:00');
  const boxes = form.getByRole('checkbox');
  await expect(boxes).toHaveCount(6);
  for (let i = 0; i < 5; i++) await boxes.nth(i).check();
  await expect(form.getByText('5 of 5 chosen.')).toBeVisible();
  await expect(boxes.nth(5)).toBeDisabled();
  await form.getByLabel('What do you need?').fill('The fractions workbook');
  await form.getByRole('button', { name: 'Review proposal' }).click();
  const review = form.getByTestId('proposal-review');
  await expect(review).toContainText('Maths Practice · 5. Money');
  await expect(review).not.toContainText('6. Data');
  // Changing a field after the review clears it: Send is gone until the teacher reviews again.
  await form.getByLabel('Length').selectOption('30');
  await expect(form.getByRole('button', { name: 'Send proposal' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Review proposal' }).click();
  await expect(review).toContainText('₹300 for 30 min');
  await check(t, phone);
  await form.getByRole('button', { name: 'Send proposal' }).click();
  await expect(t.getByText(/^Proposal sent\./)).toBeVisible();

  // The parent shares a chapter for the material request on booking details and stays there.
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent/calendar');
  await p
    .getByRole('region', { name: 'Waiting for you' })
    .getByRole('link', { name: /^Review and answer:/ })
    .click();
  await expect(p).toHaveURL(/\/parent\/bookings\/[0-9a-f-]{36}$/);
  const bookingUrl = p.url();
  await p.getByTestId('material-request').getByLabel('Share from your books').selectOption({
    label: 'Maths Practice · 1. Fractions',
  });
  await p
    .getByTestId('material-request')
    .getByRole('button', { name: /^Share:/ })
    .click();
  await expect(p.getByText('Shared. The teacher sees it in AA Pro, view only.')).toBeVisible();
  expect(p.url().split('?')[0]).toBe(bookingUrl);
  await expect(p.getByTestId('material-request')).toContainText('You shared: Maths Practice · 1. Fractions');
  await expect(p.getByRole('button', { name: /^Accept:/ })).toBeVisible();
  await check(p, phone);
  for (const x of [t, p]) await x.context().close();
});

test('first accepted wins between overlapping proposals; an overdue proposal can’t be accepted', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === 'phone';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const child = await seedChild(sql, parent.id, 'Kiran');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await listing(teacher.id);

  // Two proposals that overlap (proposals hold no time, so both can be sent).
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await send(t, dayAhead(5), '17:00');
  await send(t, dayAhead(5), '17:15');
  const waiting = t.getByRole('region', { name: 'Proposals waiting for a parent' });
  await expect(waiting.getByTestId('lesson-card')).toHaveCount(2);

  // An overdue proposal (deadline passed, the sweep not yet run): rules skipped for this insert only.
  const [overdue] = await sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    return tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, proposed_by, origin, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, currency, rate_minor, price_minor, price_basis)
      SELECT ${teacher.id}, ${child.id}, ${teacher.id}, 'teacher_proposal', 'maths', s, 30, s + interval '30 minutes',
             now() - interval '3 days', now() - interval '1 day', 'proposed', 'INR', 60000, 30000, 'listed'
      FROM (SELECT date_trunc('hour', now()) + interval '8 days' AS s) x RETURNING id`;
  });

  // The parent accepts the 5:00 pm proposal; the 5:15 pm one closes: time no longer free.
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent/calendar');
  await p
    .getByRole('region', { name: 'Waiting for you' })
    .getByRole('link', { name: /^Review and answer:.*5:00 pm/ })
    .click();
  await p.getByRole('button', { name: /^Accept:/ }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(p.getByText('Accepted. The lesson is booked and the teacher has been told.')).toBeVisible();
  await p.goto('/parent/calendar');
  await expect(
    p.getByTestId('lesson-card').filter({ hasText: '5:15 pm' }).getByText('Time no longer free', { exact: true }),
  ).toBeVisible();
  await check(p, phone);

  // The overdue proposal: shown as expired, with no Accept.
  await p.goto(`/parent/bookings/${overdue!.id}`);
  await expect(p.getByTestId('lesson-card').getByText('Expired: no answer in time')).toBeVisible();
  await expect(p.getByRole('button', { name: /^Accept:/ })).toHaveCount(0);

  // The teacher sees one confirmed lesson and nothing still waiting.
  await t.goto('/teacher/schedule');
  await expect(t.getByRole('region', { name: 'Proposals waiting for a parent' })).toHaveCount(0);
  await expect(t.getByTestId('lesson-card').filter({ hasText: '5:00 pm' }).first()).toContainText('Confirmed');
  for (const x of [t, p]) await x.context().close();
});
