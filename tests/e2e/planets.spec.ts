import { expect, test, type Page } from '@playwright/test';

/**
 * OC-83: the hero planets really move along their orbits (not a still picture or a CSS swap),
 * labels travel with them, reduced motion gets a still frame, and the page stays smooth.
 */

async function labelPositions(page: Page) {
  return page.$$eval('[data-planet-label]', (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const box = el.parentElement!.getBoundingClientRect();
      return { id: (el as HTMLElement).dataset.planetLabel, x: r.x - box.x, y: r.y - box.y };
    }),
  );
}

test('the six subject planets move along their orbits and their labels follow', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('[data-planets]');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-planets', 'moving');
  const before = await labelPositions(page);
  expect(before.map((p) => p.id).sort()).toEqual(['english', 'hindi', 'it', 'maths', 'science', 'sst']);
  await page.waitForTimeout(2500);
  const after = await labelPositions(page);
  const moved = after.filter((p, i) => Math.hypot(p.x - before[i]!.x, p.y - before[i]!.y) > 2);
  // Labels clamped at the scene edge may pause briefly; most must have moved.
  expect(moved.length).toBeGreaterThanOrEqual(4);

  // The canvas is painting something (not an empty layer).
  const painted = await page.$$eval('[data-planets] canvas', (cs) =>
    cs.some((c) => {
      const ctx = (c as HTMLCanvasElement).getContext('2d')!;
      const d = ctx.getImageData(0, 0, (c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height).data;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i]! > 0) return true;
      return false;
    }),
  );
  expect(painted).toBe(true);

  // Smoothness: median frame time stays near the display rate.
  const median = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const gaps: number[] = [];
        let last = 0;
        const step = (t: number) => {
          if (last) gaps.push(t - last);
          last = t;
          if (gaps.length < 60) requestAnimationFrame(step);
          else resolve(gaps.sort((a, b) => a - b)[30]!);
        };
        requestAnimationFrame(step);
      }),
  );
  expect(median).toBeLessThan(40);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('reduced motion shows one still frame of the planets', async ({ page }) => {
    await page.goto('/');
    const scene = page.locator('[data-planets]');
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute('data-planets', 'still');
    const before = await labelPositions(page);
    await page.waitForTimeout(1500);
    expect(await labelPositions(page)).toEqual(before);
  });
});
