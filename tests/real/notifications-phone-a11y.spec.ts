import { mkdirSync } from 'node:fs';
import { expect, type Locator, type Page, type Request, test } from '@playwright/test';
import {
  bell,
  bellCount,
  childSignIn,
  expectNoHorizontalScroll,
  noSeriousA11yIssues,
  openBell,
  panel,
  rows,
  signInAs,
} from './notificationHelpers';
import {
  seedChild,
  seedDb,
  seedEnquiry,
  seedLinkRequest,
  seedMany,
  seedNote,
  seedParent,
  seedTeacher,
} from './notificationSeed';

/**
 * CR-16 N2 (N-11): the phone bottom sheet, touch targets, keyboard, screen-reader names, live
 * region, reduced motion and axe checks on the panel, the sheet and the Notifications page.
 * N2_SHOTS=<folder> saves review screenshots (desktop panel, phone sheet, page, redacted row).
 */

const sql = seedDb();
const shots = process.env.N2_SHOTS;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png` });
}

/** A teacher with an action notification, a waiting enquiry badge and some updates. */
async function busyTeacher() {
  const parent = await seedParent(sql);
  const teacher = await seedTeacher(sql);
  const child = await seedChild(sql, parent.id);
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  const link = await seedLinkRequest(sql, teacher.id, child.id, parent.id);
  await seedMany(
    sql,
    teacher.id,
    3,
    { kind: 'update', href: '/teacher/profile', entityType: 'teacher_profile', entityId: teacher.id },
    new Date(Date.now() - 60_000),
  );
  await seedNote(sql, teacher.id, {
    kind: 'action',
    type: 'link_request_received',
    title: 'Anita asked you to teach a Grade 5 child',
    body: 'Grade 5 · CBSE · Maths',
    href: '/teacher/students',
    entityType: 'link_request',
    entityId: link,
  });
  await seedNote(sql, teacher.id, {
    kind: 'action',
    type: 'enquiry_received',
    title: 'New enquiry from Anita',
    body: 'Grade 5 · CBSE · Maths',
    href: '/teacher/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
  });
  return { teacher, parent, child, enquiry };
}

type Box = { x: number; y: number; width: number; height: number; name: string };

/** AX-04 (C-3): every target at least 48 × 48 px, and at least 8 px between any two targets. */
async function expectTargets(targets: Locator) {
  const boxes: Box[] = [];
  for (const t of await targets.all()) {
    if (!(await t.isVisible())) continue;
    // Only targets a finger can reach now (not scrolled out of the sheet's list).
    const reachable = await t.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && (e === hit || e.contains(hit) || (e as HTMLInputElement).labels?.[0]?.contains(hit) === true);
    });
    if (!reachable) continue;
    const b = (await t.boundingBox())!;
    const name = (await t.getAttribute('aria-label')) ?? (await t.innerText()).slice(0, 40);
    expect(Math.round(b.width), `${name} width`).toBeGreaterThanOrEqual(48);
    expect(Math.round(b.height), `${name} height`).toBeGreaterThanOrEqual(48);
    boxes.push({ ...b, name });
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const h = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
      const v = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
      expect(Math.round(Math.max(h, v)), `${a.name} ↔ ${b.name}`).toBeGreaterThanOrEqual(8);
    }
  }
  return boxes.length;
}

const controls = (scope: Locator) => scope.locator('button, a[href], input');

test('AC-40, AC-9: on a phone the panel is a bottom sheet with 48 px targets 8 px apart and no sideways scroll', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'Phone layout (390 px class)');
  const { teacher } = await busyTeacher();
  await page.clock.install();
  await signInAs(page, teacher.email);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.clock.pauseAt(new Date(Date.now() + 5_000));
  await expect(bellCount(page)).toHaveText('5');
  // The bell itself.
  await expectTargets(bell(page));
  await openBell(page);
  const sheet = page.getByTestId('notification-sheet');
  await expect(sheet).toBeVisible();
  // A modal dialog: the page behind is inert, and the sheet sits on the bottom edge.
  expect(await sheet.evaluate((d) => (d as HTMLDialogElement).matches(':modal'))).toBe(true);
  const box = (await sheet.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.round(box.y + box.height)).toBe(vp.height);
  expect(Math.round(box.width)).toBe(vp.width);
  expect(await sheet.evaluate((d) => d.scrollWidth - d.clientWidth)).toBeLessThanOrEqual(0);
  await expectNoHorizontalScroll(page);
  expect(await expectTargets(controls(sheet))).toBeGreaterThanOrEqual(8);
  await shot(page, 'phone-sheet');
  await page.clock.resume();
  await noSeriousA11yIssues(page);
  // Close: the sheet goes and focus returns to the bell.
  await sheet.getByRole('button', { name: 'Close notifications' }).click();
  await expect(sheet).toBeHidden();
  await expect(bell(page)).toBeFocused();

  // The full page on a phone: chips, Mark all, rows and Show older.
  await seedMany(
    sql,
    teacher.id,
    22,
    { kind: 'update', href: '/teacher/profile', entityType: 'teacher_profile', entityId: teacher.id },
    new Date(Date.now() - 3_600_000),
  );
  await page.goto('/teacher/notifications');
  const region = page.getByRole('region', { name: 'Your notifications' });
  await expect(region).toBeVisible({ timeout: 30_000 });
  await page.clock.pauseAt(new Date(Date.now() + 10_000));
  await expect(region.getByRole('button', { name: 'Show older' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTargets(controls(region).and(page.locator(':not([type="radio"])')));
  await expectTargets(region.locator('label'));
  await page.clock.resume();
  await noSeriousA11yIssues(page);
});

test('AC-41, AC-61: keyboard, focus, names, live region, reduced motion and axe on the panel or sheet', async ({
  page,
}, info) => {
  const phone = info.project.name === 'phone';
  const { teacher } = await busyTeacher();
  // D-T2-1: Server Actions (bell refresh, panel list) still in flight, so the motion check below
  // runs only once the panel has stopped changing.
  let inflight = 0;
  const isAction = (r: Request) => r.method() === 'POST' && !!r.headers()['next-action'];
  page.on('request', (r) => {
    if (isAction(r)) inflight += 1;
  });
  const ended = (r: Request) => {
    if (isAction(r)) inflight -= 1;
  };
  page.on('requestfinished', ended);
  page.on('requestfailed', ended);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await signInAs(page, teacher.email);
  await expect(page).toHaveURL(/\/teacher$/);
  await page.clock.pauseAt(new Date(Date.now() + 5_000));
  // Named "Notifications, N unread"; badges read "N waiting for you" (AX-06).
  await expect(bell(page)).toHaveAccessibleName('Notifications, 5 unread');
  if (!phone) {
    const menu = page.getByRole('navigation', { name: 'Teacher menu' });
    await expect(menu.getByRole('link', { name: 'Enquiries, 1 waiting for you' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Students, 1 waiting for you' })).toBeVisible();
    // AX-01: the approved amber pair, never white on amber.
    const badge = menu.getByTestId('menu-badge').first();
    expect(await badge.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color])).toEqual([
      'rgb(254, 166, 25)',
      'rgb(104, 64, 0)',
    ]);
  }
  // The live region says nothing on first load (AX-10).
  await expect(page.getByTestId('bell-live')).toHaveText('');

  // Enter opens; focus moves into the panel; Tab follows the visual order.
  await bell(page).focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(bell(page)).toBeFocused();
  // AX: the approved visible focus ring (3 px, primary).
  expect(await bell(page).evaluate((e) => getComputedStyle(e).outlineWidth)).toBe('3px');
  await page.keyboard.press('Enter');
  const dlg = panel(page);
  await expect(dlg).toBeVisible();
  await expect(rows(page)).toHaveCount(5);
  await expect(dlg.getByRole('heading', { name: 'Notifications' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dlg.getByRole('button', { name: 'Mark all as read' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dlg.getByRole('button', { name: 'Close notifications' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(rows(page).first().getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    rows(page)
      .first()
      .getByRole('button', { name: /^Mark as read/ }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(rows(page).nth(1).getByRole('button').first()).toBeFocused();
  // Unread state and labels are words, not colour alone (AX-07).
  await expect(rows(page).first()).toContainText('Unread');
  await expect(rows(page).first()).toContainText('Needs your reply');
  // No animation with reduced motion (AX-13); no text under 12 px (AX-03).
  // D-T2-1 (test-only): settle before counting. First, no bell refresh or panel request may still be
  // in flight (a late response re-renders the panel). Then transitions that the last Tab started
  // (0.01 ms under reduced motion) are allowed to complete. Any perceptible animation (longer than
  // 1 ms in total, or endless) fails at once, and nothing at all may remain afterwards.
  await expect.poll(() => inflight, { message: 'a bell refresh or panel request is still in flight' }).toBe(0);
  const motion = await dlg.evaluate(async (d) => {
    const describe = (a: Animation) => {
      const t = a.effect?.getComputedTiming();
      const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
      return `${a.constructor.name} ${(a as Animation & { transitionProperty?: string }).transitionProperty ?? ''} ${t?.duration}ms x${t?.iterations} on ${el?.tagName ?? '?'}[${el?.getAttribute('aria-label') ?? ''}]`;
    };
    const all = d.getAnimations({ subtree: true });
    const perceptible = all.filter((a) => {
      const t = a.effect?.getComputedTiming();
      const total = Number(t?.duration ?? 0) * Number(t?.iterations ?? 1);
      return !t || !Number.isFinite(total) || total > 1;
    });
    await Promise.all(all.filter((a) => !perceptible.includes(a)).map((a) => a.finished.catch(() => undefined)));
    return { perceptible: perceptible.map(describe), remaining: d.getAnimations({ subtree: true }).map(describe) };
  });
  expect(motion).toEqual({ perceptible: [], remaining: [] });
  const small = await dlg.evaluate((d) =>
    [...d.querySelectorAll<HTMLElement>('*')]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
      .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12)
      .map((e) => e.textContent),
  );
  expect(small).toEqual([]);
  // axe needs real timers.
  await page.clock.resume();
  await noSeriousA11yIssues(page);
  if (!phone) await shot(page, 'desktop-panel');

  if (phone) {
    // The sheet keeps focus inside while open (AX-08).
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await dlg.evaluate(
        (d) => d.contains(document.activeElement) || document.activeElement === document.body,
      );
      expect(inside).toBe(true);
    }
  }

  // Mark as read by keyboard: the number changes and is announced once, politely.
  await rows(page)
    .first()
    .getByRole('button', { name: /^Mark as read/ })
    .focus();
  await page.keyboard.press('Enter');
  await expect(bellCount(page)).toHaveText('4');
  await expect(page.getByTestId('bell-live')).toHaveText('4 unread notifications');
  await expect(page.getByTestId('bell-live')).toHaveAttribute('aria-live', 'polite');

  // Escape closes and returns focus to the bell; Space opens it again.
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(bell(page)).toBeFocused();
  await page.keyboard.press(' ');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bell(page)).toBeFocused();
});

test('AC-38, AC-41: loading skeleton, empty states (child-friendly for students) and axe on the page', async ({
  page,
  browser,
}) => {
  const parent = await seedParent(sql);
  const child = await seedChild(sql, parent.id);
  await page.clock.install();
  await signInAs(page, parent.email);
  await expect(page).toHaveURL(/\/parent$/);
  await page.clock.pauseAt(new Date(Date.now() + 5_000));
  // Hold the list response so the loading state shows.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/*', async (route) => {
    const r = route.request();
    if (r.method() === 'POST' && r.headers()['next-action']) await held;
    await route.fallback();
  });
  await bell(page).click();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Loading notifications' })).toBeVisible();
  release();
  await expect(panel(page).getByTestId('notifications-empty')).toContainText("You're all caught up");
  await page.unroute('**/*');
  await page.keyboard.press('Escape');

  await page.goto('/parent/notifications');
  await expect(page.getByTestId('notifications-empty')).toContainText("You're all caught up");
  await page.clock.resume();
  await noSeriousA11yIssues(page);

  const kid = await (await browser.newContext({ viewport: page.viewportSize() })).newPage();
  await childSignIn(kid, child.username, child.password);
  await expect(kid).toHaveURL(/\/student$/);
  await openBell(kid);
  await expect(panel(kid).getByRole('heading', { name: 'Your updates' })).toBeVisible();
  await expect(panel(kid).getByTestId('notifications-empty')).toContainText("You're all caught up!");
  await expect(panel(kid).getByTestId('notifications-empty')).toContainText(
    'New things from your teachers will show up here.',
  );
  await noSeriousA11yIssues(kid);
  await kid.context().close();
});

test('review screenshots: the parent Notifications page and a redacted row', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop' || !shots, 'Only when N2_SHOTS is set');
  const parent = await seedParent(sql);
  const teacher = await seedTeacher(sql);
  const child = await seedChild(sql, parent.id);
  const enquiry = await seedEnquiry(sql, parent.id, teacher.id);
  const link = await seedLinkRequest(sql, teacher.id, child.id, parent.id);
  await seedNote(sql, parent.id, {
    title: 'Seeded Tutor accepted your enquiry',
    body: 'Grade 5 · CBSE · Maths',
    href: '/parent/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
    createdAt: new Date(Date.now() - 3 * 3_600_000),
    read: true,
  });
  await seedNote(sql, parent.id, {
    kind: 'action',
    type: 'enquiry_received',
    title: 'Seeded Tutor asked a question about your enquiry',
    body: 'Hourly lessons · Maths',
    href: '/parent/enquiries',
    entityType: 'enquiry',
    entityId: enquiry,
    createdAt: new Date(Date.now() - 50 * 60_000),
  });
  await seedNote(sql, parent.id, {
    title: 'Your link request is waiting for the teacher',
    href: '/parent/teachers',
    entityType: 'link_request',
    entityId: link,
    createdAt: new Date(Date.now() - 5 * 60_000),
  });
  await signInAs(page, parent.email);
  await expect(page).toHaveURL(/\/parent$/);
  await page.goto('/parent/notifications');
  await expect(page.getByTestId('notification-row')).toHaveCount(3);
  await shot(page, 'parent-notifications-page');
  await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = now() WHERE student_id = ${child.id}`;
  await page.reload();
  await expect(page.getByTestId('notification-title').getByText('Notification no longer available')).toBeVisible();
  await openBell(page);
  await shot(page, 'redacted-row');
});
