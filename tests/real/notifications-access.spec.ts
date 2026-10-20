import { expect, type Page, test } from '@playwright/test';
import {
  actionRequests,
  actionResponses,
  bell,
  bellCount,
  childSignIn,
  openBell,
  panel,
  rows,
  signInAs,
  ip,
} from './notificationHelpers';
import { signIn } from './helpers';
import {
  readAtOf,
  seedActiveLink,
  seedChild,
  seedDb,
  seedEnquiry,
  seedLinkRequest,
  seedNote,
  seedParent,
  seedShare,
  SEED_PHRASE,
  seedTeacher,
  unreadOf,
} from './notificationSeed';

/**
 * CR-16 N2 (§8, §8.1, D-5, D-6, D-8, Q-2, Q-4): access ended, redacted rows, no leakage and who
 * has no bell — with real (synthetic) accounts in a browser. The database side of each rule is
 * in tests/db/notificationAccess.test.ts (N1).
 */

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'Access rules do not depend on the layout');
});

const sql = seedDb();
const REDACTED = 'Notification no longer available';
const ENDED = 'This is no longer available to you.';

/** Everything the browser received: the page HTML and every Server Action response. */
async function everything(page: Page, responses: Promise<string>[]) {
  return [await page.content(), ...(await Promise.all(responses))].join('\n');
}

/**
 * AC-27 (a)–(f) and AC-67 for one notification whose access has just been removed: the list
 * shows it redacted, opening shows only the neutral message and marks it read, the bell drops
 * by one, the menu badges are unchanged and nothing about the record reaches the browser.
 */
async function expectAccessEnded(
  page: Page,
  opts: { id: string; recipient: string; hidden: string[]; role: 'parent' | 'teacher' | 'student' },
) {
  const responses = actionResponses(page);
  await page.goto(`/${opts.role}`);
  const before = await unreadOf(sql, opts.recipient);
  const menuBadges = await page.getByTestId('menu-badge').allInnerTexts();
  await openBell(page);
  const row = rows(page).filter({ hasText: REDACTED });
  await expect(row).toHaveCount(1);
  // No message, no label, a neutral row; the date and time and the unread state stay.
  await expect(row.getByTestId('notification-title')).toHaveText(REDACTED);
  await expect(row).toHaveAttribute('data-unread', 'true');
  await expect(row.locator('time')).toHaveCount(1);
  await expect(row).not.toContainText(/Needs your reply|Done|No longer needed/);
  await row.getByRole('button').first().click();
  await expect(page).toHaveURL(new RegExp(`/${opts.role}/notifications/unavailable$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ENDED);
  // The bell in that response is exactly one lower; badges are unchanged.
  if (before - 1 > 0) await expect(bellCount(page)).toHaveText(String(Math.min(before - 1, 9)));
  else await expect(bellCount(page)).toHaveCount(0);
  expect(await page.getByTestId('menu-badge').allInnerTexts()).toEqual(menuBadges);
  expect(await readAtOf(sql, opts.id)).not.toBeNull();
  expect(page.url()).not.toContain(opts.id);
  const seen = await everything(page, responses);
  for (const s of opts.hidden) expect(seen, `leaked "${s}"`).not.toContain(s);
}

test('AC-27, AC-67 cause 1: guardian relationship ended — redacted, neutral message, restored when access returns', async ({
  page,
}) => {
  const parent = await seedParent(sql);
  const child = await seedChild(sql, parent.id, 'Zarathustra');
  const teacher = await seedTeacher(sql);
  const link = await seedLinkRequest(sql, teacher.id, child.id, parent.id);
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  await seedNote(sql, parent.id, {
    title: 'Something still visible',
    href: '/parent/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
    createdAt: new Date(Date.now() - 60_000),
  });
  const title = 'Seeded Tutor accepted your link request for Zarathustra';
  const id = await seedNote(sql, parent.id, {
    type: 'link_request_accepted',
    title,
    body: 'Maths for Zarathustra',
    href: '/parent/teachers',
    entityType: 'link_request',
    entityId: link,
  });
  await signInAs(page, parent.email);
  await expect(page).toHaveURL(/\/parent$/);
  await openBell(page);
  await expect(rows(page).filter({ hasText: title })).toHaveCount(1);
  await page.keyboard.press('Escape');

  await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = now() WHERE student_id = ${child.id}`;
  await expectAccessEnded(page, { id, recipient: parent.id, hidden: [title, 'Zarathustra', link], role: 'parent' });
  // The row is still stored, now read (AC-67).
  expect(await readAtOf(sql, id)).not.toBeNull();
  // The full page lists it redacted too, in its place.
  await page.goto('/parent/notifications');
  const list = page.getByRole('region', { name: 'Your notifications' });
  await expect(list.getByTestId('notification-title')).toHaveText([REDACTED, 'Something still visible']);
  expect(await page.content()).not.toContain('Zarathustra');

  // Already read: the same message, read_at unchanged.
  const readAt = await readAtOf(sql, id);
  await list.getByTestId('notification-row').first().getByRole('button').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ENDED);
  expect((await readAtOf(sql, id))!.getTime()).toBe(readAt!.getTime());

  // Access restored: the next list shows it normally again.
  await sql`UPDATE guardian_links SET status = 'active', revoked_at = NULL WHERE student_id = ${child.id}`;
  await page.goto('/parent/notifications');
  await expect(list.getByTestId('notification-title').first()).toHaveText(title);
});

