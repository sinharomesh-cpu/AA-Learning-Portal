import { expect, type Page, test } from '@playwright/test';
import { bell, bellCount, openBell, panel, publishListing, rows, signInAs } from './notificationHelpers';
import {
  readAtOf,
  seedChild,
  seedCounteredProposal,
  seedDb,
  seedLinkRequest,
  seedNote,
  seedParent,
  seedRateProposal,
  seedTeacher,
  setListingEnd,
  unreadOf,
} from './notificationSeed';

/**
 * CR-16 open checks, browser part (real synthetic accounts):
 * - AC-55 (b): with the browser clock frozen (no 60-second refresh can run), the response that
 *   completes each §7.1 business action already shows the affected menu badge and the related
 *   action label (§6.1). The teacher answering an enquiry is in notifications.spec.ts; completing
 *   the learning package needs the platform-wide CR-15 switch, so it runs with the other CR-15
 *   tests in superadmin.spec.ts (serial).
 * - AC-60: a failed "Show older", "Mark all as read" and open change nothing, restore the bell
 *   number, offer Try again and never name a record, child or other user (§7.4). Failures are
 *   forced by intercepting the Server Action request in the browser.
 */

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'Desktop layout; the phone sheet is in notifications-phone-a11y.spec.ts');
});

const sql = seedDb();

/** Signs in with the browser clock installed, then freezes it: no periodic refresh from now on. */
async function signInFrozen(page: Page, email: string, home: RegExp) {
  await page.clock.install();
  await signInAs(page, email);
  await expect(page).toHaveURL(home);
  await page.clock.pauseAt(new Date(Date.now() + 5_000));
}

/** The label (§6.1) on the notification row whose title is `title`. */
async function labelOf(page: Page, title: string): Promise<string> {
  await openBell(page);
  const row = rows(page).filter({ has: page.getByTestId('notification-title').getByText(title, { exact: true }) });
  await expect(row).toHaveCount(1);
  // AC-43: resolving the action never marks the notification read.
  await expect(row).toHaveAttribute('data-unread', 'true');
  const text = await row.innerText();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  return ['Needs your reply', 'No longer needed', 'Done'].find((l) => text.includes(l)) ?? 'none';
}

