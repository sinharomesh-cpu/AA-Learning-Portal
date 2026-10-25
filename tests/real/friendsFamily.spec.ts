import { mkdirSync } from 'node:fs';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import {
  bellCount,
  childSignIn,
  expectNoHorizontalScroll,
  noSeriousA11yIssues,
  refreshOnReturn,
  signInAs,
} from './notificationHelpers';
import {
  type Sql,
  seedActiveLink,
  seedChild,
  seedDb,
  seedParent,
  seedShare,
  seedTeacher,
  unreadOf,
} from './notificationSeed';

/**
 * CR-17 PR 8: the Friends & Family acceptance script (CR-17 §8.2) as browser evidence, with real
 * sign-in, desktop and phone. Invented accounts and sample content only; Zoom is never contacted.
 *
 *  FF-1  request a 25-minute lesson; the teacher accepts it and declines another; statuses and
 *        free times update on both sides
 *  FF-2  two families ask for overlapping times; the teacher accepts both at once: one confirms,
 *        the other family sees "no longer free"
 *  FF-3  a second family (and another teacher) can't reach the first family's lesson, Join link,
 *        homework or shared file by any direct address
 *  FF-4  Join Class is closed before the window and open inside it, for teacher, parent and child only
 *  FF-5  assign, answer, hand in; marks hidden until released; the teacher overrides an automatic
 *        mark, writes feedback, saves as Reviewed, then releases; child and parent see it
 *  FF-6  written homework uploads (iPhone photo, PDF): NOT BUILT (CR-17 PR 6), so not tested here
 *  FF-7  bell counts change without reloading (covered inside FF-1 and FF-2)
 *  FF-8  cancelling 29 minutes before is refused (server and page); about 32 minutes before works
 *  FF-9  migrations, approvals, ₹0 and no production change: the PR 8 report (not a browser step)
 *
 * FF_SHOTS=<folder> saves screenshots for the owner's review.
 */

