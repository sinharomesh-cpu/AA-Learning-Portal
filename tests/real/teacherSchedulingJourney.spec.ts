import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * Owner acceptance (29 Oct 2026): the teacher-side scheduling journey, end to end, through the real
 * screens and the real sign-in form, desktop and phone:
 *  1. the teacher signs in and reaches Teacher Home ("Schedule a class" is there);
 *  2. opens My schedule from the Teacher menu and finds "Schedule a class";
 *  3. chooses an eligible child and subject (two linked children, so the choice is real);
 *  4. chooses a day, a start time and a length;
 *  5. sees their own and the child's confirmed lessons as busy, without the child's other teacher;
 *  6. adds a planned chapter and an optional material request;
 *  7. reviews the proposal (server-checked, with the price) and sends it;
 *  8. sees it in My schedule as "Waiting for the parent";
 *  9. a parent sees it, opens booking details and accepts;
 * 10. the child sees the lesson only after it is confirmed.
 * Invented accounts and a throw-away database only. JOURNEY_SHOTS=<folder> saves a screenshot of
 * every step, for the owner.
 */

const sql = seedDb();
const shots = process.env.JOURNEY_SHOTS;
async function shot(page: Page, device: string, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${device}-${name}.png`, fullPage: true });
}
const dayAhead = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(Date.now() + n * 86_400_000);

/** A confirmed maths lesson `fromMin` minutes from now (rules skipped for this insert only). */
async function confirmedAt(teacher: string, child: string, parent: string, fromMin: number) {
  await sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    await tx`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${teacher}, ${child}, ${parent}, 'maths', s, 30, s + interval '30 minutes', s - interval '3 days',
             s - interval '3 days' + interval '48 hours', 'confirmed', s - interval '3 days' + interval '1 minute',
             'INR', 60000, 30000, 'listed'
      FROM (SELECT date_trunc('hour', now()) + make_interval(mins => ${fromMin}) AS s) x`;
  });
}

test('the teacher schedules a class from My schedule; the parent accepts; the child sees it only then', async ({
  browser,
}, info) => {
  test.setTimeout(300_000);
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const check = async (page: Page) => {
    await noSeriousA11yIssues(page);
    if (phone) await expectNoHorizontalScroll(page);
  };

  // Invented accounts: an approved, active teacher with a listed rate, linked to two children.
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const kiran = await seedChild(sql, parent.id, 'Kiran');
  const otherParent = await seedParent(sql, 'Meera', 'Iyer');
  const asha = await seedChild(sql, otherParent.id, 'Asha');
  await seedActiveLink(sql, teacher.id, kiran.id, parent.id);
  await seedActiveLink(sql, teacher.id, asha.id, otherParent.id);
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${Math.random().toString(36).slice(2, 12).padEnd(10, 'a')}`}, ${teacher.id}, true, 'INR', 60000, 30)`;
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO books (owner_id, title, subject, form, status) VALUES (${parent.id}, 'Maths Practice', 'maths', 'chapter_files', 'published')
    RETURNING id`;
  for (const [i, t] of ['Fractions', 'Decimals'].entries())
    await sql`INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${t})`;
  await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${kiran.id})`;
  // Busy times: the teacher's lesson with Asha, and Kiran's lesson with another teacher.
  // The other teacher must be linked to Kiran: otherwise AA Pro's clean-up rightly cancels the
  // lesson (OC-53), which happens whenever the clean-up runs.
  const otherTeacher = await seedTeacher(sql, 'approved', 'Mr Vikram Nair');
  await seedActiveLink(sql, otherTeacher.id, kiran.id, parent.id);
  await confirmedAt(teacher.id, asha.id, otherParent.id, 2 * 1440 + 60);
  await confirmedAt(otherTeacher.id, kiran.id, parent.id, 2 * 1440 + 180);
  const seeded = await sql<{ teacher_id: string }[]>`
    SELECT teacher_id FROM lessons WHERE status = 'confirmed' AND student_id IN (${kiran.id}, ${asha.id}) ORDER BY starts_at`;
  expect(seeded.map((r) => r.teacher_id)).toEqual([teacher.id, otherTeacher.id]);

  // 1. Sign in through the real sign-in form; Teacher Home has "Schedule a class".
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await expect(t).toHaveURL(/\/teacher$/);
  await expect(t.getByRole('link', { name: 'Schedule a class' })).toBeVisible();
  await check(t);
  await shot(t, device, '01-teacher-home');

  // 2. My schedule from the Teacher menu; "Schedule a class" is there too.
  if (phone) await t.getByRole('button', { name: 'Open teacher menu' }).click();
  await t.getByRole('navigation', { name: 'Teacher menu' }).getByRole('link', { name: 'My schedule' }).click();
  await expect(t.getByRole('heading', { level: 1, name: 'My schedule' })).toBeVisible();
  await check(t);
  await shot(t, device, '02-my-schedule');
  await t.getByRole('link', { name: 'Schedule a class' }).click();
  await expect(t.getByRole('heading', { level: 1, name: 'Schedule a class' })).toBeVisible();

  // 3. Only linked children, in their ticked subjects.
  const who = t.getByRole('group', { name: '1. Who is the lesson for?' });
  await expect(who.getByRole('radio')).toHaveCount(2);
  await shot(t, device, '03-choose-child');
  await who.getByRole('radio', { name: /^Kiran: Maths/ }).check();
  await t.getByRole('button', { name: 'Continue' }).click();
  const form = t.getByTestId('propose-form');

  // 4-5. Day, start time and length; busy times without the other teacher's name.
  const busy = form.getByTestId('busy-times');
  await expect(busy).toContainText('your lesson');
  await expect(busy).toContainText('Kiran has a lesson');
  await expect(busy).not.toContainText('Vikram');
  await expect(busy).not.toContainText('Asha');
  await form.getByLabel('Day').fill(dayAhead(3));
  await form.getByLabel('Start time').fill('17:05');
  await form.getByLabel('Length').selectOption('25');
  await check(t);
  await shot(t, device, '04-05-time-and-busy');

  // 6. A planned chapter and a material request (both optional).
  await form.getByRole('checkbox', { name: /Maths Practice · 1\. Fractions/ }).check();
  await form.getByRole('combobox', { name: /^Intent for/ }).selectOption('new');
  await form.getByLabel('What do you need?').fill('Workbook pages on fractions');
  await form.getByLabel('Note for the parent (optional)').fill('Any edition is fine');
  await shot(t, device, '06-chapter-and-material');

  // 7. Review (checked and priced by the server), then send.
  await expect(form.getByRole('button', { name: 'Send proposal' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Review proposal' }).click();
  const review = form.getByTestId('proposal-review');
  await expect(review).toContainText('Kiran · Maths');
  await expect(review).toContainText('5:05 pm–5:30 pm · 25 min');
  await expect(review).toContainText('₹250 for 25 min · Listed rate ₹600 an hour');
  await expect(review).toContainText('Maths Practice · 1. Fractions · New');
  await expect(review).toContainText('Workbook pages on fractions (note: Any edition is fine)');
  await check(t);
  await shot(t, device, '07-review');
  await form.getByRole('button', { name: 'Send proposal' }).click();

  // 8. In My schedule: waiting for the parent, with its chapter, price and material request.
  await expect(t.getByText(/^Proposal sent\./)).toBeVisible();
  const waiting = t.getByRole('region', { name: 'Proposals waiting for a parent' });
  await expect(waiting.getByTestId('lesson-card')).toHaveCount(1);
  await expect(waiting).toContainText('Maths with Kiran');
  await expect(waiting.getByTestId('material-request')).toContainText('Workbook pages on fractions');
  await check(t);
  await shot(t, device, '08-sent-waiting');

  // 10 (before). The child sees nothing yet.
  const k = await (await browser.newContext()).newPage();
  await childSignIn(k, kiran.username, kiran.password);
  await k.goto('/student/schedule');
  await expect(k.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(k.getByRole('heading', { name: `Maths with ${teacher.name}` })).toHaveCount(0);
  await shot(k, device, '10a-child-before');

  // 9. The parent: Family home, Family calendar, booking details, Accept.
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await expect(p.getByTestId('proposals-waiting')).toContainText('A teacher proposed a lesson.');
  await shot(p, device, '09a-parent-home');
  await p.goto('/parent/calendar');
  const forYou = p.getByRole('region', { name: 'Waiting for you' });
  await shot(p, device, '09b-parent-calendar');
  await forYou.getByRole('link', { name: /^Review and answer:/ }).click();
  await expect(p.getByRole('heading', { level: 1, name: 'A teacher proposed a lesson' })).toBeVisible();
  await expect(p.getByText('5:05 pm–5:30 pm · 25 min')).toBeVisible();
  await expect(p.getByTestId('material-request')).toContainText('Workbook pages on fractions');
  await check(p);
  await shot(p, device, '09c-parent-booking-details');
  await p.getByRole('button', { name: /^Accept:/ }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(p.getByText('Accepted. The lesson is booked and the teacher has been told.')).toBeVisible();
  await expect(p.getByTestId('lesson-card').getByText('Confirmed', { exact: true })).toBeVisible();
  await shot(p, device, '09d-parent-accepted');

  // 10 (after). The child sees the confirmed lesson; the teacher sees it as upcoming.
  await k.goto('/student/schedule');
  await expect(k.getByRole('heading', { name: `Maths with ${teacher.name}` })).toBeVisible();
  await check(k);
  await shot(k, device, '10b-child-after');
  await t.goto('/teacher/schedule');
  await expect(t.getByRole('region', { name: 'Proposals waiting for a parent' })).toHaveCount(0);
  await expect(t.getByTestId('lesson-card').filter({ hasText: 'Maths with Kiran' }).first()).toContainText('Confirmed');
  await shot(t, device, '11-teacher-confirmed');
  for (const c of [t, k, p]) await c.context().close();
});
