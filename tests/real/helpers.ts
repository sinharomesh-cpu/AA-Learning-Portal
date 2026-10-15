import { randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

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