const sql = seedDb();
const shots = process.env.FF_SHOTS;
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
async function page(browser: import('@playwright/test').Browser): Promise<Page> {
  const ctx = await browser.newContext();
  await stubZoom(ctx);
  return ctx.newPage();
}
/** Join Class goes to AA Pro's own address, which answers 303 to the meeting; returns the Location. */
async function joinFrom(p: Page): Promise<string> {
  const [response] = await Promise.all([
    p.context().waitForEvent('response', (r) => /\/lessons\/[0-9a-f-]+\/join$/.test(new URL(r.url()).pathname)),
    p
      .getByRole('link', { name: /^Join Class/ })
      .first()
      .click(),
  ]);
  expect(response.status()).toBe(303);
  for (const tab of p.context().pages()) if (tab !== p) await tab.close();
  return response.headers()['location'] ?? '';
}
/** Usual times 4:00–6:00 pm IST every day and a listed hourly rate of ₹600 (usual 30 minutes). */
async function bookable(db: Sql, teacher: string) {
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await db`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${teacher}, ${d}, 960, 1080)`;
  await db`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
           VALUES (${`t-${Math.random().toString(36).slice(2, 12).padEnd(10, 'a')}`}, ${teacher}, true, 'INR', 60000, 30)`;
}
/** A lesson inserted with the database rules skipped for this insert only (times near now). */
async function lessonAt(
  db: Sql,
  o: {
    teacher: string;
    child: string;
    parent: string;
    fromMin: number;
    status: 'confirmed' | 'requested';
    minutes?: number;
    /** Instead of `fromMin`: this many days ahead at `istMinute` minutes after midnight IST. */
    istDay?: { days: number; minute: number };
  },
) {
  const minutes = o.minutes ?? 30;
  return db.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [l] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${o.teacher}, ${o.child}, ${o.parent}, 'maths', s, ${minutes}, s + make_interval(mins => ${minutes}), r,
             LEAST(r + interval '48 hours', s - interval '2 hours'), ${o.status},
             CASE WHEN ${o.status} = 'confirmed' THEN r + interval '1 minute' END, 'INR', 60000,
             ${(60000 * minutes) / 60}, 'listed'
      FROM (SELECT s, CASE WHEN ${o.status} = 'confirmed' THEN s - interval '3 days' ELSE now() END AS r
            FROM (SELECT CASE WHEN ${o.istDay?.days ?? null}::int IS NULL
                              THEN date_trunc('minute', now()) + make_interval(mins => ${o.fromMin})
                              ELSE (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
                                    + make_interval(days => ${o.istDay?.days ?? 0}, mins => ${o.istDay?.minute ?? 0}))
                                   AT TIME ZONE 'Asia/Kolkata' END AS s) x) y RETURNING id`;
    return l!.id;
  });
}
const statusOf = async (id: string) =>
  (await sql<{ status: string }[]>`SELECT status FROM lessons WHERE id = ${id}`)[0]?.status;

// ------------------------------------------------------------------------------------------- FF-1, FF-7
test('FF-1/FF-7: request 25 minutes; the teacher accepts it and declines another; both sides update', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await bookable(sql, teacher.id);

  // The teacher's dashboard is open before anything happens (FF-7: no reload later).
  const t = await page(browser);
  await signInAs(t, teacher.email);
  await t.goto('/teacher');
  await expect(bellCount(t)).toHaveCount(0);

  // The parent requests 25 minutes at 4:30 pm on the third free day.
  const p = await page(browser);
  await signInAs(p, parent.email);
  await p.goto('/parent/book-teacher');
  await p.getByRole('radio', { name: new RegExp(`${child.name}: Maths with ${teacher.name}`) }).check();
  await p.getByLabel('2. How long?').selectOption('25');
  await p.getByRole('button', { name: 'Show free times' }).click();
  const days = p.getByRole('navigation', { name: 'Days with free times' }).getByRole('link');
  await days.nth(2).click();
  await expect(days.nth(2)).toHaveAttribute('aria-current', 'date');
  const dayA = p.url();
  await p.getByRole('radio', { name: /4:30 pm/ }).check();
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(p.getByText('Request sent.')).toBeVisible();
  const [a] = await sql<{ id: string; starts_at: Date }[]>`
    SELECT id, starts_at FROM lessons WHERE student_id = ${child.id} AND status = 'requested'`;
  expect(a).toBeDefined();
  // A second request from the family for the next day at 4:30 pm (same rules, inserted directly).
  const [b] = await sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    return tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, currency, rate_minor, price_minor, price_basis)
      VALUES (${teacher.id}, ${child.id}, ${parent.id}, 'maths', ${a!.starts_at}::timestamptz + interval '1 day', 25,
              ${a!.starts_at}::timestamptz + interval '1 day 25 minutes', now(),
              LEAST(now() + interval '48 hours', ${a!.starts_at}::timestamptz + interval '1 day' - interval '2 hours'),
              'requested', 'INR', 60000, 25000, 'listed') RETURNING id`;
  });

  // FF-7: the teacher's bell counts the new request without a reload.
  await refreshOnReturn(t);
  await expect(bellCount(t)).toHaveText(String(await unreadOf(sql, teacher.id)));
  expect(await unreadOf(sql, teacher.id)).toBeGreaterThanOrEqual(1);

  // Free times: both requested times are hidden from the family while they wait.
  await p.goto(dayA);
  await expect(p.getByRole('radio', { name: /4:30 pm/ })).toHaveCount(0);
  await days.nth(3).click();
  await expect(days.nth(3)).toHaveAttribute('aria-current', 'date');
  const dayB = p.url();
  await expect(p.getByRole('radio', { name: /4:30 pm/ })).toHaveCount(0);
  await p.goto('/parent/calendar');
  const before = await unreadOf(sql, parent.id);

  // The teacher accepts the first and declines the second.
  await t.goto('/teacher');
  await expect(t.getByTestId('lesson-requests-waiting')).toContainText('2 lesson requests are waiting');
  await t.goto('/teacher/schedule');
  await t
    .getByRole('button', { name: /^Accept:/ })
    .first()
    .click();
  await expect(t.getByText('Accepted. The family has been told.')).toBeVisible();
  await t
    .getByRole('button', { name: /^Decline:/ })
    .first()
    .click();
  await t.getByRole('dialog').getByRole('button', { name: 'Decline', exact: true }).click();
  await expect(t.getByText('Declined. The family has been told.')).toBeVisible();
  expect(await statusOf(a!.id)).toBe('confirmed');
  expect(await statusOf(b!.id)).toBe('declined');
  await check(t, phone);
  await shot(t, `FF1-teacher-answered-${device}`);

  // FF-7: the parent's open calendar page gets both notices on its bell without a reload.
  await refreshOnReturn(p);
  const fresh = await sql<{ type: string }[]>`
    SELECT type FROM notifications WHERE recipient_id = ${parent.id} AND entity_id IN (${a!.id}, ${b!.id}) ORDER BY type`;
  // Also expected: lesson_link_permission_needed (accepting asks the parent to allow meeting links).
  test.info().annotations.push({ type: 'FF-1 parent notices', description: fresh.map((n) => n.type).join(', ') });
  expect(fresh.map((n) => n.type)).toEqual(expect.arrayContaining(['lesson_accepted', 'lesson_declined']));
  const after = await unreadOf(sql, parent.id);
  expect(after).toBeGreaterThanOrEqual(before + 2);
  await expect(bellCount(p)).toHaveText(String(after));

  // Both dashboards show the new state.
  await t.goto('/teacher');
  await expect(t.getByTestId('lesson-requests-waiting')).toHaveCount(0);
  await expect(t.getByRole('heading', { name: `Maths with ${child.name}` })).toBeVisible();
  await p.goto('/parent/calendar');
  await expect(p.getByText('Confirmed').first()).toBeVisible();
  await expect(p.getByText('Declined by the teacher').first()).toBeVisible();
  await check(p, phone);
  await shot(p, `FF1-parent-calendar-${device}`);
  // Free times: the confirmed time stays taken; the declined time is offered again.
  await p.goto(dayA);
  await expect(p.getByRole('radio', { name: /4:30 pm/ })).toHaveCount(0);
  await p.goto(dayB);
  await expect(p.getByRole('radio', { name: /4:30 pm/ })).toBeVisible();
  for (const c of [p, t]) await c.context().close();
});

