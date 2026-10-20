import { expect, type Page, type Request, test } from '@playwright/test';
import { signInAdult, signInChild } from './helpers';

/**
 * CR-16 AC-77 (OC-121 (1)): in the sample-data preview no bell, notification panel or menu badge
 * is shown on any parent, teacher or student page, and no notification request is made — not on
 * load and not by the 60-second refresh (the browser clock is moved on three minutes per page).
 * Every notification request is a Server Action, so none at all may be sent.
 */

const PAGES = {
  parent: [
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
  ],
  teacher: [
    '/teacher',
    '/teacher/schedule',
    '/teacher/availability',
    '/teacher/students',
    '/teacher/listing',
    '/teacher/enquiries',
    '/teacher/resources',
    '/teacher/profile',
    '/teacher/notifications',
  ],
  student: [
    '/student',
    '/student/schedule',
    '/student/book',
    '/student/homework',
    '/student/library',
    '/student/history',
  ],
} as const;

function serverActions(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.headers()['next-action']) seen.push(r);
  });
  return seen;
}

async function noNotificationUi(page: Page, path: string) {
  await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
  await expect(page.getByTestId('notification-bell'), path).toHaveCount(0);
  await expect(page.getByRole('button', { name: /unread/ }), path).toHaveCount(0);
  await expect(page.getByTestId('bell-count'), path).toHaveCount(0);
  await expect(
    page.locator('[data-testid="notification-panel"], [data-testid="notification-sheet"]'),
    path,
  ).toHaveCount(0);
  await expect(page.getByTestId('menu-badge'), path).toHaveCount(0);
  await expect(page.getByRole('link', { name: /waiting for you/ }), path).toHaveCount(0);
}

for (const [role, paths] of Object.entries(PAGES)) {
  test(`AC-77: sample-data ${role} pages have no bell, no menu badge and make no notification request`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.clock.install();
    if (role === 'student') await signInChild(page, 'Kiran');
    else await signInAdult(page, role === 'parent' ? 'Demo Parent' : 'Teacher A. Rao');
    // From here on every request the pages make is watched (signing in itself is not checked).
    const actions = serverActions(page);
    for (const path of paths) {
      await page.goto(path);
      await noNotificationUi(page, path);
      await page.clock.runFor(3 * 60_000);
      await noNotificationUi(page, path);
    }
    if (role !== 'student') {
      // The Notifications page exists but says the preview has none.
      await page.goto(`/${role}/notifications`);
      await expect(page.getByText('The sample preview has no notifications.')).toBeVisible();
    }
    await page.waitForTimeout(500);
    expect(actions.map((r) => r.url())).toEqual([]);
  });
}
