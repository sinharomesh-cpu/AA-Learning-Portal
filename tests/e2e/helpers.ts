import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export async function signInAdult(page: Page, name: RegExp | string) {
  await page.goto('/sign-in');
  await page.getByRole('radio', { name }).check();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

export async function signInChild(page: Page, name: string) {
  await page.goto('/sign-in/child');
  await page.getByRole('radio', { name: new RegExp(`^${name}`) }).check();
  await page.getByRole('button', { name: "Let's go" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

export async function expectNoSeriousAxeIssues(page: Page) {
  // Next.js streams page metadata: the <title> arrives just after the first HTML. Wait for it, so
  // the scan never sees that brief moment (test-only synchronisation; owner approval 30 Oct 2026).
  await expect(page).toHaveTitle(/\S/);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
