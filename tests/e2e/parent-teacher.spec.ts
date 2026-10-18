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
    // OC-44 to OC-47 and OC-49 are decided: the rules are shown, not "Not decided yet" (owner, 18 Oct 2026).
    const rules = page.getByRole('region', { name: 'Lesson rules' });
    await expect(rules).toContainText('only booked when the parent accepts it');
    await expect(rules).toContainText('up to 30 minutes before the start');
    await expect(rules).toContainText('AI lessons can be cancelled or moved any time before the start');
    for (const d of ['D-35', 'D-08', 'D-07', 'D-15', 'D-22', 'D-09']) {
      await expect(page.getByText(`Not decided yet (${d}`)).toHaveCount(0);
    }
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
      'Homework',
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
    await expect(page.getByRole('heading', { level: 1, name: 'Teacher A. Rao' })).toBeVisible();
    await expect(page.getByText(/Times are shown in your time zone \(GMT\+8, Asia\/Singapore\)/)).toBeVisible();
    await expect(page.getByRole('list', { name: 'What you teach' })).toContainText('Science');
    await expect(page.getByRole('list', { name: 'What you teach' })).toContainText('Grades 4–5');
    await expect(page.getByText('Demo: sample data only')).toBeVisible();
    const lessons = page.getByRole('region', { name: 'Scheduled teaching sessions' }).getByRole('article');
    await expect(lessons).toHaveCount(2);
    // Kiran's lesson is 4:30 pm in Kolkata, which is 7:00 pm in Singapore (FR-019).
    await expect(lessons.nth(0)).toContainText('Today 7:00 pm–7:40 pm');
    await expect(lessons.nth(0)).toContainText('40 min · on Zoom');
    await expect(lessons.nth(1)).toContainText('Waiting for parent');
    await expect(lessons.nth(1)).toContainText('no Zoom meeting until the parent accepts');
    await expect(page.getByRole('button', { name: 'Start opens 10 min before the start' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const availability = page.getByRole('region', { name: 'Availability' });
    await expect(availability.getByRole('list', { name: 'Next 7 days' }).getByRole('listitem')).toHaveCount(7);
    await expect(availability.getByRole('list', { name: 'Next 7 days' })).toContainText(/: 2 times open, 1 taken/);
    await expect(availability).toContainText('1 booked · 2 open');
    await expect(availability).toContainText('1 waiting · 2 open');
    const students = page.getByRole('region', { name: 'My students' });
    await expect(students.getByRole('heading', { level: 3 })).toHaveCount(2);
    await students.getByLabel('Filter by student or grade').fill('grade 4');
    await expect(students.getByRole('heading', { level: 3 })).toHaveText(['Meera']);
    await students.getByLabel('Filter by student or grade').fill('');
    // CR-07 H-2b: sharing is open; the panel links to the resources page (board HW1).
    await expect(page.getByRole('link', { name: 'Choose a file' })).toHaveAttribute('href', '/teacher/resources');
    // No unverified claims, rankings or child photos from the reference (S21 deviations).
    const text = (await page.locator('main').innerText()).toLowerCase();
    expect(text).not.toMatch(/accredited|faculty id|top 10%|rising star|mastery|safe environment|dispatched/);
    await expect(page.locator('main img')).toHaveCount(0);
    // D-16 is decided (OC-51, OC-86), so it is no longer shown as open.
    await expect(page.getByText('Not decided yet (D-16):')).toHaveCount(0);
    // OC-44 to OC-47 and OC-36 are decided: shown as rules, never as "Not decided yet".
    for (const d of ['D-35', 'D-08', 'D-07', 'D-15', 'D-09']) {
      await expect(page.getByText(`Not decided yet (${d}`)).toHaveCount(0);
    }
    const rules = page.getByRole('region', { name: 'Lesson rules' });
    await expect(rules).toContainText('Start opens 10 minutes before the start and stays open until the lesson ends.');
    await expect(rules).toContainText('All lessons are 1:1.');
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