// ------------------------------------------------------------------------------------------- FF-2
test('FF-2: two families, overlapping times, both accepted at once: exactly one confirms', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const phone = info.project.name === 'phone';
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const fam = [];
  for (const [first, last, kid] of [
    ['Anita', 'Shah', 'Kiran'],
    ['Meera', 'Iyer', 'Asha'],
  ] as const) {
    const parent = await seedParent(sql, first, last);
    const child = await seedChild(sql, parent.id, kid);
    await seedActiveLink(sql, teacher.id, child.id, parent.id);
    fam.push({ parent, child });
  }
  // Inside the teacher's usual times (4–6 pm IST): two requests three days ahead, 4:00–4:30 pm
  // and 4:15–4:45 pm (they overlap).
  await bookable(sql, teacher.id);
  const ids = [];
  for (const [i, f] of fam.entries())
    ids.push(
      await lessonAt(sql, {
        teacher: teacher.id,
        child: f.child.id,
        parent: f.parent.id,
        fromMin: 0,
        istDay: { days: 3, minute: 960 + i * 15 },
        status: 'requested',
      }),
    );

  const t1 = await page(browser);
  const t2 = await t1.context().newPage(); // the same teacher, two tabs
  await signInAs(t1, teacher.email);
  for (const tp of [t1, t2]) await tp.goto('/teacher/schedule');
  const accept = (tp: Page, name: string) =>
    tp
      .getByTestId('lesson-card')
      .filter({ hasText: `Maths with ${name}` })
      .getByRole('button', { name: /^Accept:/ })
      .click();
  await Promise.all([accept(t1, fam[0]!.child.name), accept(t2, fam[1]!.child.name)]);
  // One tab says accepted, the other says the time is no longer free.
  const seen = async (text: string) => (await t1.getByText(text).count()) + (await t2.getByText(text).count());
  await expect.poll(() => seen('Accepted. The family has been told.')).toBe(1);
  await expect
    .poll(() => seen('This time is no longer free, so the request has been closed and the family told.'))
    .toBe(1);
  const statuses = await sql<{ status: string; close_reason: string | null; student_id: string }[]>`
    SELECT status, close_reason, student_id FROM lessons WHERE id = ANY(${ids}) ORDER BY status`;
  expect(statuses.map((s) => s.status)).toEqual(['confirmed', 'declined']);
  expect(statuses[1]!.close_reason).toBe('time_no_longer_free');

  // The losing family sees "no longer free" (and its bell shows the notice without a reload).
  const loser = fam.find((f) => f.child.id === statuses[1]!.student_id)!;
  const p = await page(browser);
  await signInAs(p, loser.parent.email);
  await p.goto('/parent/calendar');
  await expect(p.getByText('Time no longer free').first()).toBeVisible();
  await expect(p.getByText('Another lesson was confirmed at an overlapping time.')).toBeVisible();
  await expect(bellCount(p)).toHaveText(String(await unreadOf(sql, loser.parent.id)));
  await check(p, phone);
  await shot(p, `FF2-losing-family-${phone ? 'phone' : 'desktop'}`);
  for (const c of [p, t1]) await c.context().close();
});

