import { randomInt } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Request } from '@playwright/test';
import { signIn } from './helpers';
import { SEED_PHRASE } from './notificationSeed';

/** Helpers for the CR-16 N2 browser tests. */

export const ip = () => `10.${randomInt(150, 250)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;

export async function signInAs(page: Page, email: string) {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': ip() });
  await signIn(page, email, SEED_PHRASE);
  // The first sign-in on a fresh dev server compiles the role's home page; give it time.
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 });
}

export async function childSignIn(page: Page, username: string, password: string) {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': ip() });
  await page.goto('/sign-in/child');
  await page.getByLabel('Your username').fill(username);
  await page.getByLabel('Your password').fill(password);
  await page.getByRole('button', { name: "Let's go" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 });
}

export const bell = (page: Page) => page.getByTestId('notification-bell');
export const bellCount = (page: Page) => page.getByTestId('bell-count');
/** The open panel (desktop) or sheet (phone). */
export const panel = (page: Page) => page.locator('dialog[open]');
export const rows = (page: Page) => panel(page).getByTestId('notification-row');

export async function openBell(page: Page) {
  await bell(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Loading' })).toHaveCount(0);
}

/** Server Action requests (every notification request is one). */
export function actionRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.headers()['next-action']) seen.push(r);
  });
  return seen;
}

/** Collects the bodies of every Server Action response, to search them for leaked data. */
export function actionResponses(page: Page): Promise<string>[] {
  const bodies: Promise<string>[] = [];
  page.on('response', (r) => {
    if (r.request().method() === 'POST' && r.request().headers()['next-action']) bodies.push(r.text().catch(() => ''));
  });
  return bodies;
}

const isAction = (r: Request) => r.method() === 'POST' && !!r.headers()['next-action'];

/**
 * Advances the frozen browser clock by `ms` and waits for the bell refresh that this fires
 * (every notification request is a Server Action). Returns the real time when its response
 * arrived. Fails if no refresh request is made.
 */
export async function runToRefresh(page: Page, ms: number): Promise<number> {
  const done = page.waitForResponse((r) => isAction(r.request()), { timeout: 15_000 });
  await page.clock.runFor(ms);
  await done;
  return Date.now();
}

/** Hidden, then visible again: one bell refresh at once, and the 60-second timer restarts from now (§7.2). */
export async function refreshOnReturn(page: Page): Promise<number> {
  const done = page.waitForResponse((r) => isAction(r.request()), { timeout: 15_000 });
  await setHidden(page, true);
  await setHidden(page, false);
  await done;
  return Date.now();
}

/**
 * An approved (seeded) teacher publishes their listing on /teacher/listing (board D5), Maths only
 * so it does not appear in other tests' Science searches. The listing runs for 60 days.
 */
export async function publishListing(page: Page) {
  await page.goto('/teacher/listing');
  await expect(page.getByRole('heading', { level: 1, name: 'Looking for students' })).toBeVisible({
    timeout: 30_000,
  });
  const offer = page.getByRole('region', { name: 'What you offer' });
  const science = offer.getByRole('checkbox', { name: 'Science', exact: true });
  if (await science.isChecked()) await science.uncheck();
  await page.getByRole('checkbox', { name: /I agree to AA Pro showing these details publicly/ }).check();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/Published. Parents can see your listing/)).toBeVisible();
}

export async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

export async function noSeriousA11yIssues(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']);
  if (include) builder = builder.include(include);
  const r = await builder.analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
