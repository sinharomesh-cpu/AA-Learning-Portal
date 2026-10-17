import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, expectNoSeriousAxeIssues, signInAdult, signInChild } from './helpers';

/** WP-6 / WP-7: Parent family home (P19), children list (M-07) and Teacher dashboard (P21). */

test.describe('parent family home (P19, boards 53 and 54)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAdult(page, /Demo Parent/);
  });

  test('shows both children, their lessons, content and reminders', async ({ page }, testInfo) => {
    await expect(page.getByText(/Times are shown in your time zone \(IST, Asia\/Kolkata\)/)).toBeVisible();
    const kids = page.getByRole('region', { name: 'Your children' }).getByRole('article');
    await expect(kids).toHaveCount(2);
    await expect(kids.nth(0)).toContainText('Kiran');
    await expect(kids.nth(0)).toContainText('Today 4:30 pm');
    await expect(kids.nth(0)).toContainText('Science with Teacher A. Rao · 40 min');
    await expect(kids.nth(1)).toContainText('Meera');
    await expect(page.getByText('Proposed by teacher').first()).toBeVisible();
    await expect(page.getByText('Not decided yet (D-08):')).toBeVisible();
    await expect(page.getByText('Not decided yet (D-22):')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Learning content' }).getByText('From Teacher B. Iyer'),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Reminders and messages' }).getByText('parent@example.com', { exact: false }),
    ).toBeVisible();
    if (testInfo.project.name === 'desktop') {
      const table = page.getByRole('table');
      await expect(table.getByRole('row')).toHaveCount(6); // header + 5 lessons this week
      await expect(table).toContainText('Email, 15 min before');
    } else {
      await expect(page.getByRole('link', { name: /Review .*’s lesson/ })).toBeVisible();
    }
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test('the children list shows only linked children with their profile details (M-07)', async ({ page }) => {
    await page.goto('/parent/children');
    await expect(page.getByRole('heading', { level: 1, name: 'Children' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(2);
    await expect(page.getByRole('link', { name: "Edit Kiran's profile" })).toBeVisible();
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test('profile, restrictions and booking pages open only for this family (FR-002.2)', async ({ page }) => {
    await page.goto('/parent/children/demo-student-kiran');
    await expect(page.getByRole('heading', { level: 1, name: "Kiran's profile" })).toBeVisible();
    await page.goto('/parent/children/demo-student-meera/restrictions');
    await expect(page.getByRole('heading', { level: 1, name: "Meera's availability and restrictions" })).toBeVisible();
    await page.goto('/parent/bookings/l-m2');
    await expect(page.getByRole('heading', { level: 1, name: 'Booking details' })).toBeVisible();
    for (const path of [
      '/parent/children/demo-teacher-rao',
      '/parent/children/demo-admin/restrictions',
      '/parent/children/someone-else',
      '/parent/bookings/not-a-booking',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    }
  });

  test('every parent menu item opens a page in the parent shell', async ({ page }, testInfo) => {
    const items = [
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
      'Family home',
    ];
    for (const name of items) {
      if (testInfo.project.name === 'phone') await page.getByRole('button', { name: /open parent menu/i }).click();
      const link = page.getByRole('navigation', { name: 'Parent menu' }).getByRole('link', { name, exact: true });
      const href = (await link.getAttribute('href')) ?? '';
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // aria-current is checked on desktop; the phone menu closes itself after navigation.
      if (testInfo.project.name === 'desktop') {
        await expect(
          page.getByRole('navigation', { name: 'Parent menu' }).getByRole('link', { name, exact: true }),
        ).toHaveAttribute('aria-current', 'page');
      }
    }
  });
});

test.describe('teacher dashboard (P21, boards 55 and 56)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAdult(page, /Teacher A\. Rao/);
  });

  test('shows own lessons in the teacher’s time zone, availability, students and sharing', async ({ page }) => {
    await expect(
      page.getByText(/Science · Grades 4–5 · times are shown in your time zone \(GMT\+8, Asia\/Singapore\)/),
    ).toBeVisible();
    const lessons = page.getByRole('region', { name: 'Upcoming lessons' }).getByRole('article');
    await expect(lessons).toHaveCount(2);
    // Kiran's lesson is 4:30 pm in Kolkata, which is 7:00 pm in Singapore (FR-019).
    await expect(lessons.nth(0)).toContainText('Today 7:00 pm–7:40 pm · 40 min · on Zoom');
    await expect(lessons.nth(1)).toContainText('Waiting for parent');
    await expect(lessons.nth(1)).toContainText('Zoom meeting not created yet');
    await expect(page.getByRole('button', { name: 'Start opens before the lesson' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const availability = page.getByRole('region', { name: 'My availability this week' });
    await expect(availability.getByRole('listitem')).toHaveCount(3);
    await expect(availability).toContainText('1 booked · 2 open');
    await expect(availability).toContainText('1 waiting · 2 open');
    await expect(page.getByRole('region', { name: 'My students' }).getByRole('listitem')).toHaveCount(2);
    for (const d of ['D-35', 'D-08', 'D-07', 'D-15', 'D-09', 'D-16']) {
      await expect(page.getByText(`Not decided yet (${d}):`)).toBeVisible();
    }
    // R-06: no meeting link, ID or passcode anywhere.
    expect((await page.locator('body').innerText()).toLowerCase()).not.toMatch(/zoom\.us|meeting id|passcode/);
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test('a teacher can open only linked students and no family or admin pages', async ({ page }) => {
    await page.goto('/teacher/students/demo-student-kiran');
    await expect(page.getByRole('heading', { level: 1, name: 'Kiran' })).toBeVisible();
    await page.goto('/teacher/students/demo-parent');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("You can't open this");
    for (const path of ['/parent', '/parent/children', '/parent/bookings/l-k1', '/student', '/admin']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText("You can't open this");
    }
  });
});

test.describe('the same lesson in every view', () => {
  test('a student cannot open parent or teacher pages, including detail pages', async ({ page }) => {
    await signInChild(page, 'Kiran');
    for (const path of [
      '/parent/children/demo-student-kiran',
      '/parent/bookings/l-k1',
      '/teacher/students/demo-student-kiran',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page is for grown-ups');
      expect(await page.locator('body').innerText()).not.toContain('Booking details');
    }
  });
});
