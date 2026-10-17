import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  confirmFromMailbox,
  createAccount,
  freshEmail,
  linkFromMailbox,
  PHRASE,
  sendTeacherProfile,
  signIn,
} from './helpers';

/** WP2-3: real adult accounts end to end (boards 62, M-01, M-03, M-21, M-34). */

// Each test acts from its own made-up client address, so the per-address request limit
// (10 sign-ups an hour) applies per test, as it would per real visitor.
test.beforeEach(async ({ context }) => {
  const n = () => Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` });
});

async function noSeriousA11yIssues(page: Page) {
  // Next.js may stream the <title> in after first paint; wait for it before scanning.
  await expect(page).toHaveTitle(/\S/);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
}

test('a parent signs up, confirms the email, signs in and out', async ({ page }) => {
  const email = freshEmail('parent');
  await page.goto('/create-account');
  await noSeriousA11yIssues(page);
  await createAccount(page, 'parent', email);
  await expect(page.getByText(/We sent a link to/)).toContainText('•••@example.com');

  // Before confirming, sign-in asks for confirmation (and offers a new link).
  await signIn(page, email);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(/Please confirm your email first/);
  await expect(page.getByRole('button', { name: 'Send a new confirmation link' })).toBeVisible();

  await confirmFromMailbox(page, email);
  await expect(page.getByText('Your email is confirmed. Sign in to add your first child.')).toBeVisible();
  await signIn(page, email);
  await expect(page).toHaveURL(/\/parent$/);

  await page.goto('/student');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');

  await page.goto('/parent');
  await page.getByRole('button', { name: "Test Parent's account menu" }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto('/parent');
  await expect(page).toHaveURL(/\/sign-in/);
});

test('sign-up answers the same for an email that already has an account', async ({ page }) => {
  const email = freshEmail('dup');
  await createAccount(page, 'parent', email);
  await createAccount(page, 'teacher', email);
  expect(await linkFromMailbox(page, email, 'account_exists', 'signInUrl')).toBe('/sign-in');
});

test('weak passwords and missing consent are refused with clear messages', async ({ page }) => {
  await page.goto('/create-account');
  await page.getByLabel('Your name').fill('Someone');
  await page.getByLabel('Email').fill(freshEmail('weak'));
  await page.getByLabel('Password').fill(['password', '1234'].join(''));
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Please agree to the privacy notice and terms.')).toBeVisible();
  await page.getByRole('checkbox', { name: /privacy notice/ }).check();
  await page.getByLabel('Password').fill(['password', '1234'].join(''));
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/too common or has appeared in a data leak/)).toBeVisible();
});

test('wrong details never say whether the account exists; 5 failures lock the email', async ({ page }) => {
  const email = freshEmail('lock');
  await createAccount(page, 'parent', email);
  await confirmFromMailbox(page, email);
  const wrong = ['not', 'the right', 'phrase'].join(' ');
  await signIn(page, freshEmail('nobody'), wrong);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    "That email and password don't match an account. Check them and try again.",
  );
  for (let i = 0; i < 4; i += 1) {
    await signIn(page, email, wrong);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(/don't match an account/);
  }
  await signIn(page, email, wrong);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(/Too many sign-in attempts/);
  await signIn(page, email, PHRASE);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(/Too many sign-in attempts/);
});

test('forgot password: same answer for everyone, reset link works once', async ({ page }) => {
  const email = freshEmail('reset');
  await createAccount(page, 'parent', email);
  await confirmFromMailbox(page, email);
  await page.goto('/forgot-password');
  await noSeriousA11yIssues(page);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toHaveText(/If that email has an AA Pro account/);

  const resetPath = await linkFromMailbox(page, email, 'password_reset');
  await page.goto(resetPath);
  const fresh = ['a new', 'family phrase', 'today'].join(' ');
  await page.getByLabel('New password').fill(fresh);
  await page.getByLabel('Type it again').fill(fresh);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Your password is changed. Sign in with your new password.')).toBeVisible();
  await signIn(page, email, fresh);
  await expect(page).toHaveURL(/\/parent$/);

  await page.goto(resetPath);
  await expect(page.getByText('This link was already used or is not valid.')).toBeVisible();
});

test('a self-registered teacher waits for approval and sees only the status page (OC-38)', async ({ page }) => {
  const email = freshEmail('teacher');
  await createAccount(page, 'teacher', email);
  await confirmFromMailbox(page, email);
  await expect(page.getByText('Your email is confirmed. Sign in to tell us about your teaching.')).toBeVisible();
  await signIn(page, email);
  await expect(page).toHaveURL(/\/teacher\/status$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome! Tell us about your teaching' })).toBeVisible();
  for (const path of ['/teacher', '/teacher/schedule', '/teacher/students/anyone', '/parent']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/teacher\/status$/);
  }
  await noSeriousA11yIssues(page);
});

test('a waiting teacher fills in the profile, saves a draft and sends it for approval (M-20)', async ({ page }) => {
  const email = freshEmail('profile');
  await createAccount(page, 'teacher', email);
  await confirmFromMailbox(page, email);
  await signIn(page, email);
  await page.getByRole('link', { name: 'Set up my profile' }).click();
  await expect(page).toHaveURL(/\/teacher\/profile$/);
  await expect(page.getByText(email)).toBeVisible();
  await noSeriousA11yIssues(page);

  // Sending an empty profile explains what is missing.
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.getByText('Choose at least one subject.')).toBeVisible();
  await expect(page.getByText('Choose at least one grade.')).toBeVisible();
  await expect(page.getByText('Please agree to the teacher terms to send your profile.')).toBeVisible();

  // A draft keeps what was ticked.
  await page.getByRole('checkbox', { name: 'Science', exact: true }).check();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved. Send it for approval when you are ready.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Science', exact: true })).toBeChecked();

  // PR-D1a: curricula and experience are optional, the teacher's own statement (K-6).
  await page.getByLabel('Years of teaching experience (optional)').fill('70');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Enter whole years from 0 to 60, or leave it empty.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'CBSE', exact: true }).check();
  await page.getByLabel('Years of teaching experience (optional)').fill('8');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved. Send it for approval when you are ready.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'CBSE', exact: true })).toBeChecked();
  await expect(page.getByLabel('Years of teaching experience (optional)')).toHaveValue('8');

  // The draft terms are labelled as a draft.
  const terms = await page.context().newPage();
  await terms.goto('/teacher-terms');
  await expect(terms.getByText(/DRAFT for owner review/)).toBeVisible();
  await noSeriousA11yIssues(terms);
  await terms.close();

  await sendTeacherProfile(page, [], [4, 5]);
  await expect(page.getByRole('heading', { level: 1, name: "We're reviewing your profile" })).toBeVisible();
  await expect(page.getByText('Your profile was sent for approval.')).toBeVisible();
  await noSeriousA11yIssues(page);
  await page.getByRole('link', { name: 'View my profile' }).click();
  await expect(page).toHaveURL(/\/teacher\/profile$/);
  await expect(page.getByRole('heading', { level: 1 }).getByText('Under review')).toBeVisible();
  // Still no portal pages before approval.
  await page.goto('/teacher/schedule');
  await expect(page).toHaveURL(/\/teacher\/status$/);
});

test('changing the password signs out everywhere', async ({ page, browser }) => {
  const email = freshEmail('change');
  await createAccount(page, 'parent', email);
  await confirmFromMailbox(page, email);
  await signIn(page, email);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, email);
  await expect(otherPage).toHaveURL(/\/parent$/);

  await page.goto('/parent/settings');
  await noSeriousA11yIssues(page);
  const next = ['another', 'long family', 'phrase'].join(' ');
  await page.getByLabel('Current password').fill(PHRASE);
  await page.getByLabel('New password').fill(next);
  await page.getByLabel('Type it again').fill(next);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText(/Your password is changed. You were signed out everywhere/)).toBeVisible();

  await otherPage.goto('/parent');
  await expect(otherPage).toHaveURL(/\/sign-in/);
  await other.close();
});

test('the parent/teacher choice on sign-in only guides; the account decides the portal (OC-59)', async ({ page }) => {
  const email = freshEmail('choice');
  await createAccount(page, 'parent', email);
  await confirmFromMailbox(page, email);
  await page.goto('/sign-in');
  await expect(page.getByRole('radio', { name: 'A parent' })).toBeChecked();
  await page.getByRole('radio', { name: 'A teacher' }).check();
  await expect(page.getByText(/You'll go to your teaching home/)).toBeVisible();
  await noSeriousA11yIssues(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PHRASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/parent$/);
});
