import { expect, test } from '@playwright/test';
import {
  actionRequests,
  bell,
  bellCount,
  childSignIn,
  openBell,
  panel,
  rows,
  setHidden,
  signInAs,
} from './notificationHelpers';
import {
  holdSharedSweep,
  readAtOf,
  seedActiveLink,
  seedChild,
  seedDb,
  seedEnquiry,
  seedLinkRequest,
  seedMany,
  seedNote,
  seedParent,
  seedRateProposal,
  seedShare,
  seedTeacher,
  sharedSweepAt,
  unreadOf,
} from './notificationSeed';

/**
 * CR-16 N2: the bell, panel, sheet and Notifications pages with real (synthetic) accounts.
 * Phone layout, keyboard and accessibility are in notifications-phone-a11y.spec.ts; access
 * ended, redaction and leakage in notifications-access.spec.ts.
 */

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'Desktop layout; phone checks are in notifications-phone-a11y.spec.ts');
});

const sql = seedDb();
const profileNote = (teacherId: string) =>
  ({ kind: 'update', href: '/teacher/profile', entityType: 'teacher_profile', entityId: teacherId }) as const;

test('AC-1, AC-2: the bell is on every parent, teacher and student page; 1–9, then 9+, hidden at 0', async ({
  page,
  browser,
}) => {
  // Visits every menu page of three roles; the first visit of each compiles it on a dev server.
  test.setTimeout(300_000);
  const parent = await seedParent(sql);
  const child = await seedChild(sql, parent.id);
  const teacher = await seedTeacher(sql);
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  for (let i = 0; i < 3; i += 1) {
    await seedNote(sql, parent.id, {
      title: `Enquiry update ${i}`,
      href: '/parent/enquiries',
      entityType: 'enquiry',
      entityId: enquiry,
    });
  }
  await seedMany(sql, teacher.id, 12, profileNote(teacher.id));

  await signInAs(page, parent.email);
  await expect(page).toHaveURL(/\/parent$/);
  const parentPages = [
    '/parent',
    '/parent/children',
    '/parent/teachers',
    '/parent/enquiries',
    '/parent/book-ai',
    '/parent/book-teacher',
    '/parent/calendar',
    '/parent/content',
    '/parent/homework',
    '/parent/history',
    '/parent/notifications',
    '/parent/settings',
  ];
  for (const path of parentPages) {
    await page.goto(path);
    await expect(bell(page), path).toHaveAccessibleName('Notifications, 3 unread');
    await expect(bellCount(page), path).toHaveText('3');
  }

  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await expect(t).toHaveURL(/\/teacher$/);
  for (const path of [
    '/teacher',
    '/teacher/schedule',
    '/teacher/availability',
    '/teacher/students',
    '/teacher/listing',
    '/teacher/enquiries',
    '/teacher/resources',
    '/teacher/profile',
    '/teacher/notifications',
  ]) {
    await t.goto(path);
    await expect(bell(t), path).toHaveAccessibleName('Notifications, 12 unread');
    await expect(bellCount(t), path).toHaveText('9+');
  }
  await t.context().close();

  const kid = await (await browser.newContext()).newPage();
  await childSignIn(kid, child.username, child.password);
  await expect(kid).toHaveURL(/\/student$/);
  for (const path of [
    '/student',
    '/student/schedule',
    '/student/book',
    '/student/homework',
    '/student/library',
    '/student/history',
  ]) {
    await kid.goto(path);
    await expect(bell(kid), path).toHaveAccessibleName('Notifications, 0 unread');
    // Hidden at 0.
    await expect(bellCount(kid), path).toHaveCount(0);
  }
  await kid.context().close();
});

