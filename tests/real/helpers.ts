import { randomBytes } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';

export const PHRASE = ['our family', 'reads every', 'night'].join(' ');
export const freshEmail = (tag: string) => `${tag}-${randomBytes(4).toString('hex')}@example.com`;

/** Reads the newest outbox email of a template for an address from the dev mailbox. */
export async function linkFromMailbox(page: Page, to: string, template: string, key = 'link'): Promise<string> {
  await page.goto('/dev/mailbox');
  const mail = page
    .getByTestId('mail')
    .filter({ has: page.getByTestId('mail-to').getByText(to, { exact: true }) })
    .filter({ has: page.getByTestId('mail-template').getByText(template, { exact: true }) })
    .first();
  await expect(mail).toBeVisible();
  const href = await mail.getByTestId(`mail-${key}`).getAttribute('href');
  expect(href).toBeTruthy();
  return new URL(href!).pathname + new URL(href!).search;
}

export async function createAccount(page: Page, role: 'parent' | 'teacher', email: string, password = PHRASE) {
  await page.goto('/create-account');
  await page.getByRole('radio', { name: role === 'parent' ? /A parent/ : /A teacher/ }).check();
  await page.getByLabel('Your name').fill(role === 'parent' ? 'Test Parent' : 'Test Teacher');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('checkbox', { name: /privacy notice/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible();
}

export async function confirmFromMailbox(page: Page, email: string) {
  await page.goto(await linkFromMailbox(page, email, 'confirm_email'));
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  await expect(page).toHaveURL(/\/sign-in\?confirmed=/);
}

export async function signIn(page: Page, email: string, password = PHRASE) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** M-20: a waiting teacher completes their profile and sends it for approval. */
export async function sendTeacherProfile(page: Page, subjects = ['Science'], grades = [4, 5]) {
  await page.goto('/teacher/profile');
  await expect(page.getByRole('heading', { level: 1, name: /Set up your teacher profile/ })).toBeVisible();
  for (const s of subjects) await page.getByRole('checkbox', { name: s, exact: true }).check();
  for (const g of grades) await page.getByRole('checkbox', { name: `Grade ${g}`, exact: true }).check();
  await page.getByLabel('About you (short)').fill('I have taught primary classes for eight years.');
  const terms = page.getByRole('checkbox', { name: /teacher terms/ });
  if (await terms.isVisible()) await terms.check();
  await page.getByRole('button', { name: /Send (again )?for approval/ }).click();
  await expect(page).toHaveURL(/\/teacher\/status\?sent=1$/);
}

/**
 * OC-110: drop-downs are homepage-style pills (a button that opens a small list). Opens the one
 * labelled `label` inside `scope` and picks `option`.
 */
/**
 * AV0 (availability calendar): adds one time to the chosen days with "Add times" (day chips and
 * the From / To slider, in minutes after midnight).
 */
export async function addTimes(scope: Locator, days: string[], from: number, to: number) {
  const panel = scope.getByRole('region', { name: /^Add times/ });
  for (const d of days) {
    await panel.getByRole('group', { name: 'Days' }).getByRole('button', { name: d, exact: true }).click();
  }
  await panel.getByRole('slider', { name: 'From' }).fill(String(from));
  await panel.getByRole('slider', { name: 'To' }).fill(String(to));
  await panel.getByRole('button', { name: /^Add to / }).click();
}

export async function choose(scope: Page | Locator, label: string, option: string) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await scope.getByRole('button', { name: new RegExp(`^${esc}: `) }).click();
  await scope
    .getByRole('group', { name: label, exact: true })
    .getByRole('button', { name: option, exact: true })
    .click();
}