test('AC-27 (f), AC-67 cause 2: a teacher–child link removed after the list was shown', async ({ page }) => {
  const parent = await seedParent(sql);
  const child = await seedChild(sql, parent.id, 'Quillon');
  const teacher = await seedTeacher(sql);
  const link = await seedActiveLink(sql, teacher.id, child.id, parent.id);
  const title = 'Anita asked you to teach a Grade 5 child';
  const id = await seedNote(sql, teacher.id, {
    kind: 'action',
    type: 'link_request_received',
    title,
    body: 'Grade 5 · CBSE · Maths',
    href: '/teacher/students',
    entityType: 'link_request',
    entityId: link,
  });
  const responses = actionResponses(page);
  await signInAs(page, teacher.email);
  await expect(page).toHaveURL(/\/teacher$/);
  await openBell(page);
  const row = rows(page).filter({ hasText: title });
  await expect(row).toContainText('Done');
  // AC-18, AC-59: no response to the teacher names the child or carries their id.
  const seen = await everything(page, responses);
  expect(seen).not.toContain('Quillon');
  expect(seen).not.toContain(child.id);

  // Access ends after the list was shown: the open step re-checks now.
  await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE id = ${link}`;
  await row.getByRole('button').first().click();
  await expect(page).toHaveURL(/\/teacher\/notifications\/unavailable$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ENDED);
  await expect(page.getByRole('main')).not.toContainText(title);
  expect(await readAtOf(sql, id)).not.toBeNull();
  await expect(bellCount(page)).toHaveCount(0);
  await openBell(page);
  await expect(rows(page).getByTestId('notification-title')).toHaveText([REDACTED]);
});

test('AC-27, AC-67 cause 3: a worksheet unshared — redacted for the student and the parent', async ({
  page,
  browser,
}) => {
  const parent = await seedParent(sql);
  const child = await seedChild(sql, parent.id);
  const teacher = await seedTeacher(sql);
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  const share = await seedShare(sql, teacher.id, child.id, 'Secret fractions sheet');
  const kidTitle = 'New worksheet from your teacher: Secret fractions sheet';
  const kidNote = await seedNote(sql, child.id, {
    type: 'worksheet_shared',
    title: kidTitle,
    href: '/student/homework',
    entityType: 'resource_share',
    entityId: share,
  });
  const parentNote = await seedNote(sql, parent.id, {
    type: 'worksheet_shared',
    title: 'New worksheet for your child: Secret fractions sheet',
    href: '/parent/homework',
    entityType: 'resource_share',
    entityId: share,
  });

  await childSignIn(page, child.username, child.password);
  await expect(page).toHaveURL(/\/student$/);
  await openBell(page);
  // AC-31, D-7: the student sheet shows no action labels.
  await expect(rows(page).first()).toContainText(kidTitle);
  // AC-23: opening it lands on homework and never marks the homework done.
  await rows(page).first().getByRole('button').first().click();
  await expect(page).toHaveURL(/\/student\/homework$/);
  const [r] = await sql<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM resource_shares WHERE id = ${share} AND unshared_at IS NULL`;
  expect(r!.n).toBe(1);
  // Unshared: redacted on the next list; opening shows only the neutral message.
  await sql`UPDATE resource_shares SET unshared_at = now() WHERE id = ${share}`;
  await page.goto('/student');
  await openBell(page);
  await expect(rows(page).getByTestId('notification-title')).toHaveText([REDACTED]);
  await rows(page).first().getByRole('button').first().click();
  await expect(page).toHaveURL(/\/student\/notifications\/unavailable$/);
  expect(await readAtOf(sql, kidNote)).not.toBeNull();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ENDED);
  expect(await page.content()).not.toContain('Secret fractions');

  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await expect(p).toHaveURL(/\/parent$/);
  await expectAccessEnded(p, {
    id: parentNote,
    recipient: parent.id,
    hidden: ['Secret fractions', share],
    role: 'parent',
  });
  await p.context().close();
});