// ------------------------------------------------------------------------------------------- FF-3
test('FF-3: another family and another teacher reach nothing of family A by direct address', async ({ browser }) => {
  test.setTimeout(240_000);
  // Family A: a confirmed lesson with an allowed, saved meeting link; assigned homework; a shared file.
  const parentA = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const childA = await seedChild(sql, parentA.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, childA.id, parentA.id);
  await sql`UPDATE student_profiles SET curriculum = 'CBSE', grade = 5 WHERE account_id = ${childA.id}`;
  await sql`INSERT INTO meeting_link_permissions (teacher_id, student_id, granted_by)
            VALUES (${teacher.id}, ${childA.id}, ${parentA.id})`;
  const lesson = await lessonAt(sql, {
    teacher: teacher.id,
    child: childA.id,
    parent: parentA.id,
    fromMin: 5,
    status: 'confirmed',
  });
  await sql`INSERT INTO lesson_meeting_links (lesson_id, url, set_by) VALUES (${lesson}, ${LINK}, ${teacher.id})`;
  const share = await seedShare(sql, teacher.id, childA.id, 'Private fractions sheet');
  const [ws] = await sql<{ id: string }[]>`
    INSERT INTO worksheets (teacher_id, kind, title, grade, board, subject, chapter, status)
    VALUES (${teacher.id}, 'exercise', 'Private check-up', 5, 'CBSE', 'maths', 'Chapter 4 (sample)', 'draft') RETURNING id`;
  await sql`INSERT INTO worksheet_questions (worksheet_id, position, type, prompt, data, answer_key, points) VALUES
    (${ws!.id}, 1, 'true_false', '2/4 is the same as 1/2.', '{}', ${sql.json({ correct: true })}, 1)`;
  await sql`UPDATE worksheets SET status = 'ready' WHERE id = ${ws!.id}`;
  const t = await page(browser);
  await signInAs(t, teacher.email);
  await t.goto('/teacher/homework');
  await t.getByRole('link', { name: 'Assign Private check-up', exact: true }).click();
  await t.getByRole('radio', { name: new RegExp(childA.name) }).check();
  await t.getByRole('button', { name: `Assign to ${childA.name}` }).click();
  await expect(t.getByText('Assigned. The student sees it under My homework')).toBeVisible();
  const [target] = await sql<{ id: string }[]>`SELECT id FROM assignment_targets WHERE student_id = ${childA.id}`;
  const [file] = await sql<{ file_id: string }[]>`
    SELECT r.file_id FROM resource_shares s JOIN teacher_resources r ON r.id = s.resource_id WHERE s.id = ${share}`;

  // Family B (a parent and child) and an unrelated teacher.
  const parentB = await seedParent(sql, 'Meera', 'Iyer');
  const childB = await seedChild(sql, parentB.id, 'Asha');
  const otherTeacher = await seedTeacher(sql, 'approved', 'Mr Arun Iyer');
  const secrets = ['81234567890', 'SecretPass1', 'Private check-up', 'Private fractions sheet', 'Kiran'];
  async function nothingLeaks(p: Page, path: string, notFoundExpected: boolean) {
    const r = await p.request.get(path, { maxRedirects: 0 });
    const body = await r.text();
    for (const s of secrets) expect(body, `${path} leaked "${s}"`).not.toContain(s);
    if (notFoundExpected) expect(r.status(), path).toBe(404);
    else expect([200, 303, 307, 403, 404], path).toContain(r.status());
    if (r.status() === 303 || r.status() === 307) expect(r.headers()['location'] ?? '').not.toContain('zoom');
  }

  const pb = await page(browser);
  await signInAs(pb, parentB.email);
  await nothingLeaks(pb, `/lessons/${lesson}/join`, true);
  await nothingLeaks(pb, `/parent/children/${childA.id}`, false);
  await nothingLeaks(pb, `/parent/children/${childA.id}/restrictions`, false);
  await nothingLeaks(pb, `/files/${file!.file_id}/view`, false);
  for (const path of ['/parent/calendar', '/parent/homework', '/parent', '/parent/content'])
    await nothingLeaks(pb, path, false);

  const kb = await page(browser);
  await childSignIn(kb, childB.username, childB.password);
  await nothingLeaks(kb, `/lessons/${lesson}/join`, true);
  await nothingLeaks(kb, `/student/homework/${target!.id}`, true);
  await nothingLeaks(kb, `/files/${file!.file_id}/view`, false);
  for (const path of ['/student/schedule', '/student/homework', '/student/library'])
    await nothingLeaks(kb, path, false);

  const tb = await page(browser);
  await signInAs(tb, otherTeacher.email);
  await nothingLeaks(tb, `/lessons/${lesson}/join`, true);
  await nothingLeaks(tb, `/teacher/homework/review/${target!.id}`, true);
  await nothingLeaks(tb, `/teacher/students/${childA.id}`, false);
  await nothingLeaks(tb, `/files/${file!.file_id}/view`, false);
  for (const path of ['/teacher', '/teacher/schedule', '/teacher/homework/review']) await nothingLeaks(tb, path, false);

  // Control: family A's own child does reach them (so the checks above are meaningful).
  const ka = await page(browser);
  await childSignIn(ka, childA.username, childA.password);
  expect((await ka.request.get(`/student/homework/${target!.id}`)).status()).toBe(200);
  expect((await ka.request.get(`/lessons/${lesson}/join`, { maxRedirects: 0 })).headers()['location']).toBe(LINK);
  for (const c of [t, pb, kb, tb, ka]) await c.context().close();
});

