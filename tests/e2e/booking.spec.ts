import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, expectNoSeriousAxeIssues, signInAdult, signInChild } from './helpers';

/** WP-8: S13 booking wizard, M-17 outcomes and M-16 history. Demo only — nothing is booked. */

async function chooseOpenTimeTomorrow(page: Page) {
  // The day after tomorrow: tomorrow before 5:15 pm is within 24 hours of today's AI lesson (OC-89).
  await page.getByRole('group', { name: 'Day' }).getByRole('radio').nth(2).check();
  await page.getByRole('group', { name: 'Part of the day' }).getByRole('radio', { name: 'Afternoon' }).check();
  const time = page
    .getByRole('group', { name: /^Start time/ })
    .getByRole('radio', { disabled: false })
    .first();
  await time.check();
}

test.describe('AI booking wizard (S13, boards 7 and 8)', () => {
  test.beforeEach(async ({ page }) => {
    await signInChild(page, 'Kiran');
    await page.goto('/student/book');
  });

  test('a student can choose a lesson and sees the demo outcome (M-17)', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Book a lesson with the AI Tutor' })).toBeVisible();
    await expect(page.getByText('Nothing is really booked.')).toBeVisible();
    const book = page.getByRole('button', { name: 'Book this lesson' });
    await expect(book).toHaveAttribute('aria-disabled', 'true');
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);

    await page.getByRole('group', { name: 'Subject' }).getByRole('radio', { name: /Maths/ }).check();
    await page.getByRole('combobox', { name: 'Which chapter?' }).selectOption({ index: 1 });
    await chooseOpenTimeTomorrow(page);
    await expect(book).not.toHaveAttribute('aria-disabled');
    await book.click();

    await expect(page).toHaveURL(/\/student\/book\/result\?/);
    await expect(page.getByRole('heading', { level: 1, name: "You're booked!" })).toBeVisible();
    await expect(page.getByText('Nothing was really booked.')).toBeVisible();
    await expect(page.getByText(/Maths · .* · 15 min/)).toBeVisible();
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test('only the parent-enabled subjects, one 15-minute length and one AI class a day (OC-89)', async ({ page }) => {
    const subjects = page.getByRole('group', { name: 'Subject' }).getByRole('radio');
    await expect(subjects).toHaveCount(5); // IT is not enabled for Kiran
    await expect(page.getByRole('group', { name: 'Lesson length' })).toHaveCount(0);
    await expect(page.getByText('Every AI class is 15 minutes')).toBeVisible();
    // Kiran has an AI lesson today at 5:15 pm, so today's later times are one-a-day blocked.
    await page.getByRole('group', { name: 'Part of the day' }).getByRole('radio', { name: 'Evening' }).check();
    await expect(
      page.getByRole('group', { name: /^Start time/ }).getByRole('radio', { name: /6:00 pm.*One AI class a day/ }),
    ).toBeDisabled();
    await expect(page.getByText('Not decided yet (D-05):')).toBeVisible();
  });

  test('the server re-checks the choice: a tampered link gets "not an open time"', async ({ page }) => {
    const tampered = [
      'subject=it&length=15&start=2030-01-01T10:00:00.000Z', // subject not enabled, outside window
      'subject=maths&length=30&start=2030-01-01T10:00:00.000Z', // 30 minutes is no longer offered (OC-89)
      'subject=maths&length=15&start=yesterday',
    ];
    for (const q of tampered) {
      await page.goto(`/student/book/result?${q}`);
      await expect(page.getByRole('heading', { level: 1, name: "That time isn't open" })).toBeVisible();
      await expect(page.getByText("You're booked!")).toHaveCount(0);
    }
    await expectNoSeriousAxeIssues(page);
  });

  test('the wizard has no way to book a human teacher (FR-008.2)', async ({ page }) => {
    const text = (await page.locator('main').innerText()).toLowerCase();
    expect(text).toContain('only parents can book teachers');
    for (const forbidden of ['book a teacher', 'zoom', 'reschedule', 'cancel']) expect(text).not.toContain(forbidden);
  });
});

test.describe('learning history (M-16, boards 26 and 27)', () => {
  test('each student sees only their own past lessons', async ({ page }) => {
    await signInChild(page, 'Kiran');
    await page.goto('/student/history');
    await expect(page.getByRole('heading', { level: 1, name: "Things I've learned" })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(3);
    await expect(page.getByText('Not decided yet (D-24):')).toBeVisible();
    await expect(page.getByText('12 min')).toBeVisible();
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: "Kiran's account menu" }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await signInChild(page, 'Meera');
    await page.goto('/student/history');
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByText('Science with Teacher A. Rao')).toHaveCount(0);
  });
});

test.describe('booking and history stay inside the student area (FR-002)', () => {
  for (const path of ['/student/book', '/student/book/result?subject=maths&length=30&start=x', '/student/history']) {
    test(`a parent opening ${path} gets access denied and no student data`, async ({ page }) => {
      await signInAdult(page, /Demo Parent/);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
      const html = await page.content();
      for (const leak of [
        'Book this lesson',
        'Things I&#x27;ve learned',
        'Maths — Chapter 6',
        'Nothing was really booked',
      ]) {
        expect(html).not.toContain(leak);
      }
    });
  }
});