test('AC-55 (b): the teacher accepts and declines link requests; the Students badge and the labels change in the same response', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const teacher = await seedTeacher(sql);
  const p1 = await seedParent(sql, 'Asha');
  const p2 = await seedParent(sql, 'Bina');
  const c1 = await seedChild(sql, p1.id);
  const c2 = await seedChild(sql, p2.id);
  const r1 = await seedLinkRequest(sql, teacher.id, c1.id, p1.id);
  const r2 = await seedLinkRequest(sql, teacher.id, c2.id, p2.id);
  for (const [id, who] of [
    [r1, 'Asha'],
    [r2, 'Bina'],
  ] as const) {
    await seedNote(sql, teacher.id, {
      kind: 'action',
      type: 'link_request_received',
      title: `New request from ${who}`,
      href: '/teacher/students',
      entityType: 'link_request',
      entityId: id,
    });
  }
  await signInFrozen(page, teacher.email, /\/teacher$/);
  const menu = page.getByRole('navigation', { name: 'Teacher menu' });
  await expect(menu.getByRole('link', { name: 'Students, 2 waiting for you' })).toBeVisible();
  expect(await labelOf(page, 'New request from Asha')).toBe('Needs your reply');
  expect(await labelOf(page, 'New request from Bina')).toBe('Needs your reply');
  await menu.getByRole('link', { name: /^Students/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Accept Asha's request. Cards name only the parent's first name, never the child (Reading B).
  const card = (who: string) => page.getByRole('article').filter({ hasText: `Request from ${who}` });
  await card('Asha').getByRole('button', { name: 'Accept' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(page).toHaveURL(/\/teacher\/students\?accepted=/);
  await expect(menu.getByRole('link', { name: 'Students, 1 waiting for you' })).toBeVisible();
  expect(await labelOf(page, 'New request from Asha')).toBe('Done');
  expect(await labelOf(page, 'New request from Bina')).toBe('Needs your reply');

  // Decline Bina's request (with a reason).
  await card('Bina').getByRole('button', { name: 'Decline' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio').first().check();
  await dialog.getByRole('button', { name: 'Decline' }).click();
  await expect(page).toHaveURL(/\/teacher\/students\?declined=1$/);
  await expect(menu.getByRole('link', { name: 'Students', exact: true })).toBeVisible();
  await expect(menu.getByTestId('menu-badge')).toHaveCount(0);
  expect(await labelOf(page, 'New request from Bina')).toBe('Done');

  const links = await sql<{ id: string; status: string; ended_as: string | null }[]>`
    SELECT id, status, ended_as FROM teacher_student_links WHERE id IN (${r1}, ${r2})`;
  expect(links.find((l) => l.id === r1)).toMatchObject({ status: 'active', ended_as: null });
  expect(links.find((l) => l.id === r2)).toMatchObject({ status: 'removed', ended_as: 'declined' });
});

test('AC-55 (b): the teacher answers and counters rate proposals; the Enquiries badge and the labels change in the same response', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const teacher = await seedTeacher(sql);
  const p1 = await seedParent(sql, 'Chitra');
  const p2 = await seedParent(sql, 'Divya');
  const a = await seedRateProposal(sql, p1.id, teacher.id);
  const b = await seedRateProposal(sql, p2.id, teacher.id);
  for (const [id, who] of [
    [a, 'Chitra'],
    [b, 'Divya'],
  ] as const) {
    await seedNote(sql, teacher.id, {
      kind: 'action',
      type: 'rate_proposal_received',
      title: `Hourly rate proposal from ${who}`,
      href: '/teacher/enquiries/rates',
      entityType: 'rate_proposal',
      entityId: id,
      offerSeq: 1,
    });
  }
  await signInFrozen(page, teacher.email, /\/teacher$/);
  const menu = page.getByRole('navigation', { name: 'Teacher menu' });
  await expect(menu.getByRole('link', { name: 'Enquiries, 2 waiting for you' })).toBeVisible();
  expect(await labelOf(page, 'Hourly rate proposal from Chitra')).toBe('Needs your reply');
  await menu.getByRole('link', { name: /^Enquiries/ }).click();
  await page.getByRole('link', { name: 'Rate proposals (2 waiting)' }).click();
  await expect(page).toHaveURL(/\/teacher\/enquiries\/rates$/);
  const proposal = (who: string) => page.getByTestId('rate-negotiation').filter({ hasText: who });

  // Answer: accept Chitra's offer.
  await proposal('Chitra')
    .getByRole('button', { name: /^Accept ₹/ })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(page).toHaveURL(/\/teacher\/enquiries\/rates\?done=accepted$/);
  await expect(menu.getByRole('link', { name: 'Enquiries, 1 waiting for you' })).toBeVisible();
  expect(await labelOf(page, 'Hourly rate proposal from Chitra')).toBe('Done');
  expect(await labelOf(page, 'Hourly rate proposal from Divya')).toBe('Needs your reply');

  // Counter: offer 2 to Divya.
  await proposal('Divya').getByText('Counter-offer', { exact: true }).click();
  await proposal('Divya')
    .getByLabel(/Your offer/)
    .fill('580');
  await proposal('Divya').getByRole('button', { name: 'Send counter-offer' }).click();
  await expect(page).toHaveURL(/\/teacher\/enquiries\/rates\?done=countered/);
  await expect(menu.getByRole('link', { name: 'Enquiries', exact: true })).toBeVisible();
  await expect(menu.getByTestId('menu-badge')).toHaveCount(0);
  expect(await labelOf(page, 'Hourly rate proposal from Divya')).toBe('Done');

  const rs = await sql<{ id: string; status: string; turn: string | null; offers: number }[]>`
    SELECT id, status, turn, offers FROM rate_negotiations WHERE id IN (${a}, ${b})`;
  expect(rs.find((r) => r.id === a)).toMatchObject({ status: 'accepted', turn: null });
  expect(rs.find((r) => r.id === b)).toMatchObject({ status: 'countered', turn: 'parent', offers: 2 });
});

test('AC-55 (b): the parent answers, counters and withdraws rate proposals; the My enquiries badge and the labels change in the same response', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const parent = await seedParent(sql);
  const teachers = [await seedTeacher(sql), await seedTeacher(sql), await seedTeacher(sql)];
  const ids: string[] = [];
  for (const [i, t] of teachers.entries()) {
    const id = await seedCounteredProposal(sql, parent.id, t.id, new Date(Date.now() + (10 + i) * 86_400_000));
    ids.push(id);
    await seedNote(sql, parent.id, {
      kind: 'action',
      type: 'rate_counter_offer',
      title: `Counter-offer ${i + 1} to answer`,
      href: '/parent/enquiries/rates',
      entityType: 'rate_proposal',
      entityId: id,
      offerSeq: 2,
    });
  }
  await signInFrozen(page, parent.email, /\/parent$/);
  const menu = page.getByRole('navigation', { name: 'Parent menu' });
  await expect(menu.getByRole('link', { name: 'My enquiries, 3 waiting for you' })).toBeVisible();
  for (let i = 1; i <= 3; i += 1) expect(await labelOf(page, `Counter-offer ${i} to answer`)).toBe('Needs your reply');
  await menu.getByRole('link', { name: /^My enquiries/ }).click();
  await page.getByRole('navigation', { name: 'Enquiry views' }).getByRole('link', { name: 'Rate proposals' }).click();
  await expect(page).toHaveURL(/\/parent\/enquiries\/rates$/);
  const proposal = (i: number) => page.getByTestId('rate-negotiation').filter({ hasText: teachers[i]!.name });

  // Answer: accept the teacher's counter-offer (offer 2).
  await proposal(0).getByRole('button', { name: 'Accept ₹580' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(page).toHaveURL(/\/parent\/enquiries\/rates\?done=accepted$/);
  await expect(menu.getByRole('link', { name: 'My enquiries, 2 waiting for you' })).toBeVisible();
  expect(await labelOf(page, 'Counter-offer 1 to answer')).toBe('Done');

  // Counter: offer 3 back to the teacher.
  await proposal(1).getByText('Counter-offer', { exact: true }).click();
  await proposal(1)
    .getByLabel(/Your offer/)
    .fill('560');
  await proposal(1).getByRole('button', { name: 'Send counter-offer' }).click();
  await expect(page).toHaveURL(/\/parent\/enquiries\/rates\?done=countered/);
  await expect(menu.getByRole('link', { name: 'My enquiries, 1 waiting for you' })).toBeVisible();
  expect(await labelOf(page, 'Counter-offer 2 to answer')).toBe('Done');

  // Withdraw.
  await proposal(2).getByRole('button', { name: 'Withdraw' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Withdraw' }).click();
  await expect(page).toHaveURL(/\/parent\/enquiries\/rates\?done=withdrawn$/);
  await expect(menu.getByRole('link', { name: 'My enquiries', exact: true })).toBeVisible();
  await expect(menu.getByTestId('menu-badge')).toHaveCount(0);
  expect(await labelOf(page, 'Counter-offer 3 to answer')).toBe('No longer needed');

  const rs = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM rate_negotiations WHERE id IN (${ids[0]!}, ${ids[1]!}, ${ids[2]!})`;
  expect(ids.map((id) => rs.find((r) => r.id === id)!.status)).toEqual(['accepted', 'countered', 'withdrawn']);
});

test('AC-55 (b): the teacher renews the listing; the Looking for students badge clears in the same response', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const teacher = await seedTeacher(sql);
  const setup = await (await browser.newContext()).newPage();
  await signInAs(setup, teacher.email);
  await publishListing(setup);
  await setup.context().close();
  await setListingEnd(sql, teacher.id, new Date(Date.now() + 3 * 86_400_000));

  await signInFrozen(page, teacher.email, /\/teacher$/);
  const menu = page.getByRole('navigation', { name: 'Teacher menu' });
  await expect(menu.getByRole('link', { name: 'Looking for students, 1 waiting for you' })).toBeVisible();
  await menu.getByRole('link', { name: /^Looking for students/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Looking for students' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('checkbox', { name: 'My usual free times are correct.' }).check();
  await page.getByRole('checkbox', { name: 'My asking prices are correct.' }).check();
  await page.getByRole('checkbox', { name: /still the subjects and grades/ }).check();
  await page.getByRole('button', { name: 'Renew listing' }).click();
  await expect(page).toHaveURL(/\/teacher\/listing\?done=renew$/);
  await expect(page.getByText('Renewed for 60 days.')).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Looking for students', exact: true })).toBeVisible();
  await expect(menu.getByTestId('menu-badge')).toHaveCount(0);
  // The renewal has no action notification: the listing reminder (created when the page opened in
  // the final week) carries no label (§6.1); it is shown with no label after renewing too.
  await openBell(page);
  const reminder = rows(page).filter({ hasText: /^Your listing ends on/ });
  await expect(reminder).toHaveCount(1);
  await expect(reminder).not.toContainText(/Needs your reply|Done|No longer needed/);
  const [l] = await sql<
    { expires_at: Date }[]
  >`SELECT expires_at FROM teacher_listings WHERE teacher_id = ${teacher.id}`;
  expect(l!.expires_at.getTime()).toBeGreaterThan(Date.now() + 50 * 86_400_000);
});

test('AC-60: failed Show older, Mark all and open change nothing, restore the bell, offer Try again and name nothing', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const parent = await seedParent(sql, 'Farah');
  const child = await seedChild(sql, parent.id, 'Ishaan');
  const teacher = await seedTeacher(sql);
  const link = await seedLinkRequest(sql, teacher.id, child.id, parent.id);
  // Titles name the child and the teacher, so any message that echoed a record would show them.
  const ids: string[] = [];
  for (let i = 1; i <= 25; i += 1) {
    ids.push(
      await seedNote(sql, parent.id, {
        title: `${child.name} · ${teacher.name} · Update ${i}`,
        href: '/parent/teachers',
        entityType: 'link_request',
        entityId: link,
        createdAt: new Date(Date.now() - i * 60_000),
      }),
    );
  }
  const named = [child.name, teacher.name, 'Update ', teacher.email, parent.email];

  await signInFrozen(page, parent.email, /\/parent$/);
  await expect(bellCount(page)).toHaveText('9+');
  const actions: string[] = [];
  let failNext = false;
  await page.route('**/*', async (route) => {
    const r = route.request();
    if (r.method() === 'POST' && r.headers()['next-action']) {
      actions.push(r.url());
      if (failNext) {
        failNext = false;
        await route.fulfill({ status: 500, body: 'error' });
        return;
      }
    }
    await route.fallback();
  });
  const alertsNameNothing = async () => {
    for (const text of await page.getByRole('alert').allInnerTexts()) {
      for (const n of named) expect(text).not.toContain(n);
    }
  };

  // Show older fails: the 20 rows stay; Try again appears under them and then works.
  await page.getByRole('navigation', { name: 'Parent menu' }).getByRole('link', { name: 'Notifications' }).click();
  const list = page.getByRole('region', { name: 'Your notifications' });
  const pageRows = list.getByTestId('notification-row');
  await expect(pageRows).toHaveCount(20);
  const shown = await pageRows.getByTestId('notification-title').allInnerTexts();
  failNext = true;
  const before = actions.length;
  await list.getByRole('button', { name: 'Show older' }).click();
  await expect(list.getByRole('alert')).toHaveText("Couldn't load older notifications.");
  expect(actions.length).toBe(before + 1);
  await expect(pageRows).toHaveCount(20);
  expect(await pageRows.getByTestId('notification-title').allInnerTexts()).toEqual(shown);
  await expect(list.getByRole('button', { name: 'Show older' })).toHaveCount(0);
  await alertsNameNothing();
  await list.getByRole('button', { name: 'Try again' }).click();
  await expect(pageRows).toHaveCount(25);
  await expect(list.getByRole('alert')).toHaveCount(0);

  // Mark all fails on the page: no row changes, the bell number is back, the message shows once.
  failNext = true;
  await list.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(list.getByRole('alert')).toHaveText("Couldn't mark all as read. Try again.");
  await expect(bellCount(page)).toHaveText('9+');
  await expect(bell(page)).toHaveAccessibleName('Notifications, 25 unread');
  await expect(pageRows.and(page.locator('[data-unread="true"]'))).toHaveCount(25);
  expect(await unreadOf(sql, parent.id)).toBe(25);
  await alertsNameNothing();

  // Mark all fails in the panel too.
  await openBell(page);
  failNext = true;
  await panel(page).getByRole('button', { name: 'Mark all as read' }).click();
  await expect(panel(page).getByRole('alert')).toHaveText("Couldn't mark all as read. Try again.");
  await expect(bell(page)).toHaveAccessibleName('Notifications, 25 unread');
  await expect(rows(page).and(page.locator('[data-unread="true"]'))).toHaveCount(10);
  expect(await unreadOf(sql, parent.id)).toBe(25);
  await alertsNameNothing();

  // Opening fails: the user stays on this screen, the notification stays unread, Try again is offered.
  const first = rows(page).first();
  const firstId = ids[0]!;
  failNext = true;
  await first.getByRole('button').first().click();
  await expect(first.getByRole('alert')).toHaveText("Couldn't open this. Try again.");
  await expect(page).toHaveURL(/\/parent\/notifications$/);
  await expect(first).toHaveAttribute('data-unread', 'true');
  await expect(bell(page)).toHaveAccessibleName('Notifications, 25 unread');
  expect(await readAtOf(sql, firstId)).toBeNull();
  expect(await unreadOf(sql, parent.id)).toBe(25);
  await alertsNameNothing();
  // Trying again (no failure now) opens it and marks only it read.
  await first.getByRole('button').first().click();
  await expect(page).toHaveURL(/\/parent\/teachers$/);
  await expect.poll(() => readAtOf(sql, firstId)).not.toBeNull();
  expect(await unreadOf(sql, parent.id)).toBe(24);
});