// ------------------------------------------------------------------------------------------- FF-4
test('FF-4: Join Class is closed before the window and opens inside it for the lesson’s people only', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await sql`INSERT INTO meeting_link_permissions (teacher_id, student_id, granted_by)
            VALUES (${teacher.id}, ${child.id}, ${parent.id})`;
  const lesson = await lessonAt(sql, {
    teacher: teacher.id,
    child: child.id,
    parent: parent.id,
    fromMin: 40,
    status: 'confirmed',
  });
  await sql`INSERT INTO lesson_meeting_links (lesson_id, url, set_by) VALUES (${lesson}, ${LINK}, ${teacher.id})`;

  const t = await page(browser);
  await signInAs(t, teacher.email);
  const p = await page(browser);
  await signInAs(p, parent.email);
  const k = await page(browser);
  await childSignIn(k, child.username, child.password);
  const people: Array<[Page, string]> = [
    [t, '/teacher/schedule'],
    [p, '/parent/calendar'],
    [k, '/student/schedule'],
  ];

  // 40 minutes before: no Join link for anyone, and the direct address sends them back to their page.
  for (const [who, home] of people) {
    await who.goto(home);
    await expect(who.getByRole('link', { name: /^Join Class/ })).toHaveCount(0);
    const r = await who.request.get(`/lessons/${lesson}/join`, { maxRedirects: 0 });
    expect(r.status()).toBe(303);
    expect(r.headers()['location']).toBe(`${home}?join=not_open`);
  }
  await check(k, phone);
  await shot(k, `FF4-child-before-window-${device}`);

  // Five minutes before (inside the 10-minute window): Join opens for all three.
  await sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    await tx`UPDATE lessons SET starts_at = date_trunc('minute', now()) + interval '5 minutes',
                                ends_at = date_trunc('minute', now()) + interval '35 minutes' WHERE id = ${lesson}`;
  });
  for (const [who, home] of people) {
    await who.goto(home);
    expect(await joinFrom(who)).toBe(LINK);
  }
  await check(p, phone);
  await shot(p, `FF4-parent-inside-window-${device}`);

  // Anyone else: "not found".
  const stranger = await seedParent(sql, 'Meera', 'Iyer');
  const s = await page(browser);
  await signInAs(s, stranger.email);
  expect((await s.request.get(`/lessons/${lesson}/join`, { maxRedirects: 0 })).status()).toBe(404);
  for (const c of [t, p, k, s]) await c.context().close();
});

