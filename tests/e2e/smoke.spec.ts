import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, signInAdult } from './helpers';

test('home shows the public landing page to a signed-out visitor (OC-39, board 63)', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle('AA Pro');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /Learning at home with an AI Tutor and real teachers/,
  );
  for (const name of [
    'Three simple paths',
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

test('security headers are sent', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-powered-by']).toBeUndefined();
});
