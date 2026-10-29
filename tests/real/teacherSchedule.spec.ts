import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import type { Sql } from 'postgres';
import { formatClock, localDate } from '../../src/lib/lessonDisplay';
import { addDays, mondayOf, weekBounds } from '../../src/lib/teacherCalendar';
import { expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * Teacher scheduling: the week calendar on My schedule, desktop and phone, real sign-in.
 * Lessons are seeded straight into the database (rules skipped for these inserts only) so that
 * every state appears: a request to answer, confirmed lessons either side of the 30-minute
 * cancellation cut-off, one to record, one taught, one cancelled by the parent and one weeks
 * ahead. The teacher opens the calendar from the dashboard, moves between weeks within the
 * 30-days-back to 4-weeks-ahead bounds, opens a lesson from the calendar and accepts the request.
 * Another teacher sees none of it. Invented accounts only. TEACHER_SCHEDULE_SHOTS=<folder> saves screenshots.
 */

const sql = seedDb();
const TZ = 'Asia/Kolkata';
const shots = process.env.TEACHER_SCHEDULE_SHOTS;

async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

type Kind = 'requested' | 'confirmed' | 'cancelled' | 'taught';

/** A 30-minute maths lesson starting `when` minutes from now (whole minutes), or at a given time. */
async function seedLesson(
  db: Sql,
  ids: { teacher: string; child: string; parent: string },
  when: number | Date,
  kind: Kind,
) {
  return db.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [row] = await tx<{ id: string; starts_at: Date; ends_at: Date }[]>`
      WITH x AS (SELECT ${when instanceof Date ? when : null}::timestamptz AS at,
                  date_trunc('minute', now()) + make_interval(mins => ${when instanceof Date ? 0 : when}) AS rel),
           y AS (SELECT COALESCE(at, rel) AS s FROM x),
           r AS (SELECT s, CASE WHEN ${kind} = 'requested' THEN date_trunc('minute', now()) - interval '1 hour'
                                ELSE s - interval '3 days' END AS req FROM y)
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, closed_at, closed_by, closed_by_account,
                           outcome, outcome_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${ids.teacher}, ${ids.child}, ${ids.parent}, 'maths', s, 30, s + interval '30 minutes', req,
             LEAST(req + interval '48 hours', s - interval '2 hours'),
             CASE WHEN ${kind} = 'requested' THEN 'requested' WHEN ${kind} = 'cancelled' THEN 'cancelled' ELSE 'confirmed' END,
             CASE WHEN ${kind} = 'requested' THEN NULL ELSE req + interval '1 minute' END,
             CASE WHEN ${kind} = 'cancelled' THEN s - interval '1 day' END,
             CASE WHEN ${kind} = 'cancelled' THEN 'parent' END,
             CASE WHEN ${kind} = 'cancelled' THEN ${ids.parent}::uuid END,
             CASE WHEN ${kind} = 'taught' THEN 'taught' END,
             CASE WHEN ${kind} = 'taught' THEN s + interval '31 minutes' END,
             'INR', 60000, 30000, 'listed'
      FROM r RETURNING id, starts_at, ends_at`;
    return { id: row!.id, start: row!.starts_at, end: row!.ends_at };
  });
}

const calendar = (page: Page) => page.getByTestId('week-calendar');
const entry = (page: Page, id: string) => calendar(page).locator(`a[href="#lesson-${id}"]`);
const timeText = (l: { start: Date; end: Date }) => `${formatClock(l.start, TZ)} – ${formatClock(l.end, TZ)}`;

async function openWeekOf(page: Page, at: Date) {
  await page.goto(`/teacher/schedule?week=${mondayOf(localDate(at, TZ))}#week`);
  await expect(calendar(page)).toBeVisible();
}

