import { mkdirSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher, type Sql } from './notificationSeed';

/**
 * CR-17 PR 3 with real sign-in, desktop and phone (D3A-1, D3A-8, OC-44): a parent allows the
 * teacher's own Zoom links, the teacher adds one, and Join Class opens it for the teacher, both
 * parents and the child inside the window, and for nobody else. The link never appears in any
 * page, Server Action response or notification. A parent stops allowing and Join closes at once.
 * Zoom itself is never contacted: requests to zoom.us are answered by a stub. Invented accounts.
 * LESSON_SHOTS=<folder> saves the screenshots for the owner's review.
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

/** Every same-origin response body this page receives (documents, flight data, Server Actions). */
function bodies(page: Page): Promise<string>[] {
  const all: Promise<string>[] = [];
  page.on('response', (r) => {
    if (r.url().startsWith('http://127.0.0.1') && r.status() < 300) all.push(r.text().catch(() => ''));
  });
  return all;
}
async function expectNoLink(page: Page, seen: Promise<string>[]) {
  const text = (await page.content()) + (await Promise.all(seen)).join('\n');
  // The saved link's own meeting number and passcode (the form's placeholder shows only a sample address).
  expect(text).not.toContain('81234567890');
  expect(text).not.toContain('SecretPass1');
}

/** Zoom is never contacted: answer any zoom.us request with a stub page. */
async function stubZoom(context: BrowserContext) {
  await context.route(/^https:\/\/([a-z0-9-]+\.)*zoom\.us\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Zoom stub</title><p>Zoom stub</p>' }),
  );
}

/**
 * Join Class opens a new tab at AA Pro's own address; returns where that address sends the
 * browser (the 303 redirect's Location). The tab is closed before Zoom would load.
 */
async function joinFrom(page: Page): Promise<string> {
  const [response] = await Promise.all([
    page.context().waitForEvent('response', (r) => /\/lessons\/[0-9a-f-]+\/join$/.test(new URL(r.url()).pathname)),
    page
      .getByRole('link', { name: /^Join Class/ })
      .first()
      .click(),
  ]);
  expect(response.status()).toBe(303);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(response.request().headers()['referer'] ?? '').not.toContain('/parent/');
  for (const tab of page.context().pages()) if (tab !== page) await tab.close();
  return response.headers()['location'] ?? '';
}

/** A confirmed lesson starting `fromMin` minutes from now, inserted with the database rules skipped. */
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

