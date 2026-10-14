import { readFileSync } from 'node:fs';
import { generate, parseFrontMatter } from '../../scripts/generate-tokens.mjs';

const css: string = generate();
const color = (name: string): string => {
  const m = css.match(new RegExp(`--color-${name}: (#[0-9a-f]{6});`));
  if (!m?.[1]) throw new Error(`unknown colour token ${name}`);
  return m[1];
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('design tokens', () => {
  it('tokens.css is generated from DESIGN.md without drift', () => {
    expect(readFileSync('src/styles/tokens.css', 'utf8')).toBe(css);
  });

  it('keeps the approved primary and error values (Tokens board)', () => {
    const fm = parseFrontMatter(readFileSync('design-reference/stitch-selected/DESIGN.md', 'utf8')) as {
      colors: Record<string, string>;
    };
    expect(fm.colors.primary).toBe('#006194');
    expect(fm.colors.error).toBe('#ba1a1a');
    expect(color('outline')).toBe('#707881');
  });
});

// Every text/background pair used by the components (AX-01, NFR-09).
const TEXT_PAIRS: Array<[fg: string, bg: string, where: string]> = [
  ['on-primary', 'primary', 'primary button'],
  ['on-primary', 'primary-hover', 'primary button hover'],
  ['primary', 'white', 'links on cards'],
  ['primary', 'background', 'links on page'],
  ['on-surface', 'background', 'body text'],
  ['on-surface', 'white', 'card text'],
  ['on-surface-variant', 'white', 'hints on cards'],
  ['on-surface-variant', 'surface-container-low', 'hints on tinted panels'],
  ['on-surface-variant', 'surface-container', 'inactive button, neutral chip'],
  ['on-error-container', 'white', 'danger button'],
  ['on-error-container', 'error-container', 'error alerts and chips'],
  ['on-secondary-fixed-variant', 'secondary-fixed', 'AI Tutor chip'],
  ['on-primary-fixed-variant', 'primary-fixed', 'Teacher chip'],
  ['on-tertiary-fixed-variant', 'success-container', 'success chip'],
  ['on-success-container', 'success-container', 'success message'],
  ['on-secondary-fixed-variant', 'warning-container', 'warning chip'],
  ['on-warning-container', 'warning-container', 'pending notes, offline banner'],
  ['on-primary-panel', 'primary', 'text on primary panels'],
  ['on-surface', 'surface-container-high', 'IT subject tile'],
];

// Non-text UI parts need 3:1 (WCAG 1.4.11).
const UI_PAIRS: Array<[fg: string, bg: string, where: string]> = [
  ['outline', 'white', 'input and secondary-button borders (DV-02)'],
  ['primary', 'white', 'focus ring on white (DV-01)'],
  ['primary', 'background', 'focus ring on page'],
  ['error', 'white', 'error field border'],
];

describe('colour contrast', () => {
  it.each(TEXT_PAIRS)('%s on %s (%s) is at least 4.5:1', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(UI_PAIRS)('%s on %s (%s) is at least 3:1', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(3);
  });
  it('rejects the old outline-variant border (1.71:1)', () => {
    expect(contrast(color('outline-variant'), color('white'))).toBeLessThan(3);
  });
});