// ------------------------------------------------------------------------------------------- FF-5
test('FF-5: marks stay hidden until released; the teacher overrides a mark, gives feedback, reviews, releases', async ({
  browser,
}, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === 'phone';
  const device = phone ? 'phone' : 'desktop';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await sql`UPDATE student_profiles SET curriculum = 'CBSE', grade = 5 WHERE account_id = ${child.id}`;
  const [w] = await sql<{ id: string }[]>`
    INSERT INTO worksheets (teacher_id, kind, title, grade, board, subject, chapter, status)
    VALUES (${teacher.id}, 'exercise', 'Fractions check-up', 5, 'CBSE', 'maths', 'Chapter 4 (sample)', 'draft') RETURNING id`;
  await sql`INSERT INTO worksheet_questions (worksheet_id, position, type, prompt, data, answer_key, points) VALUES
    (${w!.id}, 1, 'single_choice', 'Which is bigger?', ${sql.json({ options: ['1/2', '1/4'] })}, ${sql.json({ correct: 0 })}, 1),
    (${w!.id}, 2, 'true_false', '2/4 is the same as 1/2.', '{}', ${sql.json({ correct: true })}, 1),
    (${w!.id}, 3, 'short_answer', 'Explain how you compared them.', ${sql.json({ maxLength: 1000 })}, NULL, 2)`;
  await sql`UPDATE worksheets SET status = 'ready' WHERE id = ${w!.id}`;

  const t = await page(browser);
  await signInAs(t, teacher.email);
  await t.goto('/teacher/homework');
  await t.getByRole('link', { name: 'Assign Fractions check-up', exact: true }).click();
  await t.getByRole('radio', { name: new RegExp(child.name) }).check();
  await t.getByRole('button', { name: `Assign to ${child.name}` }).click();
  await expect(t.getByText('Assigned. The student sees it under My homework')).toBeVisible();

  // The child answers question 1 "wrongly" (automatic 0), the rest correctly, and hands in.
  const k = await page(browser);
  await childSignIn(k, child.username, child.password);
  await k.goto('/student/homework');
  await k.getByRole('link', { name: /Fractions check-up/ }).click();
  await k.getByRole('radio', { name: '1/4' }).check();
  await k.getByRole('radio', { name: 'True' }).check();
  await k.getByLabel('Question 3, your answer').fill('Half of a pizza is more than a quarter.');
  await expect(k.getByText('Saved.')).toBeVisible();
  await k.getByRole('button', { name: 'Hand in my homework' }).click();
  await k.getByRole('dialog').getByRole('button', { name: 'Yes, hand it in' }).click();
  await expect(k.getByText('Handed in. Well done!')).toBeVisible();

  // The teacher overrides question 1 (automatic 0 → 1), marks question 3, writes feedback, saves as Reviewed.
  await t.goto('/teacher/homework/review');
  await t.getByRole('link', { name: `Mark Fractions check-up for ${child.name}` }).click();
  await expect(t.getByText('Automatic: 0')).toBeVisible();
  await t.getByLabel('Change the mark (optional)').first().fill('1');
  await t.getByLabel('Marks', { exact: true }).fill('2');
  await t.getByLabel('Feedback for the student (optional)').fill('Good reasoning; check question 1 again.');
  await t.getByRole('button', { name: 'Save as reviewed' }).click();
  await expect(t.getByText('Marked. The student sees the marks when you release them.')).toBeVisible();
  await expect
    .poll(async () => (await sql`SELECT status, released_at FROM assignment_targets WHERE student_id = ${child.id}`)[0])
    .toMatchObject({ status: 'reviewed', released_at: null });
  await check(t, phone);
  await shot(t, `FF5-teacher-reviewed-${device}`);

  // Reviewed but not released: neither the child nor the parent sees marks or feedback.
  await k.goto('/student/homework');
  await expect(k.getByText(/Marks: \d/)).toHaveCount(0);
  await k.getByRole('link', { name: /Fractions check-up/ }).click();
  await expect(k.getByText('Good reasoning')).toHaveCount(0);
  const p = await page(browser);
  await signInAs(p, parent.email);
  await p.goto('/parent/homework');
  await expect(p.getByText(/Marks: \d/)).toHaveCount(0);

  // Released: both see 4 out of 4 (the override counted) and the feedback.
  await t.reload();
  await t.getByRole('button', { name: 'Release marks' }).click();
  await expect
    .poll(
      async () =>
        (await sql`SELECT released_at FROM assignment_targets WHERE student_id = ${child.id}`)[0]?.released_at,
    )
    .not.toBeNull();
  await k.goto('/student/homework');
  await expect(k.getByText('Marks: 4 out of 4')).toBeVisible();
  await k.getByRole('link', { name: /Fractions check-up/ }).click();
  await expect(k.getByText('Good reasoning; check question 1 again.')).toBeVisible();
  await check(k, phone);
  await shot(k, `FF5-child-released-${device}`);
  await p.goto('/parent/homework');
  await expect(p.getByText('Marks: 4 out of 4')).toBeVisible();
  await check(p, phone);
  for (const c of [t, k, p]) await c.context().close();
});

