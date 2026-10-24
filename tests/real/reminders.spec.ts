import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import {
  actionRequests,
  bellCount,
  childSignIn,
  expectNoHorizontalScroll,
  noSeriousA11yIssues,
  openBell,
  panel,
  refreshOnReturn,
  rows,
  setHidden,
  signInAs,
} from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher, type Sql } from './notificationSeed';

/**
 * CR-17 PR 7 acceptance (D3A-10 Option A: best-effort, in-app only). With the browser clock under
 * the test's control: the reminder appears on the first bell refresh after the 15-minute mark (R1),
 * once only (R4); a hidden tab gets nothing until it is shown again, then gets it at once (R2);
 * none for a cancelled lesson (R3); the teacher's never names the child (R5); the guidance is shown
 * where reminders are described (R7). The "15-minute mark" is crossed by moving the lesson's start
 * on the database clock, the clock every reminder rule uses. Invented accounts only.
 */

const sql = seedDb();
const shots = process.env.LESSON_SHOTS;
const GUIDANCE =
  'Lesson reminders appear in AA Pro 15 minutes before the start, only while AA Pro is open or when you come back before the lesson starts.';

async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

async function lessonAt(
  db: Sql,
  teacher: string,
  child: string,
  parent: string,
  fromMin: number,
  status = 'confirmed',
) {
  return db.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [l] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, closed_at, closed_by, closed_by_account,
                           currency, rate_minor, price_minor, price_basis)
      SELECT ${teacher}, ${child}, ${parent}, 'maths', s, 30, s + interval '30 minutes', s - interval '3 days',
             s - interval '3 days' + interval '48 hours', ${status}, s - interval '3 days' + interval '1 minute',
             CASE WHEN ${status} = 'cancelled' THEN s - interval '1 day' END,
             CASE WHEN ${status} = 'cancelled' THEN 'parent' END,
             CASE WHEN ${status} = 'cancelled' THEN ${parent}::uuid END,
             'INR', 60000, 30000, 'listed'
      FROM (SELECT date_trunc('minute', now()) + make_interval(mins => ${fromMin}) AS s) x RETURNING id`;
    return l!.id;
  });
}
/** Moves a lesson to start `min` minutes from now (database clock): "the 15-minute mark has passed". */
async function moveTo(db: Sql, id: string, min: number) {
  await db.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    await tx`UPDATE lessons SET starts_at = date_trunc('minute', now()) + make_interval(mins => ${min}),
                                ends_at = date_trunc('minute', now()) + make_interval(mins => ${min + 30})
             WHERE id = ${id}`;
  });
}
const remindersFor = async (db: Sql, recipient: string) =>
  (
    await db<{ n: number }[]>`
      SELECT count(*)::int AS n FROM notifications WHERE recipient_id = ${recipient} AND type = 'lesson_reminder'`
  )[0]!.n;

/** Signs in with the browser clock installed, then freezes it: refreshes happen only when the test runs time. */
async function frozen(page: Page, signIn: () => Promise<void>) {
  await page.clock.install();
  await signIn();
  await page.clock.pauseAt(new Date(Date.now() + 5_000));
}

test('the 15-minute reminder: open page, hidden tab, once only, cancelled, teacher wording, guidance', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  const lesson = await lessonAt(sql, teacher.id, child.id, parent.id, 17); // not yet inside 15 minutes
  await lessonAt(sql, teacher.id, child.id, parent.id, 5, 'cancelled'); // inside 15 minutes, never reminded (R3)

  // R7: the parent's rules describe reminders with the agreed guidance.
  const p = await (await browser.newContext()).newPage();
  await frozen(p, () => signInAs(p, parent.email));
  await p.goto('/parent');
  await expect(p.getByRole('region', { name: 'Lesson rules' })).toContainText(GUIDANCE);

  // R1: nothing before the mark; the first bell refresh after it brings the reminder. Refreshes are
  // triggered by returning to the tab, which runs at once; the 60-second timer calls the same
  // refresh and its cadence is covered by the CR-16 tests (timed refreshes under a paused browser
  // clock proved unreliable in CI).
  await refreshOnReturn(p);
  expect(await remindersFor(sql, parent.id)).toBe(0);
  await moveTo(sql, lesson, 14);
  await refreshOnReturn(p);
  await expect(bellCount(p)).toHaveText('1');
  await openBell(p);
  const row = rows(p).filter({ hasText: /^Kiran’s Maths lesson with Ms Priya Rao starts at / });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Reminders appear only while AA Pro is open');
  await p.keyboard.press('Escape');
  await expect(panel(p)).toHaveCount(0);

  // R4: further refreshes never repeat it.
  await refreshOnReturn(p);
  await refreshOnReturn(p);
  expect(await remindersFor(sql, parent.id)).toBe(1);
  // Accessibility and layout of the panel with the reminder (the scan needs the clock running).
  await p.clock.resume();
  await openBell(p);
  await noSeriousA11yIssues(p);
  if (phone) await expectNoHorizontalScroll(p);
  await shot(p, `PR7-parent-reminder-${device}`);
  await p.keyboard.press('Escape');

  // R2: the child's tab is hidden when the mark passes: no request, no reminder until it is shown.
  // A second invented child (Asha) with her own teacher, so her lesson can't overlap Kiran's.
  const teacher2 = await seedTeacher(sql, 'approved', 'Mr Arun Iyer');
  const asha = await seedChild(sql, parent.id, 'Asha');
  await seedActiveLink(sql, teacher2.id, asha.id, parent.id);
  const second = await lessonAt(sql, teacher2.id, asha.id, parent.id, 120);
  const k = await (await browser.newContext()).newPage();
  await frozen(k, () => childSignIn(k, asha.username, asha.password));
  await k.goto('/student/schedule');
  await expect(
    k.getByText('AA Pro shows a reminder 15 minutes before a lesson, but only while AA Pro is open.'),
  ).toBeVisible();
  const before = await remindersFor(sql, asha.id);
  expect(before).toBe(0);
  await setHidden(k, true);
  const sent = actionRequests(k);
  await moveTo(sql, second, 13);
  await k.clock.runFor(180_000);
  expect(sent).toHaveLength(0);
  expect(await remindersFor(sql, asha.id)).toBe(0);
  const back = k.waitForResponse((r) => r.request().method() === 'POST' && !!r.request().headers()['next-action']);
  await setHidden(k, false);
  await back;
  expect(await remindersFor(sql, asha.id)).toBe(1);
  await openBell(k);
  await expect(rows(k).filter({ hasText: /^Your Maths lesson with Mr Arun Iyer starts at / })).toHaveCount(1);
  await k.clock.resume();
  await noSeriousA11yIssues(k);
  await shot(k, `PR7-child-reminder-${device}`);

  // R5: the teacher's reminders never name the child; the teacher's rules show the guidance.
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher');
  await expect(t.getByRole('region', { name: 'Lesson rules' })).toContainText(GUIDANCE);
  const titles = await sql<{ title: string; body: string }[]>`
    SELECT title, body FROM notifications WHERE recipient_id = ${teacher.id} AND type = 'lesson_reminder'`;
  expect(titles).toHaveLength(1);
  for (const n of titles) {
    expect(n.title).toMatch(/^Your Maths lesson \(Grade 5\) starts at /);
    expect(n.title + n.body).not.toContain('Kiran');
  }
  // Nothing left AA Pro: no email for any reminder.
  const [mail] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM email_outbox WHERE to_address IN (${parent.email}, ${teacher.email})`;
  expect(mail!.n).toBe(0);
  for (const pg of [p, k, t]) await pg.context().close();
});
