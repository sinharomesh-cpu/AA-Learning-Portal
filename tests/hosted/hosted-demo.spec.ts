import { expect, test } from '@playwright/test';
import { signInAdult, signInChild } from '../e2e/helpers';

/** OC-34: the hosted demo preview works as a production build and is clearly marked. */
test('every page says it is a demo and is hidden from search engines', async ({ page }) => {
  const response = await page.goto('/sign-in');
  expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
  await expect(page.getByTestId('demo-preview-banner')).toHaveText(/Sample data only/);
});

test('sample sign-in works and roles stay separated', async ({ page }) => {
  await signInChild(page, 'Kiran');
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByTestId('demo-preview-banner')).toBeVisible();
  await page.goto('/parent');
  await expect(page.getByRole('heading', { name: 'This page is for grown-ups' })).toBeVisible();

  await page.context().clearCookies();
  await signInAdult(page, /Demo Parent/);
  await expect(page.getByRole('heading', { level: 1, name: /Demo Parent/ })).toBeVisible();
  await page.goto('/teacher');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('the demo session cookie is secure on the hosted preview', async ({ page }) => {
  await signInAdult(page, /Teacher A\. Rao/);
  const cookie = (await page.context().cookies()).find((c) => c.name === 'aa_demo_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
});