test('allow links, add a link, Join Class for the lesson’s people only, stop allowing', async ({ browser }, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const parent2 = await seedParent(sql, 'Ravi', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2.id}, ${child.id})`;
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  const lesson = await lessonAt(sql, teacher.id, child.id, parent.id, 5); // Join is open: 10 minutes before

  // 1. The parent sees the lesson waiting for permission, and allows the teacher's links.
  const pctx = await browser.newContext();
  await stubZoom(pctx);
  const p = await pctx.newPage();
  const pSeen = bodies(p);
  await signInAs(p, parent.email);
  await p.goto('/parent/calendar');
  const card = p.getByTestId('lesson-card').filter({ hasText: 'Maths with Ms Priya Rao' });
  await expect(card.getByTestId('meeting-state')).toHaveText('Waiting for you to allow this teacher’s meeting links.');
  await expect(card.getByRole('button', { name: /^Allow the teacher’s links to join/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(card.getByRole('link', { name: /^Join Class/ })).toHaveCount(0);
  await check(p, phone);
  await shot(p, `PR3-parent-calendar-waiting-${device}`);
  await card.getByRole('link', { name: /^Allow meeting links/ }).click();
  const section = p.getByRole('region', { name: 'Zoom meetings for lessons' });
  await expect(section.getByTestId(`meeting-permission-${child.id}`)).toHaveText(
    'Not allowed: Join Class can’t open this teacher’s meetings for this child.',
  );
  await check(p, phone);
  await shot(p, `PR3-parent-teacher-page-not-allowed-${device}`);
  await section.getByRole('button', { name: 'Allow Ms Priya Rao to use their own Zoom meetings for Kiran' }).click();
  await expect(section.getByText('Allowed. The other parent has been told.')).toBeVisible();
  await expect(section.getByTestId(`meeting-permission-${child.id}`)).toHaveText(/^Allowed since /);
  await check(p, phone);
  await shot(p, `PR3-parent-teacher-page-allowed-${device}`);
  const [told] = await sql<{ title: string }[]>`
    SELECT title FROM notifications WHERE recipient_id = ${parent2.id} AND type = 'meeting_links_allowed'`;
  expect(told!.title).toBe('Anita allowed Ms Priya Rao to use their own Zoom meetings for Kiran');

  // 2. The teacher adds the link; a bad one is refused with a clear message.
  const tctx = await browser.newContext();
  await stubZoom(tctx);
  const t = await tctx.newPage();
  const tSeen = bodies(t);
  await signInAs(t, teacher.email);
  await t.goto('/teacher/schedule');
  const tcard = t.getByTestId('lesson-card').filter({ hasText: 'Maths with Kiran' });
  await expect(tcard.getByTestId('meeting-state')).toHaveText('Add your Zoom meeting link so Join Class can open.');
  await tcard.getByLabel('Zoom meeting link').fill('https://evilzoom.us/wc/join/1');
  await tcard.getByRole('button', { name: /^Save meeting link/ }).click();
  await expect(tcard.getByText(/must start with https:\/\/ and be a zoom\.us address/)).toBeVisible();
  await tcard.getByLabel('Zoom meeting link').fill(LINK);
  await tcard.getByRole('button', { name: /^Save meeting link/ }).click();
  await expect(
    t.getByText('Meeting link saved. The family has been told; the link itself is not shown to anyone.'),
  ).toBeVisible();
  const tcard2 = t.getByTestId('lesson-card').filter({ hasText: 'Maths with Kiran' });
  await expect(tcard2.getByTestId('meeting-state')).toHaveText(/^Your meeting link was saved /);
  await expect(tcard2.getByLabel('Change the Zoom meeting link')).toHaveValue('');
  await check(t, phone);
  await shot(t, `PR3-teacher-schedule-link-saved-${device}`);
  expect(await joinFrom(t)).toBe(LINK);
  await expectNoLink(t, tSeen);

  // 3. The parent joins; the second parent too.
  await p.goto('/parent/calendar');
  const card2 = p.getByTestId('lesson-card').filter({ hasText: 'Maths with Ms Priya Rao' });
  await expect(card2.getByTestId('meeting-state')).toHaveText('Meeting link added by the teacher.');
  await expect(
    card2.getByText('Opens Zoom — a meeting run by your teacher, not by AA Pro. Not recorded.'),
  ).toBeVisible();
  await check(p, phone);
  await shot(p, `PR3-parent-calendar-join-${device}`);
  expect(await joinFrom(p)).toBe(LINK);
  const p2ctx = await browser.newContext();
  await stubZoom(p2ctx);
  const p2 = await p2ctx.newPage();
  const p2Seen = bodies(p2);
  await signInAs(p2, parent2.email);
  await p2.goto('/parent/calendar');
  expect(await joinFrom(p2)).toBe(LINK);
  await expectNoLink(p2, p2Seen);

  // 4. The child joins from My schedule.
  const kctx = await browser.newContext();
  await stubZoom(kctx);
  const k = await kctx.newPage();
  const kSeen = bodies(k);
  await childSignIn(k, child.username, child.password);
  await k.goto('/student/schedule');
  await expect(k.getByRole('link', { name: 'Join Class' })).toBeVisible();
  await check(k, phone);
  await shot(k, `PR3-child-schedule-join-${device}`);
  expect(await joinFrom(k)).toBe(LINK);
  await expectNoLink(k, kSeen);

  // 5. Another family, and another teacher, get "not found" by the direct address.
  const stranger = await seedParent(sql, 'Meera', 'Iyer');
  const other = await seedTeacher(sql, 'approved', 'Mr Arun Iyer');
  for (const who of [stranger, other]) {
    const ctx = await browser.newContext();
    const s = await ctx.newPage();
    await signInAs(s, who.email);
    const r = await s.request.get(`/lessons/${lesson}/join`, { maxRedirects: 0 });
    expect(r.status()).toBe(404);
    expect(await r.text()).not.toContain('zoom');
    await ctx.close();
  }

  // 6. The second parent stops allowing: Join closes at once for everyone. The child's page stays
  // open (no reload) and must update on its own within one 30-second re-check.
  await k.goto('/student/schedule');
  await expect(k.getByRole('link', { name: 'Join Class' })).toBeVisible();
  await p2.goto(`/parent/teachers/${teacher.id}`);
  const s2 = p2.getByRole('region', { name: 'Zoom meetings for lessons' });
  await s2.getByRole('button', { name: 'Stop allowing Ms Priya Rao’s meeting links for Kiran' }).click();
  await check(p2, phone);
  await shot(p2, `PR3-parent-stop-confirm-${device}`);
  await p2.getByRole('dialog').getByRole('button', { name: 'Stop allowing' }).click();
  await expect(s2.getByText('Stopped. Join Class won’t open this teacher’s meetings for now.')).toBeVisible();
  await expect(k.getByRole('link', { name: /Join Class/ })).toHaveCount(0, { timeout: 45_000 });
  await expect(k.getByRole('button', { name: 'Your teacher’s class link isn’t ready yet' })).toBeVisible();
  // The booking itself is untouched: still confirmed, still on every calendar.
  const [still] = await sql<{ status: string }[]>`SELECT status FROM lessons WHERE id = ${lesson}`;
  expect(still!.status).toBe('confirmed');
  await p.goto('/parent/calendar');
  const kept = p.getByTestId('lesson-card').filter({ hasText: 'Maths with Ms Priya Rao' });
  await expect(kept.getByText('Confirmed')).toBeVisible();
  await expect(kept.getByTestId('meeting-state')).toHaveText('Waiting for you to allow this teacher’s meeting links.');
  await t.goto('/teacher/schedule');
  await expect(
    t.getByTestId('lesson-card').filter({ hasText: 'Maths with Kiran' }).getByTestId('meeting-state'),
  ).toHaveText('The parent hasn’t allowed your meeting links for this child yet.');
  const refused = await k.request.get(`/lessons/${lesson}/join`, { maxRedirects: 0 });
  expect(refused.status()).toBe(303);
  expect(refused.headers()['location']).toBe('/student/schedule?join=not_allowed');
  await k.goto('/student/schedule?join=not_allowed');
  await expect(k.getByText('Your teacher’s class link isn’t ready yet. Ask your parent.')).toBeVisible();
  await check(k, phone);
  await shot(k, `PR3-child-schedule-stopped-${device}`);
  const [stoppedNote] = await sql<{ title: string }[]>`
    SELECT title FROM notifications WHERE recipient_id = ${parent.id} AND type = 'meeting_links_stopped'`;
  expect(stoppedNote!.title).toBe('Ravi stopped Ms Priya Rao using their own Zoom meetings for Kiran');

  // 7. Nothing about the link reached any notification.
  const leaked = await sql`
    SELECT 1 FROM notifications WHERE (title || body) ~ 'zoom\\.us|81234567890|SecretPass1'
      AND recipient_id IN ${sql([parent.id, parent2.id, teacher.id, child.id])}`;
  expect(leaked).toHaveLength(0);
  await expectNoLink(p, pSeen);
  for (const c of [pctx, tctx, p2ctx, kctx]) await c.close();
});
