import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { generate } from 'otplib';
import { linkFromMailbox } from './helpers';

/** WP2-5a: owner set-up, security-code sign-in and recovery codes (OC-50, M-26, board 66). */

// There is only one Super Admin per database, so this runs once (desktop) and in order.
test.describe.configure({ mode: 'serial' });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'One Super Admin per test database');
});

const OWNER = 'owner@example.com';
const PHRASE = ['owner', 'keeps', 'the', 'keys'].join(' ');
const codeIn = (secret: string, seconds = 0) => generate({ secret, epoch: Math.floor(Date.now() / 1000) + seconds });

async function noSeriousA11yIssues(page: Page) {
  await expect(page).toHaveTitle(/\S/);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
}

async function passwordStep(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(OWNER);
  await page.getByLabel('Password').fill(PHRASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/verify$/);
}

let secret = '';
let recovery: string[] = [];

test('the owner sets up the Super Admin with a password and an authenticator app', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.1' });
  await page.goto('/setup');
  await noSeriousA11yIssues(page);
  await page.getByLabel('Your name').fill('Test Owner');
  await page.getByLabel("Owner's email").fill(OWNER);
  await page.getByRole('button', { name: 'Send set-up link' }).click();
  await expect(page.getByText(/we've sent a link to set your password/)).toBeVisible();

  await page.goto(await linkFromMailbox(page, OWNER, 'owner_set_password'));
  await page.getByLabel('New password').fill(PHRASE);
  await page.getByLabel('Type it again').fill(PHRASE);
  await page.getByRole('button', { name: 'Save password and continue' }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  // Set-up is closed from now on.
  const closed = await page.goto('/setup');
  expect(closed?.status()).toBe(404);

  await passwordStep(page);
  // No admin page opens before the security code is set up.
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/verify$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Set up your security code' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
  await noSeriousA11yIssues(page);
  secret = (await page.getByTestId('mfa-secret').innerText()).replace(/\s/g, '');

  await page.getByLabel('Security code').fill('000000');
  await page.getByRole('button', { name: 'Turn on security codes' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText("That code didn't work");
  await page.getByLabel('Security code').fill(await codeIn(secret));
  await page.getByRole('button', { name: 'Turn on security codes' }).click();
  await expect(page.getByTestId('recovery-codes')).toBeVisible();
  recovery = await page.getByTestId('recovery-code').allInnerTexts();
  expect(recovery).toHaveLength(10);
  await page.getByRole('link', { name: "I've saved them" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
});

test('next time, the Super Admin needs the password and a fresh code', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.2' });
  await passwordStep(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Confirm it’s you' })).toBeVisible();
  await noSeriousA11yIssues(page);
  await page.getByLabel('Security code').fill('111111');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText("That code didn't work");
  // The next 30-second code (the current one was used at set-up).
  await page.getByLabel('Security code').fill(await codeIn(secret, 30));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/security');
  await expect(page.getByTestId('codes-left')).toHaveText('10');
});

test('a recovery code works once instead of the phone', async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.3' });
  await passwordStep(page);
  await page.getByRole('button', { name: 'Lost your phone? Use a recovery code' }).click();
  await page.getByLabel('Recovery code').fill(recovery[0]!);
  await page.getByRole('button', { name: 'Use recovery code' }).click();
  await expect(page).toHaveURL(/\/admin\/security\?recovered=9/);
  await expect(page.getByText(/You signed in with a recovery code. You have 9 left/)).toBeVisible();
  await noSeriousA11yIssues(page);
});
