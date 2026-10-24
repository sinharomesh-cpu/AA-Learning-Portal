import { mkdirSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher, type Sql } from './notificationSeed';

/**
 * OC-53 Option A with real sign-in, desktop and phone (owner, 25 Oct 2026; migration 0031 draft):
 * a parent removes a teacher. The lesson starting within 30 minutes stays booked, with Join Class
 * still working for its teacher, the parent and the child (the parent had allowed meeting links);
 * tomorrow's lesson is cancelled. Another family gets "not found". Zoom is never contacted.
 * Invented accounts only. LESSON_SHOTS=<folder> saves screenshots for the owner's review.
 */

const sql = seedDb();
const shots = process.env.LESSON_SHOTS;
const LINK = 'https://us02web.zoom.us/wc/join/81234567890?pwd=SecretPass1';

async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
async function check(page: Page, phone: boolean) {
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);
}
async function stubZoom(context: BrowserContext) {
  await context.route(/^https:\/\/([a-z0-9-]+\.)*zoom\.us\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Zoom stub</title><p>Zoom stub</p>' }),
  );
}
/** Join Class goes to AA Pro's own address, which answers 303 to the meeting; returns the Location. */
async function joinFrom(page: Page): Promise<string> {
  const [response] = await Promise.all([
    page.context().waitForEvent('response', (r) => /\/lessons\/[0-9a-f-]+\/join$/.test(new URL(r.url()).pathname)),
    page
      .getByRole('link', { name: /^Join Class/ })
      .first()
      .click(),
  ]);
  expect(response.status()).toBe(303);
  for (const tab of page.context().pages()) if (tab !== page) await tab.close();
  return response.headers()['location'] ?? '';
}
/** A confirmed maths lesson starting `fromMin` minutes from now (rules skipped for this insert only). */
async function lessonAt(db: Sql, teacher: string, child: string, parent: string, fromMin: number) {
  return db.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [l] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${teacher}, ${child}, ${parent}, 'maths', s, 30, s + interval '30 minutes', s - interval '3 days',
             s - interval '3 days' + interval '48 hours', 'confirmed', s - interval '3 days' + interval '1 minute', 'INR',
             60000, 30000, 'listed'
      FROM (SELECT date_trunc('minute', now()) + make_interval(mins => ${fromMin}) AS s) x RETURNING id`;
    return l!.id;
  });
}

test('OC-53: removing a teacher keeps the lesson starting within 30 minutes and cancels the rest', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  // The parent had allowed the teacher's own links; the teacher saved one for the soon lesson.
  await sql`INSERT INTO meeting_link_permissions (teacher_id, student_id, granted_by)
            VALUES (${teacher.id}, ${child.id}, ${parent.id})`;
  const soon = await lessonAt(sql, teacher.id, child.id, parent.id, 6); // Join is open (10 minutes before)
  const tomorrow = await lessonAt(sql, teacher.id, child.id, parent.id, 24 * 60);
  await sql`INSERT INTO lesson_meeting_links (lesson_id, url, set_by) VALUES (${soon}, ${LINK}, ${teacher.id})`;

  // 1. The parent removes the teacher; the confirmation says what happens to booked lessons.
  const pctx = await browser.newContext();
  await stubZoom(pctx);
  const p = await pctx.newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent/teachers');
  await p.getByRole('button', { name: 'Remove teacher' }).first().click();
  const dialog = p.getByRole('dialog');
  await expect(dialog).toContainText(
    'Booked lessons with them are cancelled, except lessons starting within the next 30 minutes, which stay booked.',
  );
  await shot(p, `OC53-parent-remove-dialog-${device}`);
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(p.getByRole('dialog')).toHaveCount(0);

  // 2. The parent's calendar: the soon lesson stays booked (and Join works); tomorrow's is cancelled.
  await expect
    .poll(async () => (await sql`SELECT status FROM lessons WHERE id = ${tomorrow}`)[0]?.status)
    .toBe('cancelled');
  await p.goto('/parent/calendar');
  const keptCard = p.getByTestId('lesson-card').filter({ has: p.getByTestId('kept-note') });
  await expect(keptCard).toHaveCount(1);
  await expect(keptCard.getByTestId('kept-note')).toHaveText(
    'Stays booked: it starts within 30 minutes of the change to this teacher.',
  );
  await expect(keptCard.getByTestId('meeting-state')).toHaveText('Meeting link added by the teacher.');
  await check(p, phone);
  await shot(p, `OC53-parent-calendar-${device}`);
  expect(await joinFrom(p)).toBe(LINK);
  const [kept] = await sql<
    { links_carried: boolean }[]
  >`SELECT links_carried FROM lessons_kept WHERE lesson_id = ${soon}`;
  expect(kept?.links_carried).toBe(true);
  const told = await sql<{ type: string }[]>`
    SELECT type FROM notifications WHERE recipient_id = ${parent.id} AND entity_id IN (${soon}, ${tomorrow}) ORDER BY type`;
  // Told of the kept lesson and the cancellation; the kept lesson also gets its in-app 15-minute reminder.
  expect(told.map((n) => n.type)).toEqual(['lesson_cancelled', 'lesson_kept', 'lesson_reminder']);

  // 3. The teacher still has the kept lesson (and only that one) and can join it.
  const tctx = await browser.newContext();
  await stubZoom(tctx);
  const t = await tctx.newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher/schedule');
  const tcard = t.getByTestId('lesson-card').filter({ hasText: 'Maths with Kiran' });
  await expect(tcard).toHaveCount(1);
  await expect(tcard.getByTestId('kept-note')).toHaveText(
    'Stays booked after the parent’s change, because it starts within 30 minutes.',
  );
  await check(t, phone);
  await shot(t, `OC53-teacher-schedule-${device}`);
  expect(await joinFrom(t)).toBe(LINK);

  // 4. The child joins from My schedule.
  const kctx = await browser.newContext();
  await stubZoom(kctx);
  const k = await kctx.newPage();
  await childSignIn(k, child.username, child.password);
  await k.goto('/student/schedule');
  await expect(k.getByRole('link', { name: 'Join Class' })).toBeVisible();
  await check(k, phone);
  await shot(k, `OC53-child-schedule-${device}`);
  expect(await joinFrom(k)).toBe(LINK);

  // 5. Another family and another teacher get "not found" by the direct address.
  const stranger = await seedParent(sql, 'Meera', 'Iyer');
  const other = await seedTeacher(sql, 'approved', 'Mr Arun Iyer');
  for (const who of [stranger, other]) {
    const ctx = await browser.newContext();
    const s = await ctx.newPage();
    await signInAs(s, who.email);
    const r = await s.request.get(`/lessons/${soon}/join`, { maxRedirects: 0 });
    expect(r.status()).toBe(404);
    await ctx.close();
  }
  for (const c of [pctx, tctx, kctx]) await c.close();
});
