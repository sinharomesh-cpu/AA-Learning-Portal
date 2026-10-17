import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, expectNoSeriousAxeIssues, signInAdult, signInChild } from './helpers';

/**
 * OC-83: light and dark mode across the signed-in portal. Each role's main pages pass the
 * automated accessibility scan (including colour contrast) in dark mode, and the switch in the
 * portal header (desktop) or Menu (phone) changes the theme and is remembered.
 */

const ROUTES = {
  parent: ['/parent', '/parent/children', '/parent/teachers', '/parent/calendar'],
  student: ['/student', '/student/book', '/student/history', '/student/library'],
  teacher: ['/teacher', '/teacher/schedule', '/teacher/profile'],
  admin: ['/admin', '/admin/accounts', '/admin/approvals'],
};

async function backgroundOf(page: Page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

async function checkDark(page: Page, routes: string[]) {
  for (const path of routes) {
    await page.goto(path);
    await expect(page.locator('main').first()).toBeVisible();
    expect(await backgroundOf(page), path).toBe('rgb(11, 16, 38)');
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);
  }
}

test.describe('dark mode in the portal', () => {
  test.use({ colorScheme: 'dark' });

  test('parent pages are readable in dark mode', async ({ page }) => {
    await signInAdult(page, 'Demo Parent');
    await checkDark(page, ROUTES.parent);
  });

  test('student pages are readable in dark mode', async ({ page }) => {
    await signInChild(page, 'Kiran');
    await checkDark(page, ROUTES.student);
  });

  test('teacher pages are readable in dark mode', async ({ page }) => {
    await signInAdult(page, 'Teacher A. Rao');
    await checkDark(page, ROUTES.teacher);
  });

  test('Super Admin pages are readable in dark mode', async ({ page }) => {
    await signInAdult(page, 'Demo Admin');
    await checkDark(page, ROUTES.admin);
  });
});

test('the portal switch changes the theme and remembers it', async ({ page, isMobile }, testInfo) => {
  await signInAdult(page, 'Demo Parent');
  await page.goto('/parent');
  expect(await backgroundOf(page)).toBe('rgb(250, 248, 255)');
  const phone = isMobile || testInfo.project.name === 'phone';
  if (phone) await page.getByRole('button', { name: /Open parent menu/i }).click();
  const toggle = page.getByRole('button', { name: 'Dark mode' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await backgroundOf(page)).toBe('rgb(11, 16, 38)');
  await page.goto('/parent/children');
  expect(await backgroundOf(page)).toBe('rgb(11, 16, 38)');
  await page.reload();
  expect(await backgroundOf(page)).toBe('rgb(11, 16, 38)');
  // The student shell has the switch too, and the choice carries over in this browser.
  await page.context().clearCookies();
  await signInChild(page, 'Kiran');
  await expect(page.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true');
});
