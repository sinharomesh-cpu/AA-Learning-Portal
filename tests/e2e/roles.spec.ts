import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, expectNoSeriousAxeIssues, signInAdult, signInChild } from './helpers';

const AREAS = ['/student', '/parent', '/teacher', '/admin'] as const;

test.describe('demo sign-in (OC-27)', () => {
  test('signed-out visitors are sent to sign-in from every role area', async ({ page }) => {
    for (const area of AREAS) {
      await page.goto(area);
      await expect(page).toHaveURL(/\/sign-in$/);
    }
  });

  test('sign-in pages are accessible and labelled as demo', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Demo sign-in.')).toBeVisible();
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);
    await page.goto('/sign-in/child');
    await expect(page.getByRole('heading', { level: 1, name: 'Hello! Ready to learn?' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Demo Parent/ })).toHaveCount(0);
    await expectNoSeriousAxeIssues(page);
    await expectNoHorizontalScroll(page);
  });

  test('a forged session cookie for an unknown persona is ignored', async ({ page, context }) => {
    await context.addCookies([{ name: 'aa_demo_session', value: 'demo-hacker', url: 'http://127.0.0.1:3100' }]);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test.describe('role isolation (FR-002, R-01)', () => {
  test('student sees only the student area and no human-booking control', async ({ page }) => {
    await signInChild(page, 'Kiran');
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Science with Teacher A. Rao');
    // FR-008.2: no control to book, cancel or reschedule a human meeting.
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const forbidden of ['book a teacher', 'book teacher', 'cancel', 'reschedule', 'upload']) {
      expect(text).not.toContain(forbidden);
    }
    // R-06 / OC-44: no meeting link or ID; the button says it opens 10 minutes before the start.
    expect(text).not.toMatch(/zoom\.us|meeting id|passcode/);
    await expect(page.getByRole('button', { name: 'Join opens 10 min before the start' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // No role switcher anywhere (R-01) and no sibling (R-02).
    expect(text).not.toContain('switch');
    expect(text).not.toContain('meera');

    for (const other of ['/parent', '/teacher', '/admin', '/admin/accounts']) {
      await page.goto(other);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page is for grown-ups');
      expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('parent@example.com');
    }
  });

  test('each adult role is denied the other areas with its own message', async ({ page }) => {
    const cases = [
      { persona: /Demo Parent/, home: '/parent', denied: 'Page not found', others: ['/student', '/teacher', '/admin'] },
      {
        persona: /Teacher A\. Rao/,
        home: '/teacher',
        denied: "You can't open this",
        others: ['/student', '/parent', '/admin'],
      },
      {
        persona: /Demo Admin/,
        home: '/admin',
        denied: 'Not available to admins',
        others: ['/student', '/parent', '/teacher'],
      },
    ];
    for (const c of cases) {
      await page.context().clearCookies();
      await signInAdult(page, c.persona);
      await expect(page).toHaveURL(new RegExp(`${c.home}$`));
      for (const other of c.others) {
        await page.goto(other);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(c.denied);
      }
    }
  });

  test('the denied page does not leak the other role’s data into the response', async ({ page }) => {
    await signInAdult(page, /Demo Admin/);
    const response = await page.goto('/student');
    const html = (await response?.text()) ?? '';
    expect(html).not.toContain('Science with Teacher A. Rao');
    expect(html).not.toContain('Fractions practice sheet');
  });

  test('signing out ends the session', async ({ page }) => {
    await signInChild(page, 'Kiran');
    await page.getByRole('button', { name: "Kiran's account menu" }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto('/student');
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});
