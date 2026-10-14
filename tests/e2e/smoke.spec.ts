import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('home page loads with the AA Pro brand and no serious accessibility issues', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/AA Pro/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AA Pro');

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});

test('security headers are sent', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-powered-by']).toBeUndefined();
});
