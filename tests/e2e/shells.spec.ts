import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, expectNoSeriousAxeIssues, signInAdult, signInChild } from './helpers';

test.describe('student shell (S1 / S9)', () => {
  test.beforeEach(async ({ page }) => {
    await signInChild(page, 'Kiran');
  });

  test('dashboard shows the approved sections with synthetic data', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'My subjects' })).toBeVisible();
    const subjects = page.getByRole('region', { name: 'My subjects' }).getByRole('listitem');
    await expect(subjects).toHaveCount(5); // IT not enabled for Kiran
    await expect(page.getByRole('heading', { name: 'AA Pro AI Tutor' })).toBeVisible();
    const today = page.getByRole('region', { name: 'Today' });
    await expect(today.getByText('AI Tutor')).toBeVisible();
    await expect(today.getByText('Teacher', { exact: true })).toBeVisible();
    await expect(today.getByText('40 min')).toBeVisible();
    await expect(today.getByText('30 min')).toBeVisible();
    await expect(page.getByText('4:30 pm').first()).toBeVisible();
    await expect(page.getByText('Not decided yet (D-35):')).toBeVisible();
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test('every student menu item opens a page inside the student shell', async ({ page }, testInfo) => {
    const phone = testInfo.project.name === 'phone';
    const items = [
      { name: phone ? 'Schedule' : 'My schedule', heading: 'My schedule' },
      { name: 'Book AI class', heading: 'Book a lesson with the AI Tutor' },
      { name: 'Library', heading: 'My library' },
      { name: 'History', heading: "Things I've learned" },
      { name: 'Home', heading: 'Science with Teacher A. Rao' },
    ];
    for (const item of items) {
      const link = page
        .getByRole('navigation', { name: 'Student menu' })
        .getByRole('link', { name: item.name, exact: true });
      await link.click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.heading);
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expectNoSeriousAxeIssues(page);
    }
  });

  test('primary child actions are at least 56 px tall', async ({ page }) => {
    const join = page.getByRole('button', { name: 'Join opens before start' });
    expect((await join.boundingBox())?.height).toBeGreaterThanOrEqual(56);
  });
});

test.describe('Super Admin shell (M-26/35, M-27)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAdult(page, /Demo Admin/);
  });

  test('home shows counts only and the v1 menu without Integration Health', async ({ page }, testInfo) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Active parent accounts')).toBeVisible();
    if (testInfo.project.name === 'phone') await page.getByRole('button', { name: /open super admin menu/i }).click();
    const menu = page.getByRole('navigation', { name: 'Super Admin menu' });
    await expect(menu.getByRole('link')).toHaveText([
      'Home',
      'Accounts',
      'Teacher approvals',
      'Admins',
      'Audit log',
      'Security',
    ]);
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text).not.toContain('integration');
    expect(text).not.toMatch(/sign in as|impersonat/);
    expect(text).not.toContain('kiran');
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test('accounts list shows parents and teachers only, read-only', async ({ page }) => {
    await page.goto('/admin/accounts');
    await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('teacher.e@example.com').filter({ visible: true })).toHaveCount(1);
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text).not.toContain('kiran');
    expect(text).not.toContain('meera');
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);
  });
});

test.describe('parent and teacher shells (P19 / P21)', () => {
  test('each sees their own dashboard heading and menu', async ({ page }, testInfo) => {
    const phone = testInfo.project.name === 'phone';
    await signInAdult(page, /Demo Parent/);
    await expect(page.getByRole('heading', { level: 1, name: /, Demo Parent$/ })).toBeVisible();
    if (phone) await page.getByRole('button', { name: /open parent menu/i }).click();
    await expect(page.getByRole('navigation', { name: 'Parent menu' }).getByRole('link')).toHaveText([
      'Family home',
      'Children',
      'Teachers',
      'My enquiries',
      'Schedule AI class',
      'Book human teacher',
      'Family calendar',
      'Content repository',
      'Session history',
      'Notifications',
      'Settings',
    ]);
    await page.context().clearCookies();
    await signInAdult(page, /Teacher A\. Rao/);
    await expect(page.getByRole('heading', { level: 1, name: 'Teacher A. Rao' })).toBeVisible();
    if (phone) await page.getByRole('button', { name: /open teacher menu/i }).click();
    await expect(page.getByRole('navigation', { name: 'Teacher menu' }).getByRole('link')).toHaveText([
      'Dashboard',
      'My schedule',
      'Availability',
      'Students',
      'Looking for students',
      'Enquiries',
      'Learning resources',
      'Profile',
    ]);
  });
});
