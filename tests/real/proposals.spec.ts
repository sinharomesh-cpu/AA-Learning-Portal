import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * TL-3 with real sign-in, desktop and phone (TL3-AC-1 to 5, 10, 12 to 14; TL3-SEC-2/3/7): a teacher
 * schedules a class with a planned chapter; a parent sees it on Family home and Family calendar,
 * reviews it on its booking-details page and accepts it; the child sees it only then. A second
 * proposal is declined with a reason; a third is withdrawn. Another family gets "not found".
 * Invented accounts only. PROPOSAL_SHOTS=<folder> saves screenshots for the owner's review.
 */

const sql = seedDb();
const shots = process.env.PROPOSAL_SHOTS;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
async function check(page: Page, phone: boolean) {
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);
}
/** A day N days ahead in India (the seeded accounts' time zone), as YYYY-MM-DD. */
const dayAhead = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(Date.now() + n * 86_400_000);

async function setUp() {
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const parent2 = await seedParent(sql, 'Ravi', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2.id}, ${child.id})`;
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${Math.random().toString(36).slice(2, 12).padEnd(10, 'a')}`}, ${teacher.id}, true, 'INR', 60000, 30)`;
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO books (owner_id, title, subject, form, status) VALUES (${parent.id}, 'Maths Practice', 'maths', 'chapter_files', 'published')
    RETURNING id`;
  for (const [i, t] of ['Fractions', 'Decimals'].entries())
    await sql`INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${t})`;
  await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${child.id})`;
  return { parent, parent2, teacher, child };
}

/** Schedule a class: the only child and subject, a day, a start time, a length, optional chapter. */
async function schedule(
  t: Page,
  day: string,
  time: string,
  chapter?: { label: RegExp; intent: string },
  material?: string,
) {
  await t.goto('/teacher/propose');
  await expect(t.getByRole('heading', { level: 1, name: 'Schedule a class' })).toBeVisible();
  const form = t.getByTestId('propose-form');
  await form.getByLabel('Day').fill(day);
  await form.getByLabel('Start time').fill(time);
  await form.getByLabel('Length').selectOption('25');
  if (chapter) {
    await form.getByRole('checkbox', { name: chapter.label }).check();
    await form.getByRole('combobox', { name: /^Intent for/ }).selectOption(chapter.intent);
  }
  if (material) await form.getByLabel('What do you need?').fill(material);
  // Owner acceptance (29 Oct): Send is offered only after the server-checked review.
  await expect(form.getByRole('button', { name: 'Send proposal' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Review proposal' }).click();
  const review = form.getByTestId('proposal-review');
  await expect(review.getByRole('heading', { name: 'Check your proposal' })).toBeFocused();
  await expect(review).toContainText('₹250 for 25 min · Listed rate ₹600 an hour');
  if (material) await expect(review).toContainText(material);
  await form.getByRole('button', { name: 'Send proposal' }).click();
  await expect(t.getByText(/^Proposal sent\./)).toBeVisible();
}

test('a teacher schedules a class; a parent accepts it on booking details; the child sees it only then', async ({
  browser,
}, info) => {
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const { parent, parent2, teacher, child } = await setUp();

  // The teacher: Schedule a class from the dashboard (B1 lifted by TL-3), with a planned chapter.
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher');
  await expect(t.getByRole('link', { name: 'Schedule a class' })).toBeVisible();
  await t.goto('/teacher/propose');
  await expect(t.getByTestId('proposal-history')).toContainText('No past lessons with you yet.');
  await expect(t.getByTestId('busy-times')).toContainText('No confirmed lessons for you or Kiran in the next 4 weeks.');
  await check(t, phone);
  await shot(t, `TL3-teacher-propose-${device}`);
  await schedule(
    t,
    dayAhead(3),
    '17:05',
    { label: /Maths Practice · 1\. Fractions/, intent: 'new' },
    'Workbook pages on fractions',
  );
  const proposals = t.getByRole('region', { name: 'Proposals waiting for a parent' });
  // Two "Waiting for the parent" badges: the proposal's and the material request sent with it (§3.2 step 4).
  await expect(proposals.getByText('Waiting for the parent', { exact: true })).toHaveCount(2);
  await expect(proposals.getByTestId('material-request')).toContainText('Workbook pages on fractions');
  await expect(proposals.getByTestId('material-request').getByText('Waiting for the parent')).toBeVisible();
  await expect(proposals.getByTestId('planned-chapters')).toContainText('Maths Practice · 1. Fractions · New');
  await expect(proposals.getByText('₹250 for 25 min · Listed rate ₹600 an hour')).toBeVisible();
  await check(t, phone);
  await shot(t, `TL3-teacher-proposed-${device}`);
  // The teacher's notice is never theirs to get, and the parents' never names a free-text note.
  const [pn] = await sql<{ title: string; href: string; kind: string }[]>`
    SELECT title, href, kind FROM notifications WHERE recipient_id = ${parent2.id} AND type = 'lesson_proposed'`;
  expect(pn!.kind).toBe('action');
  expect(pn!.title).toContain(`Ms Priya Rao proposed a Maths lesson for ${child.name}`);
  expect(pn!.href).toMatch(/^\/parent\/bookings\/[0-9a-f-]{36}$/);

  // The child sees nothing yet (TL3-3).
  const k = await (await browser.newContext()).newPage();
  await childSignIn(k, child.username, child.password);
  await k.goto('/student/schedule');
  await expect(k.getByRole('heading', { name: `Maths with ${teacher.name}` })).toHaveCount(0);

  // The parent: Family home count, Family calendar "Waiting for you", then booking details.
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent');
  await expect(p.getByTestId('proposals-waiting')).toContainText('A teacher proposed a lesson.');
  await check(p, phone);
  await shot(p, `TL3-parent-home-${device}`);
  await p.goto('/parent/calendar');
  const forYou = p.getByRole('region', { name: 'Waiting for you' });
  // The proposal and its material request each wait for the parent.
  await expect(forYou.getByText('Waiting for your answer', { exact: true })).toHaveCount(2);
  await forYou.getByRole('link', { name: /^Review and answer:/ }).click();
  await expect(p.getByRole('heading', { level: 1, name: 'A teacher proposed a lesson' })).toBeVisible();
  await expect(p.getByTestId('planned-chapters')).toContainText('Planned by the teacher');
  // Readiness §3.2 step 4: the material request sent with the proposal, answerable here.
  await expect(p.getByTestId('material-request')).toContainText('Workbook pages on fractions');
  await expect(p.getByText('5:05 pm–5:30 pm · 25 min')).toBeVisible(); // the parent's time zone
  await expect(p.getByText(/^Answer by /)).toBeVisible();
  await check(p, phone);
  await shot(p, `TL3-parent-booking-${device}`);
  const bookingUrl = p.url();
  await p.getByRole('button', { name: /^Accept:/ }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(p.getByText('Accepted. The lesson is booked and the teacher has been told.')).toBeVisible();
  await expect(p.getByTestId('lesson-card').getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(p.getByTestId('answer-proposal')).toHaveCount(0);
  await check(p, phone);
  await shot(p, `TL3-parent-accepted-${device}`);

  // The child sees it now; the teacher was told without the child's name.
  await k.goto('/student/schedule');
  await expect(k.getByRole('heading', { name: `Maths with ${teacher.name}` })).toBeVisible();
  const [tn] = await sql<{ title: string }[]>`
    SELECT title FROM notifications WHERE recipient_id = ${teacher.id} AND type = 'lesson_proposal_accepted'`;
  expect(tn!.title).not.toContain(child.name);

  // Another family's parent gets "not found" at the same address (TL3-SEC-3).
  const stranger = await seedParent(sql, 'Meera', 'Iyer');
  const s = await (await browser.newContext()).newPage();
  await signInAs(s, stranger.email);
  await s.goto(bookingUrl);
  await expect(s.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(s.getByText('Kiran')).toHaveCount(0);
  for (const c of [t, k, p, s]) await c.context().close();
});

test('a parent declines with a reason; the teacher withdraws another; both sides see it in words', async ({
  browser,
}, info) => {
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const { parent, teacher } = await setUp();
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await schedule(t, dayAhead(4), '16:00');
  await schedule(t, dayAhead(5), '16:00');

  // The parent declines the first, with a reason.
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent/calendar');
  await p
    .getByRole('region', { name: 'Waiting for you' })
    .getByRole('link', { name: /^Review and answer:/ })
    .first()
    .click();
  await p.getByRole('button', { name: /^Decline:/ }).click();
  const dialog = p.getByRole('dialog');
  await dialog.getByLabel('Reason for the teacher (optional)').fill('Not that day, thanks');
  await check(p, phone);
  await dialog.getByRole('button', { name: 'Decline' }).click();
  await expect(p.getByText('Declined. The teacher has been told.')).toBeVisible();
  await expect(p.getByText('Declined by you')).toBeVisible();
  await shot(p, `TL3-parent-declined-${device}`);

  // The teacher sees "Declined by the parent" and the reason; withdraws the other proposal.
  await t.goto('/teacher/schedule');
  await expect(t.getByText('Declined by the parent')).toBeVisible();
  await expect(t.getByText('The parent’s reason: Not that day, thanks')).toBeVisible();
  await t.getByRole('button', { name: /^Withdraw proposal:/ }).click();
  await t.getByRole('dialog').getByRole('button', { name: 'Withdraw' }).click();
  await expect(t.getByText('Proposal withdrawn. The family has been told.')).toBeVisible();
  await expect(t.getByRole('region', { name: 'Proposals waiting for a parent' })).toHaveCount(0);
  await check(t, phone);
  await shot(t, `TL3-teacher-closed-${device}`);

  // The parent sees "Withdrawn by the teacher"; nothing is waiting any more.
  await p.goto('/parent/calendar');
  await expect(p.getByText('Withdrawn by the teacher')).toBeVisible();
  await expect(p.getByRole('region', { name: 'Waiting for you' })).toHaveCount(0);
  await p.goto('/parent');
  await expect(p.getByTestId('proposals-waiting')).toHaveCount(0);
  for (const c of [t, p]) await c.context().close();
});
