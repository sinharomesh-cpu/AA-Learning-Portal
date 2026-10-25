import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * CR-17 PR 2 with real sign-in, desktop and phone: a parent requests a 25-minute lesson from the
 * free times, the teacher accepts it, the parent, the second parent and the child see it, and
 * the parent cancels it. Another family sees nothing. Invented accounts only.
 * LESSON_SHOTS=<folder> saves the screenshots for the owner's design review (D3A-22).
 */

const sql = seedDb();
const shots = process.env.LESSON_SHOTS;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

async function check(page: Page, phone: boolean) {
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);
}

test('request, accept, see and cancel a lesson', async ({ browser }, info) => {
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  // T1: readable, distinct invented names (the accounts are told apart by email and username).
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const parent2 = await seedParent(sql, 'Ravi', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2.id}, ${child.id})`;
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  // Usual times 4:00-6:00 pm IST every day, and a listed hourly rate of INR 600 (30 minutes).
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${teacher.id}, ${d}, 960, 1080)`;
  await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
            VALUES (${`t-${Math.random().toString(36).slice(2, 12).padEnd(10, 'a')}`}, ${teacher.id}, true, 'INR', 60000, 30)`;

  // The parent chooses the child, teacher and subject, 25 minutes, a day and a start time.
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent/book-teacher');
  await expect(p.getByRole('heading', { level: 1, name: 'Book a teacher' })).toBeVisible();
  await p.getByRole('radio', { name: new RegExp(`${child.name}: Maths with ${teacher.name}`) }).check();
  await expect(p.getByText('Listed rate ₹600 an hour · usual lesson 30 min')).toBeVisible();
  // F6: without choosing a length, the teacher's usual length (30 minutes) is used.
  await p.getByRole('button', { name: 'Show free times' }).click();
  await expect(p.getByRole('heading', { name: '3. Choose a day and time' })).toBeVisible();
  await expect(p.getByLabel('2. How long?')).toHaveValue('');
  await expect(p.getByLabel('2. How long?').locator('option:checked')).toHaveText(
    'Teacher’s usual length (30 minutes)',
  );
  await expect(p.getByText('₹300 for 30 min').first()).toBeVisible(); // ₹600 an hour x 30 / 60
  await p.getByLabel('2. How long?').selectOption('25');
  await p.getByRole('button', { name: 'Show free times' }).click();
  await expect(p.getByText(/^25-minute Maths lesson/)).toBeVisible();
  // U2: the 4-week window as a calendar with a month heading and a Mon–Sun grid.
  const grid = p.getByRole('navigation', { name: 'Days with free times' });
  const firstMonth = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.now() + 86_400_000));
  await expect(grid.getByRole('heading', { level: 3, name: firstMonth })).toBeVisible();
  const days = grid.getByRole('link');
  await expect(days.first()).toHaveAccessibleName(/^\w+day \d{1,2} \w+, 4 free times$/);
  // Keyboard: focus the third free day and open it with Enter.
  await days.nth(2).focus();
  await p.keyboard.press('Enter');
  // Wait for that day's times to replace the first day's before choosing one.
  await expect(days.nth(2)).toHaveAttribute('aria-current', 'date');
  await expect(p.getByRole('radio', { name: /4:00 pm/ })).toBeVisible();
  await p.getByRole('radio', { name: /4:30 pm/ }).check();
  // F7: each time shows the whole lesson's price, its length and the rate it comes from.
  await expect(p.getByText('₹250 for 25 min').first()).toBeVisible(); // ₹600 an hour x 25 / 60
  await expect(p.getByText('Listed rate ₹600 an hour').first()).toBeVisible();
  await check(p, phone);
  await shot(p, `PR2-book-${device}`);
  const bookUrl = p.url();
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(p.getByText('Request sent.')).toBeVisible();
  await expect(p.getByText('Waiting for the teacher').first()).toBeVisible();
  await expect(p.getByText('₹250 for 25 min · Listed rate ₹600 an hour')).toBeVisible();
  await check(p, phone);
  await shot(p, `PR2-parent-requested-${device}`);
  // U2 (F8): back on the same day, the requested time is gone and the page says why.
  await p.goto(bookUrl);
  await expect(
    p.getByText(/^1 time on this day is hidden: already requested for Kiran with this teacher\./),
  ).toBeVisible();
  await expect(p.getByRole('radio', { name: /4:30 pm/ })).toHaveCount(0);
  await check(p, phone);
  await shot(p, `PR2-book-already-requested-${device}`);

  // The teacher sees the request on the dashboard and accepts it in My schedule.
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher');
  await expect(t.getByTestId('lesson-requests-waiting')).toContainText('1 lesson request is waiting');
  await t.getByRole('link', { name: 'Review requests' }).click();
  await expect(t.getByRole('heading', { level: 1, name: 'My schedule' })).toBeVisible();
  await expect(t.getByText(`Maths with ${child.name} · Grade 5`)).toBeVisible();
  await check(t, phone);
  await shot(t, `PR2-teacher-request-${device}`);
  await t.getByRole('button', { name: /^Accept:/ }).click();
  await expect(t.getByText('Accepted. The family has been told.')).toBeVisible();
  await expect(t.getByRole('heading', { name: 'Upcoming lessons' })).toBeVisible();
  await expect(t.getByText('Confirmed').first()).toBeVisible();
  await check(t, phone);
  await shot(t, `PR2-teacher-schedule-${device}`);
  await t.goto('/teacher');
  await expect(t.getByRole('heading', { name: `Maths with ${child.name}` })).toBeVisible();
  // B4: the linked child is on the roster; B1: no Propose button; real-account rules only.
  const roster = t.getByRole('region', { name: 'My students' });
  await expect(roster.getByRole('heading', { name: child.name })).toBeVisible();
  await expect(roster).not.toContainText('later phase');
  await expect(t.getByRole('link', { name: 'Propose a meeting' })).toHaveCount(0);
  const teacherRules = t.getByRole('region', { name: 'Lesson rules' });
  await expect(teacherRules).toContainText('To change the time, the parent cancels and requests a new one.');
  await expect(teacherRules).not.toContainText(/propose|move a lesson/i);
  await check(t, phone);
  await shot(t, `PR2-teacher-home-${device}`);

  // Both parents see it confirmed; the second parent got a notification naming the child.
  await p.goto('/parent/calendar');
  await expect(p.getByText('Confirmed').first()).toBeVisible();
  await shot(p, `PR2-parent-calendar-${device}`);
  await p.goto('/parent');
  await expect(p.getByText(/Maths with/).first()).toBeVisible();
  // B2 (owner, 25 Oct 2026): the week's reminder column (desktop only) states the real in-app
  // reminder, never email.
  if (!phone) {
    const weekRow = p.getByRole('row').filter({ hasText: /Maths/ }).first();
    await expect(weekRow).toContainText('In AA Pro, 15 min before');
    await expect(weekRow).not.toContainText(/email/i);
  }
  // F1; PR 7: the rules say what is available now, including the best-effort in-app reminder.
  const rules = p.getByRole('region', { name: 'Lesson rules' });
  await expect(rules).toContainText(
    'Teacher lessons: you or the teacher can cancel up to 30 minutes before the start.',
  );
  await expect(rules).toContainText(
    'AI Tutor lessons: you or your child can cancel or move them any time before the start.',
  );
  await expect(rules).toContainText(
    'Lesson reminders appear in AA Pro 15 minutes before the start, only while AA Pro is open or when you come back before the lesson starts.',
  );
  await expect(rules).not.toContainText(/email|propose|teacher’s move/i);
  await check(p, phone);
  await shot(p, `PR2-parent-home-${device}`);
  const [note] = await sql<{ title: string }[]>`
    SELECT title FROM notifications WHERE recipient_id = ${parent2.id} AND type = 'lesson_accepted'`;
  expect(note!.title).toContain(child.name);
  const [tnote] = await sql<{ title: string }[]>`
    SELECT title FROM notifications WHERE recipient_id = ${teacher.id} AND type = 'lesson_requested'`;
  expect(tnote!.title).not.toContain(child.name);

  // The child sees it in My schedule, without a price; U1: Join says when it opens, and is unavailable.
  const k = await (await browser.newContext()).newPage();
  await childSignIn(k, child.username, child.password);
  await k.goto('/student/schedule');
  await expect(k.getByRole('heading', { name: `Maths with ${teacher.name}` })).toBeVisible();
  await expect(k.getByText('₹')).toHaveCount(0);
  const join = k.getByRole('button', { name: 'Join opens at 4:20 pm' });
  await expect(join).toBeVisible();
  await expect(join).toHaveAttribute('aria-disabled', 'true');
  await expect(k.getByRole('link', { name: /join/i })).toHaveCount(0);
  await check(k, phone);
  await shot(k, `PR2-child-schedule-${device}`);

  // Another family sees nothing.
  const stranger = await seedParent(sql, 'Meera', 'Iyer');
  const s = await (await browser.newContext()).newPage();
  await signInAs(s, stranger.email);
  await s.goto('/parent/calendar');
  await expect(s.getByTestId('lesson-card')).toHaveCount(0);

  // The parent cancels (more than 30 minutes ahead); the teacher is told.
  await p.goto('/parent/calendar');
  await p.getByRole('button', { name: /^Cancel lesson:/ }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Cancel lesson' }).click();
  await expect(p.getByText('Lesson cancelled. The teacher has been told.')).toBeVisible();
  // U3 (B3): "Cancelled by you" for the parent who cancelled, the first name for the other parent.
  await expect(p.getByText('Cancelled by you')).toBeVisible();
  await check(p, phone);
  await shot(p, `PR2-parent-cancelled-${device}`);
  const p2 = await (await browser.newContext()).newPage();
  await signInAs(p2, parent2.email);
  await p2.goto('/parent/calendar');
  await expect(p2.getByText('Cancelled by Anita')).toBeVisible();
  await p2.context().close();
  const [cancelled] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM notifications WHERE recipient_id = ${teacher.id} AND type = 'lesson_cancelled'`;
  expect(cancelled!.n).toBe(1);
  for (const c of [p, t, k, s]) await c.context().close();
});