// ------------------------------------------------------------------------------------------- FF-8
test('FF-8: cancelling 29 minutes before is refused; about 32 minutes before frees the time', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const phone = info.project.name === 'phone';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  // A second child with a second teacher, so the two lessons may overlap (one teacher or child never can).
  const teacher2 = await seedTeacher(sql, 'approved', 'Mr Arun Iyer');
  const child2 = await seedChild(sql, parent.id, 'Asha');
  await seedActiveLink(sql, teacher2.id, child2.id, parent.id);
  const base = { parent: parent.id, status: 'confirmed' as const, minutes: 10 };
  const soon = await lessonAt(sql, { ...base, teacher: teacher.id, child: child.id, fromMin: 45 }); // moved to 29 minutes
  const later = await lessonAt(sql, { ...base, teacher: teacher2.id, child: child2.id, fromMin: 33 }); // 32–33 minutes

  const p = await page(browser);
  await signInAs(p, parent.email);
  await p.goto('/parent/calendar');
  // The page was loaded while both could be cancelled; then the first moves to 29 minutes away.
  await expect(p.getByRole('button', { name: /^Cancel lesson:/ })).toHaveCount(2);
  await sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    await tx`UPDATE lessons SET starts_at = date_trunc('minute', now()) + interval '29 minutes',
                                ends_at = date_trunc('minute', now()) + interval '39 minutes' WHERE id = ${soon}`;
  });
  // The server refuses it (the button was still on the page).
  const card = (id: string) => p.locator('article', { has: p.locator(`[id="lesson-${id}"]`) });
  await card(soon)
    .getByRole('button', { name: /^Cancel lesson:/ })
    .click();
  await p.getByRole('dialog').getByRole('button', { name: 'Cancel lesson' }).click();
  await expect(p.getByText('Lessons can’t be cancelled within 30 minutes of the start.')).toBeVisible();
  expect(await statusOf(soon)).toBe('confirmed');
  // After a reload the page offers no Cancel button for it and says why.
  await p.reload();
  await expect(card(soon).getByRole('button', { name: /^Cancel lesson:/ })).toHaveCount(0);
  await expect(card(soon).getByText('Lessons can’t be cancelled within 30 minutes of the start.')).toBeVisible();

  // The one 32+ minutes away is cancelled; the teacher's schedule no longer holds that time.
  await card(later)
    .getByRole('button', { name: /^Cancel lesson:/ })
    .click();
  await p.getByRole('dialog').getByRole('button', { name: 'Cancel lesson' }).click();
  await expect(p.getByText('Lesson cancelled. The teacher has been told.')).toBeVisible();
  expect(await statusOf(later)).toBe('cancelled');
  await check(p, phone);
  await shot(p, `FF8-parent-cancel-${phone ? 'phone' : 'desktop'}`);
  const t = await page(browser);
  await signInAs(t, teacher2.email);
  await t.goto('/teacher/schedule');
  await expect(t.getByText('Cancelled by the parent').first()).toBeVisible();
  const upcoming = await sql<{ id: string }[]>`
    SELECT id FROM lessons WHERE teacher_id = ${teacher2.id} AND status = 'confirmed'`;
  expect(upcoming).toHaveLength(0);
  expect(await statusOf(soon)).toBe('confirmed');
  for (const c of [p, t]) await c.context().close();
});