test('AC-3, AC-4: the panel lists the latest 10 (parent, teacher) or 20 (student) newest first; opening marks nothing read', async ({
  page,
  browser,
}) => {
  const parent = await seedParent(sql);
  const child = await seedChild(sql, parent.id);
  const teacher = await seedTeacher(sql);
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  const share = await seedShare(sql, teacher.id, child.id);
  const now = new Date();
  // Two items share the same time: the order still follows the id (stable).
  await seedMany(sql, parent.id, 25, { href: '/parent/homework', entityType: 'resource_share', entityId: share }, now);
  await seedMany(sql, child.id, 25, { href: '/student/homework', entityType: 'resource_share', entityId: share }, now);

  await signInAs(page, parent.email);
  await openBell(page);
  await expect(rows(page)).toHaveCount(10);
  for (let i = 0; i < 10; i += 1) {
    const row = rows(page).nth(i);
    await expect(row.locator('time')).toHaveText(/min ago/);
    // Full date and time in the account's time zone (Asia/Kolkata).
    const expected = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(now.getTime() - (i + 1) * 60_000));
    await expect(row).toContainText(expected);
    await expect(row).toContainText('Unread');
  }
  await expect(rows(page).getByTestId('notification-title')).toHaveText(
    Array.from({ length: 10 }, (_, i) => `Update ${i + 1}`),
  );
  await expect(panel(page).getByRole('button', { name: 'Show older' })).toHaveCount(0);
  await expect(panel(page).getByRole('link', { name: 'See all notifications' })).toBeVisible();
  // AC-4: opening the panel marks nothing read.
  expect(await unreadOf(sql, parent.id)).toBe(25);
  await expect(bellCount(page)).toHaveText('9+');

  const kid = await (await browser.newContext()).newPage();
  await childSignIn(kid, child.username, child.password);
  await expect(kid).toHaveURL(/\/student$/);
  await openBell(kid);
  await expect(panel(kid).getByRole('heading', { name: 'Your updates' })).toBeVisible();
  await expect(rows(kid)).toHaveCount(20);
  await expect(rows(kid).getByTestId('notification-title')).toHaveText(
    Array.from({ length: 20 }, (_, i) => `Update ${i + 1}`),
  );
  // AC-48, AC-63: no "See all", no "Show older" for students.
  await expect(panel(kid).getByRole('link', { name: 'See all notifications' })).toHaveCount(0);
  await expect(panel(kid).getByRole('button', { name: 'Show older' })).toHaveCount(0);
  expect(await unreadOf(sql, child.id)).toBe(25);
  await kid.context().close();
});

