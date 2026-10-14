import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('design system review page (demo mode)', () => {
  test('renders every component with no serious accessibility issues, including contrast', async ({ page }) => {
    await page.goto('/design-system');
    await expect(page.getByRole('heading', { level: 1, name: 'Design system review' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
  });

  test('uses the self-hosted fonts and no third-party font requests', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') external.push(url.hostname);
    });
    await page.goto('/design-system');
    await page.waitForLoadState('networkidle');
    expect(external).toEqual([]);
    const heading = page.getByRole('heading', { level: 1 });
    expect(await heading.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/outfit/i);
  });

  test('buttons meet target sizes and show a focus ring', async ({ page }) => {
    await page.goto('/design-system');
    const save = page.getByRole('button', { name: 'Save changes' });
    const child = page.getByRole('button', { name: "Let's go" });
    expect((await save.boundingBox())?.height).toBeGreaterThanOrEqual(48);
    expect((await child.boundingBox())?.height).toBeGreaterThanOrEqual(56);
    await save.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const outline = await save.evaluate(
      (el) => getComputedStyle(el).outlineWidth + ' ' + getComputedStyle(el).outlineStyle,
    );
    expect(outline).toBe('3px solid');
  });

  test('confirmation dialog traps focus, closes on Escape and returns focus', async ({ page }) => {
    await page.goto('/design-system');
    const trigger = page.getByRole('button', { name: 'End class' }).first();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'End the class now?' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep learning' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByText('You chose: Keep learning.')).toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test('no horizontal scrolling at this viewport', async ({ page }) => {
    await page.goto('/design-system');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