test('the teacher’s week calendar: every lesson state, week bounds, and acting from the calendar', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${teacher.id}, ${d}, 960, 1080)`;
  const ids = { teacher: teacher.id, child: child.id, parent: parent.id };
  const soon = await seedLesson(sql, ids, 20, 'confirmed'); // inside the 30-minute cut-off
  // The request must be inside the usual times (4:00-6:00 pm in India) to be accepted: 4:00 pm in 3 days.
  const requestDay = localDate(new Date(Date.now() + 3 * 86_400_000), TZ);
  const request = await seedLesson(sql, ids, new Date(`${requestDay}T10:30:00Z`), 'requested');
  const later = await seedLesson(sql, ids, 2 * 1440 + 60, 'confirmed');
  const cancelled = await seedLesson(sql, ids, 2 * 1440 + 180, 'cancelled');
  const toRecord = await seedLesson(sql, ids, -2 * 1440, 'confirmed');
  const taught = await seedLesson(sql, ids, -1 * 1440 - 240, 'taught');
  const farAhead = await seedLesson(sql, ids, 16 * 1440, 'confirmed');

  // 1. From the dashboard to the week calendar.
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher');
  await t.getByTestId('open-week-calendar').click();
  await expect(t).toHaveURL(/\/teacher\/schedule#week$/);
  await expect(calendar(t)).toBeVisible();
  const now = new Date();
  const bounds = weekBounds(now, TZ);
  await expect(calendar(t).getByTestId('calendar-day')).toHaveCount(7);
  await expect(calendar(t).locator(`[data-date="${bounds.today}"]`)).toContainText('Today');
  await expect(calendar(t).getByText('Too soon for new requests').first()).toBeVisible();
  await expect(calendar(t).getByText('4:00 pm – 6:00 pm').first()).toBeVisible(); // usual times, as a guide
  await noSeriousA11yIssues(t);
  if (phone) await expectNoHorizontalScroll(t);
  await shot(t, `teacher-week-${device}`);

  // 2. Each lesson is on its own day in the teacher's zone, with its state in words.
  const expectEntry = async (l: { id: string; start: Date; end: Date }, state: string, text: RegExp | string) => {
    await openWeekOf(t, l.start);
    const day = calendar(t).locator(`[data-date="${localDate(l.start, TZ)}"]`);
    const e = day.locator(`a[href="#lesson-${l.id}"]`);
    await expect(e).toHaveAttribute('data-state', state);
    await expect(e).toHaveAccessibleName(`Maths with ${child.name}, ${timeText(l)}: ${text}`);
  };
  await expectEntry(soon, 'confirmed', 'Confirmed');
  await expect(entry(t, soon.id)).toContainText('Within 30 minutes of the start: can’t be cancelled');
  await expectEntry(later, 'confirmed', 'Confirmed');
  await expect(entry(t, later.id)).toContainText(/Can be cancelled until \d{1,2}:\d{2} [ap]m/);
  await expectEntry(cancelled, 'closed', 'Cancelled by the parent');
  await expectEntry(toRecord, 'record', 'Record how it went');
  await expectEntry(taught, 'taught', 'Taught');
  await expectEntry(farAhead, 'confirmed', 'Confirmed');
  await expectEntry(request, 'request', 'Waiting for your answer');
  // No attendance, package or price appears on the calendar (Teaching Model rev 7.1 keeps them separate).
  await expect(calendar(t)).not.toContainText(/₹|attend|package/i);

  // 3. The soon lesson's card has no Cancel button (the server would refuse it too).
  await openWeekOf(t, soon.start);
  await entry(t, soon.id).click();
  await expect(t).toHaveURL(new RegExp(`#lesson-${soon.id}$`));
  const soonCard = t.getByRole('listitem').filter({ has: t.locator(`#lesson-${soon.id}`) });
  await expect(t.locator(`#lesson-${soon.id}`)).toBeInViewport();
  await expect(soonCard.getByRole('button', { name: /^Cancel/ })).toHaveCount(0);

  // 4. Act from the calendar: open the request and accept it; the calendar shows it confirmed.
  await openWeekOf(t, request.start);
  await entry(t, request.id).click();
  const card = t.getByRole('listitem').filter({ has: t.locator(`#lesson-${request.id}`) });
  await expect(t.locator(`#lesson-${request.id}`)).toBeInViewport();
  await card.getByRole('button', { name: /^Accept:/ }).click();
  await expect(t.getByText('Accepted. The family has been told.')).toBeVisible();
  await expectEntry(request, 'confirmed', 'Confirmed');
  await shot(t, `teacher-week-after-accept-${device}`);

  // 5. Week navigation stops at 4 weeks ahead and 30 days back; odd values are kept in bounds.
  await t.goto('/teacher/schedule#week');
  const nav = calendar(t).getByRole('navigation', { name: 'Choose a week' });
  await expect(nav.getByText('This week')).toHaveAttribute('aria-current', 'date');
  let forward = 0;
  while (await nav.getByRole('link', { name: 'Next week' }).count()) {
    await nav.getByRole('link', { name: 'Next week' }).click();
    forward += 1;
    await expect(t).toHaveURL(new RegExp(`week=${addDays(bounds.current, 7 * forward)}`));
  }
  expect(addDays(bounds.current, 7 * forward)).toBe(bounds.last);
  await expect(nav.getByText('Next week')).toHaveAttribute('aria-disabled', 'true');
  await expect(calendar(t).getByText('Beyond the 4-week request window').first()).toBeVisible();
  await nav.getByRole('link', { name: 'This week' }).click();
  await expect(nav.getByText('This week')).toHaveAttribute('aria-current', 'date');
  await t.goto('/teacher/schedule?week=1999-01-01#week');
  await expect(calendar(t).locator(`[data-date="${bounds.first}"]`)).toBeVisible();
  await expect(nav.getByText('Previous week')).toHaveAttribute('aria-disabled', 'true');
  await t.goto('/teacher/schedule?week=2026-02-30#week');
  await expect(nav.getByText('This week')).toHaveAttribute('aria-current', 'date');
  if (phone) await expectNoHorizontalScroll(t);

  // 6. Another teacher sees none of these lessons, in any week.
  const other = await seedTeacher(sql, 'approved', 'Mr Arjun Mehta');
  const o = await (await browser.newContext()).newPage();
  await signInAs(o, other.email);
  for (const l of [soon, request, farAhead]) {
    await openWeekOf(o, l.start);
    await expect(o.getByTestId('calendar-lesson')).toHaveCount(0);
    await expect(o.locator(`a[href="#lesson-${l.id}"]`)).toHaveCount(0);
  }
  await expect(calendar(o).getByText('No lessons').first()).toBeVisible();
});

test('a parent can’t open the teacher’s schedule', async ({ browser }) => {
  const parent = await seedParent(sql);
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/teacher/schedule?week=2026-11-02');
  await expect(p.getByTestId('week-calendar')).toHaveCount(0);
});