test('AC-5, AC-28, AC-55 (c): clicking a row marks only that row read and lands on its page through the open step', async ({
  page,
}) => {
  const parent = await seedParent(sql);
  const teacher = await seedTeacher(sql);
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  const other = await seedNote(sql, parent.id, {
    title: 'Older enquiry news',
    href: '/parent/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
    createdAt: new Date(Date.now() - 120_000),
  });
  const target = await seedNote(sql, parent.id, {
    type: 'enquiry_accepted',
    title: 'Your enquiry was accepted',
    body: 'Grade 5 · Maths',
    href: '/parent/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
  });
  await signInAs(page, parent.email);
  await expect(bellCount(page)).toHaveText('2');
  await openBell(page);
  await rows(page).filter({ hasText: 'Your enquiry was accepted' }).getByRole('button').first().click();
  await expect(page).toHaveURL(/\/parent\/enquiries$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The next page shows the lowered bell number.
  await expect(bellCount(page)).toHaveText('1');
  expect(await readAtOf(sql, target)).not.toBeNull();
  expect(await readAtOf(sql, other)).toBeNull();
});

test('AC-6, AC-7, AC-14, AC-55 (a), AC-43: Mark as read and Mark all keep the screen, lower the bell at once and leave badges', async ({
  page,
}) => {
  const parent = await seedParent(sql);
  const teacher = await seedTeacher(sql);
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  const action = await seedNote(sql, teacher.id, {
    kind: 'action',
    type: 'enquiry_received',
    title: 'New enquiry from Anita',
    body: 'Grade 5 · CBSE · Maths',
    href: '/teacher/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
  });
  await seedMany(sql, teacher.id, 2, profileNote(teacher.id), new Date(Date.now() - 60_000));
  // The browser clock is frozen: no 60-second refresh can run (AC-55).
  await page.clock.install();
  await signInAs(page, teacher.email);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.clock.pauseAt(new Date(Date.now() + 5_000));
  const menu = page.getByRole('navigation', { name: 'Teacher menu' });
  await expect(menu.getByRole('link', { name: 'Enquiries, 1 waiting for you' })).toBeVisible();
  await expect(bellCount(page)).toHaveText('3');

  await openBell(page);
  const row = rows(page).filter({ hasText: 'New enquiry from Anita' });
  await expect(row).toContainText('Needs your reply');
  await row.getByRole('button', { name: /^Mark as read/ }).click();
  await expect(bellCount(page)).toHaveText('2');
  await expect(row).toHaveAttribute('data-unread', 'false');
  await expect(page).toHaveURL(/\/teacher$/);
  // AC-43: reading never changes the record or its label; the badge stays.
  await expect(row).toContainText('Needs your reply');
  await expect(menu.getByRole('link', { name: 'Enquiries, 1 waiting for you' })).toBeVisible();
  expect(await readAtOf(sql, action)).not.toBeNull();
  await expect(page.getByTestId('bell-live')).toHaveText('2 unread notifications');

  await panel(page).getByRole('button', { name: 'Mark all as read' }).click();
  await expect(bellCount(page)).toHaveCount(0);
  await expect(bell(page)).toHaveAccessibleName('Notifications, 0 unread');
  await expect(rows(page).and(page.locator('[data-unread="true"]'))).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Enquiries, 1 waiting for you' })).toBeVisible();
  expect(await unreadOf(sql, teacher.id)).toBe(0);
  const [e] = await sql<{ status: string }[]>`SELECT status FROM teacher_enquiries WHERE id = ${enquiry}`;
  expect(e!.status).toBe('pending');
});

test('AC-55 (b): answering an enquiry shows the lowered badge and the new label in the response that completes it', async ({
  page,
}) => {
  const parent = await seedParent(sql, 'Meera');
  const teacher = await seedTeacher(sql);
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  await seedNote(sql, teacher.id, {
    kind: 'action',
    type: 'enquiry_received',
    title: 'New enquiry from Meera',
    href: '/teacher/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
  });
  await page.clock.install();
  await signInAs(page, teacher.email);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.clock.pauseAt(new Date(Date.now() + 5_000));
  const menu = page.getByRole('navigation', { name: 'Teacher menu' });
  await menu.getByRole('link', { name: /^Enquiries/ }).click();
  await expect(menu.getByRole('link', { name: 'Enquiries, 1 waiting for you' })).toBeVisible();
  await page.getByRole('button', { name: 'Accept the enquiry from Meera' }).click();
  await expect(page).toHaveURL(/\/teacher\/enquiries\?done=accept$/);
  // No reload and no refresh ran (clock frozen): the badge is already gone.
  await expect(menu.getByRole('link', { name: 'Enquiries', exact: true })).toBeVisible();
  await expect(menu.getByTestId('menu-badge')).toHaveCount(0);
  await openBell(page);
  await expect(rows(page).filter({ hasText: 'New enquiry from Meera' })).toContainText('Done');
  // AC-43: resolving the action did not mark the notification read.
  await expect(rows(page).filter({ hasText: 'New enquiry from Meera' })).toHaveAttribute('data-unread', 'true');
});

test('AC-8, AC-63: the parent page shows 20 at a time, Show older by keyset, Unread chip, rows stay in place (C-4)', async ({
  page,
}) => {
  const parent = await seedParent(sql);
  const teacher = await seedTeacher(sql);
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  const base = { href: '/parent/enquiries', entityType: 'enquiry', entityId: enquiry } as const;
  const start = new Date(Date.now() - 3_600_000);
  // Items 30–32 share the same created_at: the order falls back to the id (stable).
  const ids: string[] = [];
  for (let i = 1; i <= 45; i += 1) {
    const minutes = i >= 30 && i <= 32 ? 30 : i;
    ids.push(
      await seedNote(sql, parent.id, {
        ...base,
        title: `Update ${i}`,
        createdAt: new Date(start.getTime() - minutes * 60_000),
      }),
    );
  }
  // Every other one read, so the Unread chip has fewer.
  for (let i = 0; i < 45; i += 2) await sql`UPDATE notifications SET read_at = now() WHERE id = ${ids[i]!}`;

  await page.clock.install();
  await signInAs(page, parent.email);
  await page.goto('/parent/notifications');
  await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible({ timeout: 30_000 });
  await page.clock.pauseAt(new Date(Date.now() + 5_000));
  const list = page.getByRole('region', { name: 'Your notifications' });
  const pageRows = list.getByTestId('notification-row');
  await expect(pageRows).toHaveCount(20);
  const titles = () => pageRows.getByTestId('notification-title').allInnerTexts();
  const first = await titles();
  // Three new notifications arrive between loads; they never cause a repeat or a gap.
  for (let i = 0; i < 3; i += 1) await seedNote(sql, parent.id, { ...base, title: `Brand new ${i}` });
  await list.getByRole('button', { name: 'Show older' }).click();
  await expect(pageRows).toHaveCount(40);
  await list.getByRole('button', { name: 'Show older' }).click();
  await expect(pageRows).toHaveCount(45);
  await expect(list.getByRole('button', { name: 'Show older' })).toHaveCount(0);
  const all = await titles();
  expect(all.slice(0, 20)).toEqual(first);
  const sorted = await sql<{ title: string }[]>`
    SELECT title FROM notifications WHERE recipient_id = ${parent.id} AND title LIKE 'Update %'
    ORDER BY created_at DESC, id DESC`;
  expect(all).toEqual(sorted.map((r) => r.title));
  expect(new Set(all).size).toBe(45);
  await expect(list).not.toContainText('Brand new');

  // Unread chip: (n) is the bell number (22 + 3 new); only unread rows, paged the same way.
  await expect(bellCount(page)).toHaveText('9+');
  const unreadNow = await unreadOf(sql, parent.id);
  const unreadChip = list.getByRole('radio', { name: /^Unread/ });
  await expect(page.getByText(/Unread \(\d+\)/)).toBeVisible();
  await unreadChip.check();
  await expect(pageRows).toHaveCount(20);
  await expect(pageRows.and(page.locator('[data-unread="false"]'))).toHaveCount(0);
  await list.getByRole('button', { name: 'Show older' }).click();
  await expect(pageRows).toHaveCount(unreadNow);
  await expect(list.getByRole('button', { name: 'Show older' })).toHaveCount(0);
  // C-4: a row marked read under Unread stays in place, shown as read.
  const firstRow = pageRows.first();
  const firstTitle = await firstRow.getByTestId('notification-title').innerText();
  await firstRow.getByRole('button', { name: /^Mark as read/ }).click();
  await expect(firstRow).toHaveAttribute('data-unread', 'false');
  await expect(pageRows).toHaveCount(unreadNow);
  await expect(page.getByText(`Unread (${unreadNow - 1})`)).toBeVisible();
  // After changing the filter, it is gone from the Unread list.
  await list.getByRole('radio', { name: 'All' }).check();
  await expect(pageRows).toHaveCount(20);
  await unreadChip.check();
  await expect(pageRows.getByTestId('notification-title').first()).not.toHaveText(firstTitle);
});

test('AC-48, AC-70: the parent menu item and home button "Notifications" open the page; teacher via See all; no student page', async ({
  page,
  browser,
}) => {
  const parent = await seedParent(sql);
  const child = await seedChild(sql, parent.id);
  const teacher = await seedTeacher(sql);
  await seedNote(sql, teacher.id, { ...profileNote(teacher.id), title: 'Your profile change was approved' });

  await signInAs(page, parent.email);
  await expect(page).toHaveURL(/\/parent$/);
  await expect(page.getByText('Notification settings')).toHaveCount(0);
  await page.getByRole('main').getByRole('link', { name: 'Notifications', exact: true }).click();
  await expect(page).toHaveURL(/\/parent\/notifications$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  await expect(page.getByText(/Notification settings come with/)).toHaveCount(0);
  await expect(page.getByTestId('notifications-empty')).toContainText("You're all caught up");
  await page.goto('/parent');
  await page.getByRole('navigation', { name: 'Parent menu' }).getByRole('link', { name: 'Notifications' }).click();
  await expect(page).toHaveURL(/\/parent\/notifications$/);
  // No notification preference control anywhere (Q-5).
  await expect(page.getByRole('main').getByRole('checkbox')).toHaveCount(0);
  await openBell(page);
  await panel(page).getByRole('link', { name: 'See all notifications' }).click();
  await expect(page).toHaveURL(/\/parent\/notifications$/);

  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await expect(t).toHaveURL(/\/teacher$/);
  // Teacher menu unchanged: no Notifications item.
  await expect(t.getByRole('navigation', { name: 'Teacher menu' }).getByRole('link')).toHaveText([
    'Dashboard',
    'My schedule',
    'Availability',
    'Students',
    'Looking for students',
    'Enquiries',
    'Learning resources',
    'Profile',
  ]);
  await openBell(t);
  await panel(t).getByRole('link', { name: 'See all notifications' }).click();
  await expect(t).toHaveURL(/\/teacher\/notifications$/);
  await expect(t.getByRole('region', { name: 'Your notifications' })).toContainText('Your profile change was approved');
  await t.context().close();

  const kid = await (await browser.newContext()).newPage();
  await childSignIn(kid, child.username, child.password);
  await expect(kid).toHaveURL(/\/student$/);
  const r = await kid.goto('/student/notifications');
  expect(r?.status()).toBe(404);
  await kid.goto('/student');
  await openBell(kid);
  await expect(panel(kid).getByTestId('notifications-empty')).toHaveText(/You're all caught up!/);
  await kid.context().close();
});

test('AC-34, AC-35: a new notification shows within 60 s while visible; no requests while hidden, one check on return', async ({
  page,
}) => {
  const parent = await seedParent(sql);
  const teacher = await seedTeacher(sql);
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  const note = { href: '/parent/enquiries', entityType: 'enquiry', entityId: enquiry } as const;
  await page.clock.install();
  await signInAs(page, parent.email);
  await expect(page).toHaveURL(/\/parent$/);
  await expect(bellCount(page)).toHaveCount(0);
  const requests = actionRequests(page);

  await seedNote(sql, parent.id, { ...note, title: 'Arrived while you watched' });
  await page.clock.runFor(60_000);
  await expect(bellCount(page)).toHaveText('1');
  await expect(page.getByTestId('bell-live')).toHaveText('1 unread notification');
  expect(requests).toHaveLength(1);

  // Hidden: no notification requests at all, however long.
  await setHidden(page, true);
  await seedNote(sql, parent.id, { ...note, title: 'Arrived while hidden' });
  await page.clock.runFor(5 * 60_000);
  await page.waitForTimeout(500);
  expect(requests).toHaveLength(1);
  await expect(bellCount(page)).toHaveText('1');
  // Visible again: exactly one check, at once.
  await setHidden(page, false);
  await expect(bellCount(page)).toHaveText('2');
  await page.waitForTimeout(500);
  expect(requests).toHaveLength(2);
});

test('AC-56: the refresh brings the bell number and the badges together; another tab’s answer shows within 60 s', async ({
  page,
}) => {
  const parent = await seedParent(sql, 'Ravi');
  const teacher = await seedTeacher(sql);
  await seedEnquiry(sql, parent.id, teacher.id);
  await page.clock.install();
  await signInAs(page, teacher.email);
  await expect(page).toHaveURL(/\/teacher$/);
  const menu = page.getByRole('navigation', { name: 'Teacher menu' });
  await expect(menu.getByRole('link', { name: 'Enquiries, 1 waiting for you' })).toBeVisible();

  // The same teacher answers in a second tab.
  const other = await page.context().newPage();
  await other.goto('/teacher/enquiries');
  await other.getByRole('button', { name: 'Accept the enquiry from Ravi' }).click();
  await expect(other).toHaveURL(/done=accept/);
  await other.close();
  // And a new notification arrives meanwhile.
  await seedNote(sql, teacher.id, { ...profileNote(teacher.id), title: 'Your profile change was approved' });

  await expect(menu.getByTestId('menu-badge')).toHaveCount(1);
  await page.clock.runFor(60_000);
  await expect(menu.getByTestId('menu-badge')).toHaveCount(0);
  await expect(bellCount(page)).toHaveText('1');
});

test('AC-44, AC-74: an active user sees an expiry notification within 65 s while the shared sweep is held', async ({
  page,
  browser,
}) => {
  const parent = await seedParent(sql);
  const teacher = await seedTeacher(sql);
  const otherParent = await seedParent(sql);
  const child = await seedChild(sql, parent.id);
  const soon = new Date(Date.now() + 4_000);
  // The parent's own records: an enquiry, a link request and a rate proposal (with the teacher).
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id, soon);
  const link = await seedLinkRequest(sql, teacher.id, child.id, parent.id, soon);
  const proposal = await seedRateProposal(sql, parent.id, teacher.id, soon);
  // A record only the teacher's own check reaches (its parent is not signed in).
  const teacherOnly = await seedRateProposal(sql, otherParent.id, teacher.id, soon);

  // The parent's tab and the teacher's tab are both open and visible; no page loads from now on.
  await page.clock.install();
  await signInAs(page, parent.email);
  await expect(page).toHaveURL(/\/parent$/);
  const t = await (await browser.newContext()).newPage();
  await t.clock.install();
  await signInAs(t, teacher.email);
  await expect(t).toHaveURL(/\/teacher$/);
  await expect(bellCount(page)).toHaveCount(0);
  await expect(bellCount(t)).toHaveCount(0);
  const tMenu = t.getByRole('navigation', { name: 'Teacher menu' });
  await expect(tMenu.getByRole('link', { name: 'Students, 1 waiting for you' })).toBeVisible();
  await expect(tMenu.getByRole('link', { name: 'Enquiries, 3 waiting for you' })).toBeVisible();

  // No shared sweep may run: it is held inside its minute from just before the expiry E.
  const held = await holdSharedSweep(sql);
  await expect.poll(() => Date.now() > soon.getTime() + 500, { timeout: 10_000 }).toBe(true);
  // Badges never wait for any sweep (AC-74, §4.2): at the next refresh they are already 0.

  // The parent's first refresh at or after E runs the user-scoped check over the parent's own
  // records, then counts: all three expiry notifications are in the same response (≤ 65 s).
  await page.clock.runFor(60_000);
  await expect(bellCount(page)).toHaveText('3', { timeout: 5_000 });
  await openBell(page);
  await expect(rows(page)).toHaveCount(3);

  // The teacher's refresh: their own check expires the other proposal; the notification for the
  // proposal the parent's check expired (the other party) is already there.
  await t.clock.runFor(60_000);
  await expect(bellCount(t)).toHaveText('2', { timeout: 5_000 });
  await expect(tMenu.getByTestId('menu-badge')).toHaveCount(0);
  await openBell(t);
  await expect(rows(t)).toHaveCount(2);
  await expect(rows(t).first()).toContainText(/expired/i);

  // The shared sweep did not run in that time.
  expect((await sharedSweepAt(sql)).getTime()).toBe(held.getTime());
  const statuses = await sql<{ s: string }[]>`
    SELECT status AS s FROM teacher_enquiries WHERE id = ${enquiry}
    UNION ALL SELECT status FROM teacher_student_links WHERE id = ${link}
    UNION ALL SELECT status FROM rate_negotiations WHERE id = ${proposal}
    UNION ALL SELECT status FROM rate_negotiations WHERE id = ${teacherOnly}`;
  expect(statuses.map((r) => r.s)).toEqual(['expired', 'removed', 'expired', 'expired']);
  // One notification per recipient per expiry (enquiry: parent; link: parent; proposals: both sides).
  const [n] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM notifications WHERE entity_id IN (${enquiry}, ${link}, ${proposal}, ${teacherOnly})`;
  expect(n!.n).toBe(6);
  await t.context().close();
});

test('AC-39, AC-60: load and refresh failures, a failed Mark as read and offline keep the page working', async ({
  page,
}) => {
  const parent = await seedParent(sql);
  const teacher = await seedTeacher(sql);
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  const note = await seedNote(sql, parent.id, {
    title: 'Something to read',
    href: '/parent/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
  });
  await page.clock.install();
  await signInAs(page, parent.email);
  await expect(page).toHaveURL(/\/parent$/);
  await page.clock.pauseAt(new Date(Date.now() + 5_000));
  await expect(bellCount(page)).toHaveText('1');

  // The panel's list fails once: an error with Try again; the page and menu still work.
  let failNext = true;
  await page.route('**/*', async (route) => {
    const r = route.request();
    if (failNext && r.method() === 'POST' && r.headers()['next-action']) {
      failNext = false;
      await route.fulfill({ status: 500, body: 'error' });
      return;
    }
    await route.fallback();
  });
  await bell(page).click();
  await expect(panel(page).getByRole('alert')).toContainText("We couldn't load your notifications.");
  await expect(panel(page).getByRole('alert')).not.toContainText('Something to read');
  await panel(page).getByRole('button', { name: 'Try again' }).click();
  await expect(rows(page)).toHaveCount(1);

  // A failed Mark as read: the row stays unread, the bell number comes back, retry works.
  failNext = true;
  await rows(page)
    .first()
    .getByRole('button', { name: /^Mark as read/ })
    .click();
  await expect(rows(page).first()).toContainText("Couldn't mark as read. Try again.");
  await expect(rows(page).first()).toHaveAttribute('data-unread', 'true');
  await expect(bellCount(page)).toHaveText('1');
  expect(await readAtOf(sql, note)).toBeNull();
  await rows(page).first().getByRole('button', { name: 'Try again' }).click();
  await expect(rows(page).first()).toHaveAttribute('data-unread', 'false');
  await expect(bellCount(page)).toHaveCount(0);
  await page.keyboard.press('Escape');

  // A failed refresh: the bell shows without a number; the page and menu still work.
  await seedNote(sql, parent.id, {
    title: 'Another',
    href: '/parent/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
  });
  failNext = true;
  await page.clock.runFor(60_000);
  await expect(bell(page)).toHaveAccessibleName('Notifications');
  await expect(bellCount(page)).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Parent menu' }).getByRole('link', { name: 'Children' }),
  ).toBeVisible();
  await page.clock.runFor(60_000);
  await expect(bellCount(page)).toHaveText('1');

  // Offline: the existing banner, the last number kept, no requests and no errors; one check on reconnect.
  const requests = actionRequests(page);
  await page.context().setOffline(true);
  await expect(page.getByText("You're offline.")).toBeVisible();
  await page.clock.runFor(3 * 60_000);
  await expect(bellCount(page)).toHaveText('1');
  expect(requests).toHaveLength(0);
  await page.context().setOffline(false);
  await expect.poll(() => requests.length).toBe(1);
  await expect(bellCount(page)).toHaveText('1');
});
