import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, signInAdult } from './helpers';

test('home shows the public landing page to a signed-out visitor (OC-39, board 63)', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle('AA Pro');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your Universe of Learning Starts Here/);
  for (const name of [
    'Meet Our Subject Specialists',
    'Three simple paths',
    // Teachers can publish listings since PR-D3, so the H1 wording is shown.
    'Looking for students?',
    'Built for children, run by parents',
    'About AA Pro',
    'Questions parents and teachers ask',
    'We’re happy to help',
  ]) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  // Owner-supplied text is still marked as a draft or placeholder, never invented (OC-39).
  await expect(page.getByText('Draft — owner to edit. Nothing below is final.')).toBeVisible();
  await expect(page.getByText('[contact email — owner to provide]')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toHaveAttribute('href', '/sign-in');
  // OC-41/OC-43: the core book-sharing feature is explained.
  await expect(page.getByRole('heading', { level: 3, name: 'Your books stay in AA Pro' })).toBeVisible();
  await expect(page.getByText('How do teachers get my child’s books?')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
  await expectNoHorizontalScroll(page);
});

test('the landing menu reaches every section', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  if (await nav.getByText('Menu').isVisible()) await nav.getByText('Menu').click();
  await nav.getByRole('link', { name: 'FAQ' }).click();
  await expect(page).toHaveURL(/#faq$/);
});

test('H1/H2: "Find a teacher" reaches the teachers section, which says honestly when no one is listed', async ({
  page,
}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  if (await nav.getByText('Menu').isVisible()) await nav.getByText('Menu').click();
  await nav.getByRole('link', { name: 'Find a teacher' }).click();
  await expect(page).toHaveURL(/#teachers$/);
  const section = page.locator('#teachers');
  await expect(section.getByText(/No teachers are listed right now/)).toBeVisible();
  await expect(section.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/create-account');
  // Nothing about enquiries until they exist (PR-D4); no contact details anywhere.
  await expect(page.getByText(/Connect with teacher/)).toHaveCount(0);
  // The sample preview has no listings, so there are no search controls either.
  await expect(section.getByRole('search')).toHaveCount(0);
  expect(await page.locator('main').innerText()).not.toMatch(/@/);
  await expect(page.getByText('How do I pay a teacher?')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('public pages work in dark mode and remember the light/dark choice (owner, 17 Oct 2026)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const path of ['/', '/sign-in', '/sign-in/child', '/create-account']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Dark palette is applied to the public frame.
    const bg = await page.locator('.aa-public').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(11, 16, 38)');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, `${path} ${JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.target)]))}`).toEqual([]);
    await expectNoHorizontalScroll(page);
  }
  // The switch overrides the device setting and is remembered across pages.
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Dark mode' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/sign-in');
  expect(await page.locator('.aa-public').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(250, 248, 255)',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('a signed-in user skips the landing page and goes to their own home', async ({ page }) => {
  await signInAdult(page, /Demo Parent/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/parent$/);
});

test('create an account says plainly that accounts are not open yet', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Create an account' }).last().click();
  await expect(page).toHaveURL(/\/create-account$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible();
  await expect(page.getByText('Parent and teacher accounts are not open yet.')).toBeVisible();
});

test('both sign-in pages lead back to the home page (OC-52)', async ({ page }) => {
  for (const path of ['/sign-in', '/sign-in/child']) {
    await page.goto(path);
    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your Universe of Learning/);
  }
});

test('security headers are sent', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-powered-by']).toBeUndefined();
});
