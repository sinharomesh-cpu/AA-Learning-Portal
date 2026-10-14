import axe from 'axe-core';

/**
 * Runs axe-core on a rendered container in jsdom. Colour contrast cannot be computed
 * in jsdom, so it is checked separately (tests/unit/contrast.test.ts) and in Playwright.
 */
export async function axeViolations(container: Element) {
  const result = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.help}`);
}