test('AC-27 causes 4 and 5, AC-46: deactivated accounts cannot sign in; a teacher sent back for changes sees approval updates only', async ({
  page,
}) => {
  // Cause 4: a deactivated account cannot sign in, so it sees no notification at all.
  const gone = await seedParent(sql);
  await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${gone.id}`;
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': ip() });
  await signIn(page, gone.email, SEED_PHRASE);
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(bell(page)).toHaveCount(0);

  // Cause 5 (D-5): a teacher whose profile needs changes gets the bell on the status and profile
  // pages only, with approval-status and profile notifications; anything else is redacted.
  const parent = await seedParent(sql);
  const teacher = await seedTeacher(sql, 'changes_requested');
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  await seedNote(sql, teacher.id, {
    kind: 'action',
    type: 'enquiry_received',
    title: 'New enquiry from Anita',
    href: '/teacher/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
    createdAt: new Date(Date.now() - 60_000),
  });
  await seedNote(sql, teacher.id, {
    type: 'teacher_changes_requested',
    title: 'Please update your profile',
    href: '/teacher/status',
    entityType: 'teacher_profile',
    entityId: teacher.id,
  });
  await signInAs(page, teacher.email);
  await expect(page).toHaveURL(/\/teacher\/status$/);
  for (const path of ['/teacher/status', '/teacher/profile']) {
    await page.goto(path);
    await expect(bell(page), path).toHaveAccessibleName('Notifications, 2 unread');
  }
  // No menu badges while awaiting approval.
  await expect(page.getByTestId('menu-badge')).toHaveCount(0);
  await openBell(page);
  await expect(rows(page).getByTestId('notification-title')).toHaveText(['Please update your profile', REDACTED]);
  // No full page for them (OC-38): no "See all", and the page sends them to their status.
  await expect(panel(page).getByRole('link', { name: 'See all notifications' })).toHaveCount(0);
  await rows(page).first().getByRole('button').first().click();
  await expect(page).toHaveURL(/\/teacher\/status$/);
  await page.goto('/teacher/notifications');
  await expect(page).toHaveURL(/\/teacher\/status$/);
  await openBell(page);
  await rows(page).filter({ hasText: REDACTED }).getByRole('button').first().click();
  await expect(page).toHaveURL(/\/teacher\/notifications\/unavailable$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ENDED);
  expect(await page.content()).not.toContain('New enquiry from Anita');
});

test('AC-68: a not-approved teacher sees the status message as today, no bell and makes no notification requests', async ({
  page,
}) => {
  const teacher = await seedTeacher(sql, 'rejected');
  const canary = 'Earlier: please update your profile';
  await seedNote(sql, teacher.id, {
    type: 'teacher_changes_requested',
    title: canary,
    href: '/teacher/status',
    entityType: 'teacher_profile',
    entityId: teacher.id,
  });
  await signInAs(page, teacher.email);
  await expect(page).toHaveURL(/\/teacher\/status$/);
  const requests = actionRequests(page);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Your profile was not approved' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Teacher menu' }).getByRole('link')).toHaveCount(0);
  await expect(bell(page)).toHaveCount(0);
  await page.waitForTimeout(1_000);
  expect(requests).toHaveLength(0);
  expect(await page.content()).not.toContain(canary);
  await page.goto('/teacher/profile');
  await expect(page).toHaveURL(/\/teacher\/status$/);
  for (const path of ['/teacher/notifications', '/teacher/notifications/unavailable']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/teacher\/status$/);
  }
  expect(await page.content()).not.toContain(canary);
});

test('AC-24, AC-49, AC-53, AC-59: signed-out goes to sign-in; public pages carry no notification data; ids grant nothing', async ({
  page,
  browser,
}) => {
  const anon = await (await browser.newContext()).newPage();
  for (const path of ['/parent/notifications', '/teacher/notifications', '/parent/notifications/unavailable']) {
    await anon.goto(path);
    await expect(anon, path).toHaveURL(/\/sign-in/);
  }
  // Public pages (signed out): no bell and no notification request.
  const anonRequests = actionRequests(anon);
  for (const path of ['/', '/teachers', '/teacher-terms', '/create-account']) {
    await anon.goto(path);
    await expect(anon, path).toHaveURL(new RegExp(`${path}$`));
    await expect(bell(anon), path).toHaveCount(0);
  }
  await anon.waitForTimeout(1_000);
  expect(anonRequests).toHaveLength(0);
  await anon.context().close();

  const parent = await seedParent(sql);
  const teacher = await seedTeacher(sql);
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  const canary = `Public-page canary ${Date.now()}`;
  await seedNote(sql, parent.id, {
    title: canary,
    href: '/parent/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
  });
  // Another family's notification, to look for in every response.
  const other = await seedParent(sql);
  const otherChild = await seedChild(sql, other.id, 'Ottoline');
  const otherLink = await seedLinkRequest(sql, teacher.id, otherChild.id, other.id);
  const otherNote = await seedNote(sql, other.id, {
    title: 'About Ottoline',
    href: '/parent/teachers',
    entityType: 'link_request',
    entityId: otherLink,
  });

  await signInAs(page, parent.email);
  await expect(page).toHaveURL(/\/parent$/);
  const requests = actionRequests(page);
  // Public pages a signed-in parent can still open (the homepage sends them to their home).
  for (const path of ['/teachers', '/teacher-terms']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(new RegExp(`${path}$`));
    await expect(bell(page), path).toHaveCount(0);
    const html = await page.content();
    expect(html, path).not.toContain(canary);
    expect(html, path).not.toContain('notification-bell');
  }
  await page.waitForTimeout(1_000);
  expect(requests).toHaveLength(0);

  // A notification never grants access: the unavailable page says nothing about any record, and
  // another family's notification id behaves like one that does not exist (nothing changes).
  const responses = actionResponses(page);
  await page.goto('/parent/notifications');
  await openBell(page);
  expect(await page.content()).not.toContain('Ottoline');
  const all = (await Promise.all(responses)).join('\n');
  expect(all).not.toContain('Ottoline');
  expect(all).not.toContain(otherNote);
  expect(await readAtOf(sql, otherNote)).toBeNull();
  await page.goto('/parent/notifications/unavailable');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ENDED);
  await expect(page.getByRole('main')).not.toContainText(canary);
});
