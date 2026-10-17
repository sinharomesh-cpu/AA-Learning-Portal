import { expect, test, type Page } from '@playwright/test';
import { signInAdult, signInChild } from './helpers';

/**
 * WP-9 keyboard walkthrough (NFR-09, WCAG 2.1.1, 2.4.1, 2.4.3, 2.4.7, 2.4.11). On each main page:
 * the first Tab reaches the skip link, every Tab stop is visible and shows a focus indicator,
 * and focus never gets stuck or lands on a hidden element.
 */

async function walk(page: Page, maxStops = 60) {
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(first).toBe('Skip to main content');
  const seen: string[] = [];
  for (let i = 0; i < maxStops; i += 1) {
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        key: `${el.tagName}|${el.getAttribute('href') ?? ''}|${(el.textContent ?? '').trim().slice(0, 40)}|${Math.round(r.top + window.scrollY)}`,
        visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden',
        ring: (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || s.boxShadow !== 'none',
      };
    });
    if (!info) break;
    expect(info.visible, `hidden focus target: ${info.key}`).toBe(true);
    expect(info.ring, `no visible focus indicator: ${info.key}`).toBe(true);
    if (seen.includes(info.key)) break; // wrapped around
    seen.push(info.key);
    await page.keyboard.press('Tab');
  }
  expect(seen.length).toBeGreaterThan(3);
}

const PAGES: Array<{ who: 'Kiran' | RegExp; child: boolean; paths: string[] }> = [
  { who: 'Kiran', child: true, paths: ['/student', '/student/book', '/student/history'] },
  { who: /Demo Parent/, child: false, paths: ['/parent', '/parent/children'] },
  { who: /Teacher A\. Rao/, child: false, paths: ['/teacher'] },
  { who: /Demo Admin/, child: false, paths: ['/admin', '/admin/accounts'] },
];

for (const group of PAGES) {
  for (const path of group.paths) {
    test(`keyboard walkthrough ${path}`, async ({ page }) => {
      if (group.child) await signInChild(page, group.who as string);
      else await signInAdult(page, group.who);
      await page.goto(path);
      await walk(page);
    });
  }
}

test('the skip link moves focus to the main content', async ({ page }) => {
  await signInChild(page, 'Kiran');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  await page.keyboard.press('Tab');
  const inMain = await page.evaluate(() => Boolean(document.activeElement?.closest('#main')));
  expect(inMain).toBe(true);
});

test('the booking wizard can be completed with the keyboard alone', async ({ page }) => {
  await signInChild(page, 'Kiran');
  await page.goto('/student/book');
  await page.getByRole('radio', { name: /Maths/ }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('group', { name: 'Day' }).getByRole('radio').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight'); // the day after tomorrow: outside the one-a-day window (OC-89)
  await page.getByRole('group', { name: 'Part of the day' }).getByRole('radio', { name: 'Afternoon' }).focus();
  await page.keyboard.press('Space');
  await page
    .getByRole('group', { name: /^Start time/ })
    .getByRole('radio', { disabled: false })
    .first()
    .focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Book this lesson' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: "You're booked!" })).toBeVisible();
});

test('accessibility tree: every page has one h1, a main landmark and a labelled navigation', async ({
  page,
}, testInfo) => {
  const checks: Array<[RegExp | string, boolean, string[]]> = [
    ['Kiran', true, ['/student', '/student/book', '/student/history']],
    [/Demo Parent/, false, ['/parent', '/parent/children']],
    [/Teacher A\. Rao/, false, ['/teacher']],
  ];
  for (const [who, child, paths] of checks) {
    await page.context().clearCookies();
    if (child) await signInChild(page, who as string);
    else await signInAdult(page, who);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      if (testInfo.project.name === 'phone' && !child) {
        // Phone adult shells keep the menu behind a disclosure button (board 52 pattern).
        await expect(page.getByRole('button', { name: /^Open .* menu$/ })).toHaveAttribute('aria-expanded', 'false');
        continue;
      }
      expect(await page.getByRole('navigation').count()).toBeGreaterThan(0);
      for (const nav of await page.getByRole('navigation').all()) {
        expect(await nav.getAttribute('aria-label')).toBeTruthy();
      }
    }
  }
});
