import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, test, type Page } from '@playwright/test';
import { generate } from 'otplib';
import sharp from 'sharp';
import {
  confirmFromMailbox,
  createAccount,
  freshEmail,
  linkFromMailbox,
  PHRASE as ADULT_PHRASE,
  sendTeacherProfile,
  signIn,
} from './helpers';

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
  await expect(page).toHaveURL(/\/security-check$/);
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
  await expect(page).toHaveURL(/\/security-check$/);
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

// Later sign-ins use the remaining recovery codes, so no security code is ever reused. Once
// they run out, later tests reuse the last verified owner session (its cookies), as a browser would.
let nextRecovery = 1;
let ownerCookies: Awaited<ReturnType<ReturnType<Page['context']>['cookies']>> | null = null;
async function ownerSignedIn(page: Page) {
  if (nextRecovery >= recovery.length - 1 && ownerCookies) {
    await page.context().addCookies(ownerCookies);
    await page.goto('/admin/security');
    await expect(page).toHaveURL(/\/admin\/security/);
    return;
  }
  await passwordStep(page);
  await page.getByRole('button', { name: 'Lost your phone? Use a recovery code' }).click();
  await page.getByLabel('Recovery code').fill(recovery[nextRecovery++]!);
  await page.getByRole('button', { name: 'Use recovery code' }).click();
  await expect(page).toHaveURL(/\/admin\/security/);
  ownerCookies = await page.context().cookies();
}

const ADMIN = 'helper.admin@example.com';
const ADMIN_PHRASE = ['admins', 'read', 'the', 'log'].join(' ');

test('the Super Admin adds an Admin who can only read the audit log', async ({ page, browser }) => {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.4' });
  await ownerSignedIn(page);
  await page.goto('/admin/admins');
  await noSeriousA11yIssues(page);
  await page.getByLabel('Name').fill('Helper Admin');
  await page.getByLabel('Email').fill(ADMIN);
  await page.getByRole('checkbox', { name: /Audit log/ }).check();
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(/Invitation sent to/)).toBeVisible();
  await expect(page.getByText('Helper Admin')).toBeVisible();

  const other = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.5' } });
  const a = await other.newPage();
  await a.goto(await linkFromMailbox(a, ADMIN, 'admin_invite'));
  await a.getByLabel('New password').fill(ADMIN_PHRASE);
  await a.getByLabel('Type it again').fill(ADMIN_PHRASE);
  await a.getByRole('button', { name: 'Save password and continue' }).click();
  await expect(a).toHaveURL(/\/sign-in/);
  await a.getByLabel('Email').fill(ADMIN);
  await a.getByLabel('Password').fill(ADMIN_PHRASE);
  await a.getByRole('button', { name: 'Sign in' }).click();
  await expect(a).toHaveURL(/\/security-check$/);
  const adminSecret = (await a.getByTestId('mfa-secret').innerText()).replace(/\s/g, '');
  await a.getByLabel('Security code').fill(await codeIn(adminSecret));
  await a.getByRole('button', { name: 'Turn on security codes' }).click();
  await a.getByRole('link', { name: "I've saved them" }).click();
  await expect(a).toHaveURL(/\/admin$/);
  const menu = a.getByRole('navigation', { name: 'Admin menu', exact: true });
  await expect(menu.getByRole('link')).toHaveText(['Home', 'Audit log', 'Security']);
  await a.goto('/admin/accounts');
  await expect(a.getByRole('heading', { level: 1 })).toHaveText('Not available to you');
  await a.goto('/admin/admins');
  await expect(a.getByRole('heading', { level: 1 })).toHaveText('Not available to you');
  await a.goto('/admin/audit-log');
  await expect(a.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
  await expect(a.getByTestId('audit-row').filter({ hasText: 'Admin added' }).first()).toBeVisible();
  await noSeriousA11yIssues(a);
  await other.close();
});

test('the Super Admin approves a teacher and manages accounts', async ({ page, browser }) => {
  // A teacher registers themselves (board 62).
  const teacherContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.6' } });
  const t = await teacherContext.newPage();
  const teacherEmail = freshEmail('teach');
  await createAccount(t, 'teacher', teacherEmail);
  await confirmFromMailbox(t, teacherEmail);
  await signIn(t, teacherEmail, ADULT_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);

  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.7' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  await noSeriousA11yIssues(page);
  const card = page.getByRole('article').filter({ hasText: teacherEmail });
  // Not approvable until the teacher sends the profile (OC-38, OC-71).
  await expect(card.getByText('Waiting for the teacher to complete and send their profile.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Approve Test Teacher' })).toHaveCount(0);

  await sendTeacherProfile(t);
  await page.reload();
  await expect(card.getByText(/Sent for approval/)).toBeVisible();
  await card.getByLabel('Decision note (required)').fill('Checked the profile');
  await card.getByRole('button', { name: 'Approve Test Teacher' }).click();
  await expect(page.getByText(/Approved. The teacher was emailed/)).toBeVisible();

  await t.goto('/teacher');
  await expect(t).toHaveURL(/\/teacher$/);

  // M-22: after approval a subject change waits for review; the teacher keeps their access (OC-73).
  await t.goto('/teacher/profile');
  await expect(t.getByRole('heading', { level: 1, name: /Your teacher profile/ })).toBeVisible();
  await noSeriousA11yIssues(t);
  await t.getByRole('checkbox', { name: 'Maths', exact: true }).check();
  await t.getByRole('button', { name: 'Save changes' }).click();
  await expect(t.getByText(/Your new subjects or grades are waiting for review/)).toBeVisible();
  await t.goto('/teacher');
  await expect(t).toHaveURL(/\/teacher$/);

  await page.goto('/admin/approvals');
  const change = page.getByRole('article').filter({ hasText: teacherEmail });
  await expect(change.getByText('Maths, Science · Grades 4, 5')).toBeVisible();
  await change.getByLabel('Decision note (required)').fill('Maths confirmed');
  await change.getByRole('button', { name: 'Accept the change for Test Teacher' }).click();
  await expect(page.getByText(/Change accepted/)).toBeVisible();
  await t.goto('/teacher/profile');
  await expect(t.getByText(/Your subject and grade change was approved/)).toBeVisible();
  await expect(t.getByRole('checkbox', { name: 'Maths', exact: true })).toBeChecked();
  await teacherContext.close();

  // OC-72 (2): a rejected teacher sees only the status message.
  const rejectedContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.8' } });
  const r = await rejectedContext.newPage();
  const rejectedEmail = freshEmail('reject');
  await createAccount(r, 'teacher', rejectedEmail);
  await confirmFromMailbox(r, rejectedEmail);
  await signIn(r, rejectedEmail, ADULT_PHRASE);
  await expect(r).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(r);
  await page.goto('/admin/approvals');
  const rejectCard = page.getByRole('article').filter({ hasText: rejectedEmail });
  await rejectCard.getByLabel('Decision note (required)').fill('Could not verify');
  await rejectCard.getByRole('button', { name: 'Reject Test Teacher' }).click();
  await expect(page.getByText(/Not approved. The decision/)).toBeVisible();
  for (const path of ['/teacher/status', '/teacher/profile', '/teacher', '/teacher/schedule']) {
    await r.goto(path);
    await expect(r).toHaveURL(/\/teacher\/status$/);
    await expect(r.getByRole('heading', { level: 1, name: 'Your profile was not approved' })).toBeVisible();
  }
  await expect(r.getByRole('link', { name: 'Profile' })).toHaveCount(0);
  await noSeriousA11yIssues(r);
  await rejectedContext.close();

  // Accounts: find the teacher, deactivate with a reason, then reactivate.
  await page.goto(`/admin/accounts?q=${encodeURIComponent(teacherEmail)}`);
  await noSeriousA11yIssues(page);
  await page.getByRole('link', { name: 'Edit Test Teacher' }).first().click();
  await page.getByRole('button', { name: 'Deactivate account' }).click();
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(page.getByText('Write the reason (required).')).toBeVisible();
  await page.getByLabel('Reason (required)').fill('Test of deactivation');
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(page.getByText(/Account deactivated/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Reactivate account' }).click();
  await expect(page.getByText('Account reactivated.')).toBeVisible();

  // Create a parent account; the person gets a set-password email.
  const parentEmail = freshEmail('made');
  await page.goto('/admin/accounts/new');
  await page.getByLabel('Name').fill('Made Parent');
  await page.getByLabel('Email').fill(parentEmail);
  await page.getByRole('button', { name: 'Create and send email' }).click();
  await expect(page.getByText(/Account created/)).toBeVisible();
  expect(await linkFromMailbox(page, parentEmail, 'account_created_set_password')).toMatch(/purpose=set_password/);
});

test('deactivating a parent signs out their child until the parent is reactivated (OC-72)', async ({
  page,
  browser,
}) => {
  // A parent adds a child (M-06, M-08).
  const parentContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.9' } });
  const p = await parentContext.newPage();
  const parentEmail = freshEmail('family');
  await createAccount(p, 'parent', parentEmail);
  await confirmFromMailbox(p, parentEmail);
  await signIn(p, parentEmail, ADULT_PHRASE);
  await expect(p).toHaveURL(/\/parent$/);
  await p.goto('/parent/children/new');
  await p.getByRole('checkbox', { name: /parent or legal guardian/ }).check();
  await p.getByRole('checkbox', { name: /AI lessons/ }).check();
  await p.getByRole('button', { name: 'Agree and continue' }).click();
  await p.getByLabel('First name (shown in the app)').fill('Asha');
  await p.getByRole('checkbox', { name: 'Maths' }).check();
  await p.getByLabel('Username').fill('Asha');
  await p.getByRole('button', { name: 'Add child' }).click();
  const creds = p.getByTestId('child-credentials');
  await expect(creds).toBeVisible();
  const username = (await creds.getByTestId('child-username').innerText()).trim();
  const password = (await creds.getByTestId('child-password').innerText()).trim();
  await parentContext.close();

  const childContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.10' } });
  const c = await childContext.newPage();
  const childSignIn = async () => {
    await c.goto('/sign-in/child');
    await c.getByLabel('Your username').fill(username);
    await c.getByLabel('Your password').fill(password);
    await c.getByRole('button', { name: "Let's go" }).click();
  };
  await childSignIn();
  await expect(c).toHaveURL(/\/student$/);

  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.11' });
  await ownerSignedIn(page);
  await page.goto(`/admin/accounts?q=${encodeURIComponent(parentEmail)}`);
  await page.getByRole('link', { name: 'Edit Test Parent' }).first().click();
  await page.getByRole('button', { name: 'Deactivate account' }).click();
  await page.getByLabel('Reason (required)').fill('Test of OC-72');
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(page.getByText(/Account deactivated/)).toBeVisible();

  // The child's open session ends and a new sign-in is refused.
  await c.goto('/student');
  await expect(c).toHaveURL(/\/sign-in/);
  await childSignIn();
  await expect(c.getByText('Your account is paused. Please ask your parent.')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Reactivate account' }).click();
  await expect(page.getByText('Account reactivated.')).toBeVisible();
  await childSignIn();
  await expect(c).toHaveURL(/\/student$/);
  await childContext.close();
});

/** A signed-in parent (own browser) with one child studying the given subjects. */
async function parentWithChild(browser: Browser, ip: string, child: string, subjects: string[]) {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ip } });
  const p = await context.newPage();
  const address = freshEmail('fam');
  await createAccount(p, 'parent', address);
  await confirmFromMailbox(p, address);
  await signIn(p, address, ADULT_PHRASE);
  await expect(p).toHaveURL(/\/parent$/);
  await p.goto('/parent/children/new');
  await p.getByRole('checkbox', { name: /parent or legal guardian/ }).check();
  await p.getByRole('checkbox', { name: /AI lessons/ }).check();
  await p.getByRole('button', { name: 'Agree and continue' }).click();
  await p.getByLabel('First name (shown in the app)').fill(child);
  for (const s of subjects) await p.getByRole('checkbox', { name: s, exact: true }).check();
  await p.getByLabel('Username').fill(child);
  await p.getByRole('button', { name: 'Add child' }).click();
  await expect(p.getByTestId('child-credentials')).toBeVisible();
  return { context, page: p };
}

test('a parent adds a new teacher; after approval the teacher sees only the ticked child and subjects (OC-36, OC-41)', async ({
  page,
  browser,
}) => {
  const fam = await parentWithChild(browser, '10.200.0.12', 'Asha', ['Maths', 'English']);
  const p = fam.page;
  await p.getByRole('navigation', { name: 'Parent menu' }).getByRole('link', { name: 'Teachers' }).click();
  await expect(p.getByRole('heading', { level: 1, name: 'My teachers' })).toBeVisible();
  await expect(p.getByText("You haven't added any teachers yet.")).toBeVisible();
  await noSeriousA11yIssues(p);

  await p.getByRole('link', { name: 'Add a teacher' }).first().click();
  await noSeriousA11yIssues(p);
  const teacherEmail = freshEmail('linked');
  await p.getByLabel("Teacher's name").fill('Teacher H. Kapoor');
  await p.getByLabel("Teacher's email").fill(teacherEmail);
  // Nothing ticked: a clear message.
  await p.getByRole('button', { name: 'Add teacher' }).click();
  await expect(p.getByText('Tick at least one child and one subject.')).toBeVisible();
  await p.getByRole('group', { name: 'Subjects for Asha' }).getByRole('checkbox', { name: 'Maths' }).check();
  await p.getByRole('button', { name: 'Add teacher' }).click();
  await expect(p.getByText(/Request sent. Teacher H. Kapoor is waiting for AA Pro approval/)).toBeVisible();
  await expect(p.getByText('Waiting for AA Pro approval', { exact: true })).toBeVisible();

  // OC-75: the teacher sets a password from the email, completes the profile and sends it.
  const tc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.14' } });
  const t = await tc.newPage();
  const TEACHER_PHRASE = ['kapoor', 'teaches', 'maths', 'well'].join(' ');
  await t.goto(await linkFromMailbox(t, teacherEmail, 'teacher_added_by_parent'));
  await t.getByLabel('New password').fill(TEACHER_PHRASE);
  await t.getByLabel('Type it again').fill(TEACHER_PHRASE);
  await t.getByRole('button', { name: 'Save password and continue' }).click();
  await expect(t).toHaveURL(/\/sign-in/);
  await signIn(t, teacherEmail, TEACHER_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(t, ['Maths', 'English'], [5]);

  // The Super Admin approves once the profile is sent.
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.13' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  const card = page.getByRole('article').filter({ hasText: teacherEmail });
  await card.getByLabel('Decision note (required)').fill('Added by a parent; checked');
  await card.getByRole('button', { name: 'Approve Teacher H. Kapoor' }).click();
  await expect(page.getByText(/Approved. The teacher was emailed/)).toBeVisible();

  // The teacher sees Asha for Maths only.
  await t.goto('/teacher/students');
  await expect(t.getByText('Grade 5 · Subjects with you: Maths')).toBeVisible();
  await noSeriousA11yIssues(t);
  await t.getByRole('link', { name: 'Open Asha' }).click();
  await expect(t.getByRole('heading', { level: 1, name: 'Asha' })).toBeVisible();
  const studentUrl = t.url();

  // The parent changes the subject: the teacher sees the change at once.
  await p.goto('/parent/teachers');
  await expect(p.getByText('Active', { exact: true })).toBeVisible();
  await p.getByRole('link', { name: 'Change children and subjects' }).click();
  const subjects = p.getByRole('group', { name: 'Subjects for Asha' });
  await subjects.getByRole('checkbox', { name: 'Maths' }).uncheck();
  await subjects.getByRole('checkbox', { name: 'English' }).check();
  await p.getByRole('button', { name: 'Save changes' }).click();
  await expect(p.getByText(/Saved. The teacher sees only the children and subjects you ticked/)).toBeVisible();
  await t.reload();
  await expect(t.getByText('Grade 5 · Subjects with you: English')).toBeVisible();

  // Another family cannot open this teacher's page; the teacher cannot open other children.
  const other = await parentWithChild(browser, '10.200.0.15', 'Ravi', ['Maths']);
  const teacherId = new URL(p.url()).pathname.split('/').pop() ?? '';
  await other.page.goto(`/parent/teachers`);
  await expect(other.page.getByText("You haven't added any teachers yet.")).toBeVisible();
  await other.context.close();
  await t.goto('/teacher/students/00000000-0000-4000-8000-000000000000');
  await expect(t.getByRole('heading', { level: 1 })).toHaveText("You can't open this");
  expect(teacherId).not.toBe('');

  // Removing the teacher ends access straight away.
  await p.goto('/parent/teachers');
  await p.getByRole('button', { name: 'Remove teacher' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(p.getByText(/Removed. The teacher no longer sees those children/)).toBeVisible();
  await t.goto(studentUrl);
  await expect(t.getByRole('heading', { level: 1 })).toHaveText("You can't open this");
  await t.goto('/teacher/students');
  await expect(t.getByText('When a parent adds you as their child')).toBeVisible();
  await tc.close();
  await fam.context.close();
});

test('board 65: a parent finds an approved teacher and adds them; hidden teachers are not listed (OC-54, C-1)', async ({
  page,
  browser,
}) => {
  // An approved teacher for Maths and Science, Grades 4–5, with a name only this test uses.
  const letters = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghijklmnop'[b % 16]).join('');
  const teacherName = `Teacher Dir ${letters.charAt(0).toUpperCase()}${letters.slice(1)}`;
  const tc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.20' } });
  const t = await tc.newPage();
  const teacherEmail = freshEmail('dir');
  await createAccount(t, 'teacher', teacherEmail);
  await confirmFromMailbox(t, teacherEmail);
  await signIn(t, teacherEmail, ADULT_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(t, ['Maths', 'Science'], [4, 5]);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.21' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  const card = page.getByRole('article').filter({ hasText: teacherEmail });
  await card.getByLabel('Decision note (required)').fill('Checked for the directory');
  await card.getByRole('button', { name: 'Approve Test Teacher' }).click();
  await expect(page.getByText(/Approved. The teacher was emailed/)).toBeVisible();
  await t.goto('/teacher/profile');
  await t.getByLabel('Name shown to families').fill(teacherName);
  await t.getByRole('button', { name: 'Save changes' }).click();
  await expect(t.getByText('Your profile is saved.')).toBeVisible();

  // OC-54: the teacher hides from search.
  await expect(t.getByRole('heading', { name: 'Find a teacher' })).toBeVisible();
  await t.getByRole('button', { name: 'Hide me from search' }).click();
  await expect(t.getByText(/Hidden. Parents can no longer find you/)).toBeVisible();
  await noSeriousA11yIssues(t);

  const fam = await parentWithChild(browser, '10.200.0.22', 'Isha', ['Maths', 'English']);
  const p = fam.page;
  await p.goto('/parent/teachers');
  await p.getByRole('link', { name: 'Find a teacher' }).click();
  await expect(p.getByRole('heading', { level: 1, name: 'Find a teacher' })).toBeVisible();
  await noSeriousA11yIssues(p);
  const search = p.getByRole('search', { name: 'Search teachers' });
  await search.getByLabel('Name (optional)').fill(teacherName);
  await search.getByRole('button', { name: 'Show teachers' }).click();
  await expect(p.getByRole('heading', { name: 'No results' })).toBeVisible();

  // Visible again: listed with the OC-54 fields only.
  await t.getByRole('button', { name: 'Show me in search' }).click();
  await expect(t.getByText(/You are visible again/)).toBeVisible();
  await search.getByLabel('Subject').selectOption({ label: 'Maths' });
  await search.getByLabel('Grade').selectOption({ label: 'Grade 5' });
  await search.getByRole('button', { name: 'Show teachers' }).click();
  await expect(p).toHaveURL(/subject=maths&grade=5/);
  const result = p.getByRole('article').filter({ has: p.getByRole('heading', { name: teacherName }) });
  await expect(result.getByText('Grades 4–5 · Asia/Kolkata')).toBeVisible();
  await expect(result.getByText('I have taught primary classes for eight years.')).toBeVisible();
  await expect(result.getByRole('button', { name: 'See available times' })).toHaveCount(0);
  expect(await p.content()).not.toContain(teacherEmail);
  await noSeriousA11yIssues(p);

  // Phone width: no sideways scrolling.
  await p.setViewportSize({ width: 390, height: 844 });
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await p.setViewportSize({ width: 1280, height: 900 });

  // "Add as my teacher" (C-1 option (a)): only subjects both have; the link starts at once.
  await result.getByRole('link', { name: 'Add as my teacher' }).click();
  await expect(p.getByRole('heading', { level: 1, name: `Add ${teacherName}` })).toBeVisible();
  await noSeriousA11yIssues(p);
  expect(await p.content()).not.toContain(teacherEmail);
  const subjects = p.getByRole('group', { name: 'Subjects for Isha' });
  await expect(subjects.getByRole('checkbox', { name: 'English' })).toHaveCount(0);
  await expect(subjects.getByRole('checkbox', { name: 'Science' })).toHaveCount(0);
  await subjects.getByRole('checkbox', { name: 'Maths' }).check();
  await p.getByRole('button', { name: 'Add teacher' }).click();
  await expect(
    p.getByText(`${teacherName} can now see the children and subjects you ticked. We've emailed them.`),
  ).toBeVisible();
  // Queued only (shown in the development mailbox); nothing is sent for real.
  await p.goto('/dev/mailbox');
  await expect(
    p
      .getByTestId('mail')
      .filter({ has: p.getByTestId('mail-to').getByText(teacherEmail, { exact: true }) })
      .filter({ has: p.getByTestId('mail-template').getByText('teacher_linked_to_child', { exact: true }) }),
  ).toHaveCount(1);

  await t.goto('/teacher/students');
  await expect(t.getByText('Grade 5 · Subjects with you: Maths')).toBeVisible();

  // Listed again as already this family's teacher.
  await p.goto(`/parent/teachers/find?name=${encodeURIComponent(teacherName)}`);
  await expect(p.getByRole('link', { name: 'Already your teacher · Change children' })).toBeVisible();

  // Unknown or unlisted teachers can't be opened directly.
  const missing = await p.goto('/parent/teachers/find/00000000-0000-4000-8000-000000000000');
  expect(missing?.status()).toBe(404);
  // A teacher cannot use the parent directory.
  await t.goto('/parent/teachers/find');
  await expect(t.getByRole('heading', { level: 1 })).toHaveText("You can't open this");

  await tc.close();
  await fam.context.close();
});

test('PR-D1b: a teacher sends a photo; only the teacher and the AA Pro team can see it until approved (OC-85)', async ({
  page,
  browser,
}) => {
  const tc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.30' } });
  const t = await tc.newPage();
  const teacherEmail = freshEmail('photo');
  await createAccount(t, 'teacher', teacherEmail);
  await confirmFromMailbox(t, teacherEmail);
  await signIn(t, teacherEmail, ADULT_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(t, ['Maths'], [5]);

  // A synthetic picture (a plain coloured square), made here; no real person.
  const picture = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#2a8fa6' } })
    .jpeg()
    .toBuffer();
  await t.goto('/teacher/profile');
  const card = t.getByRole('region', { name: 'Profile photo (optional)' });
  await expect(card.getByText('No photo. Families see your initial.')).toBeVisible();
  await card.getByLabel('Choose a photo (JPG, PNG or WebP)').setInputFiles({
    name: 'me.jpg',
    mimeType: 'image/jpeg',
    buffer: picture,
  });
  await card.getByRole('button', { name: 'Send photo for review' }).click();
  await expect(card.getByText(/Photo sent. The AA Pro team checks it/)).toBeVisible();
  const img = card.getByRole('img', { name: 'Your new photo, waiting for review' });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(400);
  await noSeriousA11yIssues(t);
  const src = (await img.getAttribute('src'))!;

  // Signed-out visitors cannot open it.
  const anon = await browser.newContext();
  expect((await anon.request.get(src)).status()).toBe(404);
  await anon.close();

  // The Super Admin sees it in the queue; a decline needs a note; then approves it.
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.31' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  await expect(page.getByRole('heading', { level: 2, name: 'Teacher photos' })).toBeVisible();
  const review = page.getByRole('article').filter({ has: page.locator(`img[src="${src}"]`) });
  await review.getByRole('button', { name: /Decline the photo/ }).click();
  await expect(review.getByText('Tell the teacher why, so they can choose another photo.')).toBeVisible();
  await noSeriousA11yIssues(page);
  await review.getByRole('button', { name: /Approve the photo/ }).click();
  await expect(page.getByText('Photo approved. It replaces the teacher’s previous photo.')).toBeVisible();

  await t.reload();
  await expect(card.getByText('Approved by the AA Pro team.')).toBeVisible();
  await expect(card.getByRole('img', { name: 'Your profile photo' })).toBeVisible();
  await card.getByRole('button', { name: 'Remove my photo' }).click();
  await expect(card.getByText('Your photo is removed. Your initial is shown instead.')).toBeVisible();
  await tc.close();
});

test('PR-D1c: an approved teacher sets their usual weekly times (boards D5, D9)', async ({ page, browser }) => {
  const tc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.40' } });
  const t = await tc.newPage();
  const teacherEmail = freshEmail('times');
  await createAccount(t, 'teacher', teacherEmail);
  await confirmFromMailbox(t, teacherEmail);
  await signIn(t, teacherEmail, ADULT_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(t, ['Maths'], [5]);
  // Not before approval: the page sends a waiting teacher back to the status page.
  await t.goto('/teacher/availability');
  await expect(t).toHaveURL(/\/teacher\/status$/);

  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.41' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  const card = page.getByRole('article').filter({ hasText: teacherEmail });
  await card.getByLabel('Decision note (required)').fill('Checked for usual times');
  await card.getByRole('button', { name: 'Approve Test Teacher' }).click();
  await expect(page.getByText(/Approved. The teacher was emailed/)).toBeVisible();

  await t.goto('/teacher/availability');
  const times = t.getByRole('region', { name: 'Your usual weekly times' });
  await expect(times).toBeVisible();
  await times.getByLabel('Day 1', { exact: true }).selectOption({ label: 'Monday' });
  await times.getByRole('button', { name: 'Add a time' }).click();
  await times.getByLabel('Day 2', { exact: true }).selectOption({ label: 'Monday' });
  await times.getByLabel('From (time 2)').selectOption({ label: '5:00 pm' });
  await times.getByLabel('To (time 2)').selectOption({ label: '7:00 pm' });
  await times.getByRole('button', { name: 'Save times' }).click();
  await expect(times.getByText(/Two times on the same day overlap/)).toBeVisible();

  await times.getByLabel('Day 2', { exact: true }).selectOption({ label: 'Saturday' });
  await times.getByLabel('From (time 2)').selectOption({ label: '10:00 am' });
  await times.getByLabel('To (time 2)').selectOption({ label: '12:00 pm' });
  await times.getByRole('button', { name: 'Save times' }).click();
  await expect(times.getByText(/Saved. Families will see these times/)).toBeVisible();
  await t.reload();
  await expect(times.getByText('Now: Mon 4:00–6:00 pm · Sat 10:00 am–12:00 pm')).toBeVisible();
  await noSeriousA11yIssues(t);
  await t.setViewportSize({ width: 390, height: 844 });
  expect(await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await tc.close();
});

test('PR-D2: an approved teacher publishes a listing after agreeing to the previewed details (board D5)', async ({
  page,
  browser,
}) => {
  const tc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.50' } });
  const t = await tc.newPage();
  const teacherEmail = freshEmail('listing');
  await createAccount(t, 'teacher', teacherEmail);
  await confirmFromMailbox(t, teacherEmail);
  await signIn(t, teacherEmail, ADULT_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(t, ['Maths', 'Science'], [4, 5]);
  await t.goto('/teacher/listing');
  await expect(t).toHaveURL(/\/teacher\/status$/);

  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.51' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  const card = page.getByRole('article').filter({ hasText: teacherEmail });
  await card.getByLabel('Decision note (required)').fill('Checked for listings');
  await card.getByRole('button', { name: 'Approve Test Teacher' }).click();
  await expect(page.getByText(/Approved. The teacher was emailed/)).toBeVisible();

  await t.goto('/teacher');
  await t.getByRole('navigation', { name: 'Teacher menu' }).getByRole('link', { name: 'Looking for students' }).click();
  await expect(t.getByRole('heading', { level: 1, name: /Looking for students/ })).toBeVisible();
  await expect(t.getByText('Not started', { exact: true }).first()).toBeVisible();
  // Only the approved subjects are offered.
  const offer = t.getByRole('region', { name: 'What you offer' });
  await expect(offer.getByRole('checkbox', { name: 'English' })).toHaveCount(0);
  await offer.getByRole('checkbox', { name: 'Science', exact: true }).uncheck();
  await offer.getByRole('checkbox', { name: 'Grade 5', exact: true }).uncheck();
  await offer.getByRole('checkbox', { name: 'CBSE', exact: true }).check();
  await offer.getByLabel('Years of teaching (optional)').fill('8');

  const prices = t.getByRole('region', { name: 'Asking prices (up to 3, optional)' });
  await prices.getByRole('button', { name: 'Add a price' }).click();
  await prices.getByLabel('Amount per hour (price 1)').fill('600');
  await prices.getByRole('button', { name: 'Add a price' }).click();
  await prices.getByLabel('Plan (price 2)').selectOption({ label: 'Monthly' });
  await prices.getByLabel('Amount per plan (price 2)').fill('4000');
  await prices.getByLabel('Sessions in the plan (price 2)').fill('8');

  // The live preview shows exactly what will be public.
  const preview = t.getByRole('region', { name: 'What parents see' });
  await expect(preview.getByText('Maths', { exact: true })).toBeVisible();
  await expect(preview.getByText('Grade 4', { exact: true })).toBeVisible();
  await expect(preview.getByText('₹600 per hour · 40-minute sessions')).toBeVisible();
  await expect(preview.getByText('₹4,000 a month · 8 sessions × 40 min')).toBeVisible();
  await expect(preview.getByText('(as stated by the teacher)')).toBeVisible();
  expect(await preview.innerText()).not.toContain(teacherEmail);

  // Publishing needs agreement.
  await t.getByRole('button', { name: 'Publish' }).click();
  await expect(t.getByText('Please tick to agree before your listing is shown publicly.')).toBeVisible();
  await t.getByRole('checkbox', { name: /I agree to AA Pro showing these details publicly/ }).check();
  await t.getByRole('button', { name: 'Publish' }).click();
  await expect(t.getByText(/Published. Parents can see your listing/)).toBeVisible();
  await t.reload();
  await expect(t.getByText(/Published · shown until/)).toBeVisible();
  // What was published is exactly what was previewed, even after a refused first attempt.
  await expect(offer.getByRole('checkbox', { name: 'Science', exact: true })).not.toBeChecked();
  await expect(offer.getByRole('checkbox', { name: 'Grade 5', exact: true })).not.toBeChecked();
  await expect(offer.getByRole('checkbox', { name: 'CBSE', exact: true })).toBeChecked();
  await expect(prices.getByRole('combobox', { name: 'Plan (price 2)' })).toHaveValue('monthly');
  await expect(preview.getByText('Maths', { exact: true })).toBeVisible();
  await expect(preview.getByText('Grade 4', { exact: true })).toBeVisible();
  await expect(preview.getByText('CBSE')).toBeVisible();
  await expect(preview.getByText('₹4,000 a month · 8 sessions × 40 min')).toBeVisible();
  await expect(t.getByText(/Your public listing shows the details you agreed to earlier/)).toHaveCount(0);
  await noSeriousA11yIssues(t);

  // Pause hides it; withdraw closes it.
  await t.getByRole('button', { name: 'Pause' }).click();
  await expect(t.getByText(/Paused. Parents no longer see your listing/)).toBeVisible();
  await t.reload();
  await expect(t.getByText('Paused · hidden')).toBeVisible();
  await t.getByRole('button', { name: 'Withdraw' }).click();
  await expect(t.getByText(/Withdrawn. Your listing is closed/)).toBeVisible();

  await t.setViewportSize({ width: 390, height: 844 });
  await t.reload();
  expect(await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await tc.close();
});

test('PR-D3: visitors browse published teachers on the homepage and /teachers without signing in (OC-84)', async ({
  page,
  browser,
}) => {
  const letters = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghijklmnop'[b % 16]).join('');
  const teacherName = `Teacher Pub ${letters.charAt(0).toUpperCase()}${letters.slice(1)}`;
  const tc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.60' } });
  const t = await tc.newPage();
  const teacherEmail = freshEmail('public');
  await createAccount(t, 'teacher', teacherEmail);
  await confirmFromMailbox(t, teacherEmail);
  await signIn(t, teacherEmail, ADULT_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(t, ['Science'], [7, 8]);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.61' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  const card = page.getByRole('article').filter({ hasText: teacherEmail });
  await card.getByLabel('Decision note (required)').fill('Checked for public listing');
  await card.getByRole('button', { name: 'Approve Test Teacher' }).click();
  await expect(page.getByText(/Approved. The teacher was emailed/)).toBeVisible();
  await t.goto('/teacher/profile');
  await t.getByLabel('Name shown to families').fill(teacherName);
  await t.getByRole('button', { name: 'Save changes' }).click();
  await expect(t.getByText('Your profile is saved.')).toBeVisible();
  await t.goto('/teacher/availability');
  const times = t.getByRole('region', { name: 'Your usual weekly times' });
  await times.getByLabel('Day 1', { exact: true }).selectOption({ label: 'Wednesday' });
  await times.getByRole('button', { name: 'Save times' }).click();
  await expect(times.getByText(/Saved. Families will see these times/)).toBeVisible();
  await t.goto('/teacher/listing');
  await t.getByRole('region', { name: 'What you offer' }).getByRole('checkbox', { name: 'ICSE', exact: true }).check();
  await t.getByRole('region', { name: 'What you offer' }).getByLabel('Years of teaching (optional)').fill('6');
  await t.getByRole('checkbox', { name: /I agree to AA Pro showing these details publicly/ }).check();
  await t.getByRole('button', { name: 'Publish' }).click();
  await expect(t.getByText(/Published. Parents can see your listing/)).toBeVisible();

  // A signed-out visitor, in another browser.
  const vc = await browser.newContext({ timezoneId: 'Asia/Singapore' });
  const v = await vc.newPage();
  await v.goto('/');
  const section = v.locator('#teachers');
  await expect(section.getByRole('heading', { level: 2, name: 'Meet Our Subject Specialists' })).toBeVisible();
  const teacherCard = section.getByRole('article', { name: teacherName });
  await expect(teacherCard).toBeVisible();
  await expect(teacherCard.getByText('Science')).toBeVisible();
  await expect(section.getByRole('search', { name: 'Search teachers' })).toBeVisible();
  expect(await v.content()).not.toContain(teacherEmail);
  await noSeriousA11yIssues(v);

  // Subject chip and filters on /teachers.
  await section.getByRole('navigation', { name: 'Subjects' }).getByRole('link', { name: 'Science' }).click();
  await expect(v).toHaveURL(/\/teachers\?subject=science/);
  await expect(v.getByRole('article', { name: teacherName })).toBeVisible();
  const search = v.getByRole('search', { name: 'Search teachers' });
  await search.getByLabel('Grade').selectOption({ label: 'Grade 3' });
  await search.getByRole('button', { name: 'Show teachers' }).click();
  await expect(v.getByRole('heading', { name: 'No teachers match' })).toBeVisible();
  await search.getByLabel('Grade').selectOption({ label: 'Grade 8' });
  await search.getByLabel('Curriculum').selectOption({ label: 'ICSE' });
  await search.getByLabel('Experience').selectOption({ label: '5+ years' });
  await search.getByRole('button', { name: 'Show teachers' }).click();
  await expect(v.getByRole('article', { name: teacherName })).toBeVisible();
  await noSeriousA11yIssues(v);

  // The listing page: only public details; usual times in the visitor's time zone (Wed 4–6 pm India = 6:30–8:30 pm Singapore).
  await v.getByRole('link', { name: `View profile: ${teacherName}` }).click();
  await expect(v).toHaveURL(/\/teachers\/t-[a-z0-9]{10}$/);
  await expect(v.getByRole('heading', { level: 1, name: teacherName })).toBeVisible();
  await expect(v.getByText('6 years')).toBeVisible();
  await expect(v.getByText(/6:30 pm–8:30 pm/)).toBeVisible();
  await expect(v.getByText(/In your time zone \(Asia\/Singapore\)/)).toBeVisible();
  await expect(v.getByRole('button', { name: /Connect/ })).toHaveCount(0);
  expect(await v.content()).not.toContain(teacherEmail);
  const robots = await v.locator('meta[name="robots"]').getAttribute('content');
  expect(robots).toMatch(/noindex/);
  await noSeriousA11yIssues(v);
  const listingUrl = v.url();
  await v.setViewportSize({ width: 390, height: 844 });
  expect(await v.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Paused: the page says only that it is no longer available.
  await t.goto('/teacher/listing');
  await t.getByRole('button', { name: 'Pause' }).click();
  await expect(t.getByText(/Paused. Parents no longer see your listing/)).toBeVisible();
  await v.goto(listingUrl);
  await expect(v.getByRole('heading', { level: 1, name: 'Listing no longer available' })).toBeVisible();
  expect(await v.content()).not.toContain(teacherName);
  await vc.close();
  await tc.close();
});

test('PR-D4a: a visitor connects with a teacher, signs up, sends an enquiry; the teacher accepts (D3, D4, D6, D11)', async ({
  page,
  browser,
}) => {
  const letters = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghijklmnop'[b % 16]).join('');
  const teacherName = `Teacher Enq ${letters.charAt(0).toUpperCase()}${letters.slice(1)}`;
  const tc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.70' } });
  const t = await tc.newPage();
  const teacherEmail = freshEmail('enq-teacher');
  await createAccount(t, 'teacher', teacherEmail);
  await confirmFromMailbox(t, teacherEmail);
  await signIn(t, teacherEmail, ADULT_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(t, ['Science'], [7, 8]);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.71' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  const card = page.getByRole('article').filter({ hasText: teacherEmail });
  await card.getByLabel('Decision note (required)').fill('Checked for enquiries');
  await card.getByRole('button', { name: 'Approve Test Teacher' }).click();
  await expect(page.getByText(/Approved. The teacher was emailed/)).toBeVisible();
  await t.goto('/teacher/profile');
  await t.getByLabel('Name shown to families').fill(teacherName);
  await t.getByRole('button', { name: 'Save changes' }).click();
  await expect(t.getByText('Your profile is saved.')).toBeVisible();
  await t.goto('/teacher/listing');
  await t.getByRole('checkbox', { name: /I agree to AA Pro showing these details publicly/ }).check();
  await t.getByRole('button', { name: 'Publish' }).click();
  await expect(t.getByText(/Published. Parents can see your listing/)).toBeVisible();

  // A signed-out visitor chooses the teacher and creates a parent account from there.
  const vc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.72' } });
  const v = await vc.newPage();
  await v.goto('/teachers');
  await v.getByRole('link', { name: `View profile: ${teacherName}` }).click();
  await v.getByRole('link', { name: 'Connect with teacher' }).click();
  await expect(v.getByRole('heading', { level: 1, name: `Connect with ${teacherName}` })).toBeVisible();
  await noSeriousA11yIssues(v);
  await v.getByRole('link', { name: 'Create a parent account' }).click();
  await expect(v.getByText(`You're connecting with ${teacherName}.`)).toBeVisible();
  await expect(v.getByRole('radio', { name: /A teacher/ })).toBeHidden();
  const parentEmail = freshEmail('enq-parent');
  await v.getByLabel('Your name').fill('Priya Sample');
  await v.getByLabel('Email').fill(parentEmail);
  await v.getByLabel('Password').fill(ADULT_PHRASE);
  await v.getByRole('checkbox', { name: /privacy notice/ }).check();
  await v.getByRole('button', { name: 'Create account' }).click();
  await expect(v.getByText(/we'll take you back to the teacher you chose/)).toBeVisible();

  // Confirmation opened "on another device": a fresh browser.
  const dc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.73' } });
  const d = await dc.newPage();
  await confirmFromMailbox(d, parentEmail);
  await signIn(d, parentEmail, ADULT_PHRASE);
  await expect(d).toHaveURL(/\/teachers\/t-[a-z0-9]{10}\/connect$/);
  const connectPath = new URL(d.url()).pathname;
  await expect(d.getByRole('heading', { level: 1, name: `Send an enquiry to ${teacherName}` })).toBeVisible();
  await d.getByRole('radio', { name: /A child I haven.t added yet/ }).check();
  await d.getByLabel('Grade', { exact: true }).selectOption({ label: 'Grade 8' });
  await d.getByLabel('Curriculum (optional)').selectOption({ label: 'ICSE' });
  await d.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(d.getByText('Choose at least one subject this teacher teaches.')).toBeVisible();
  await d.getByRole('checkbox', { name: 'Science' }).check();
  await d.getByLabel('Message (optional)').fill('Looking for help with chemistry basics.');
  await noSeriousA11yIssues(d);
  await d.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(d).toHaveURL(/\/parent\/enquiries\?sent=1$/);
  await expect(d.getByText('Waiting for answer')).toBeVisible();
  await noSeriousA11yIssues(d);
  // A second active enquiry to the same teacher for the same child is refused.
  await d.goto(connectPath);
  await d.getByRole('radio', { name: /A child I haven.t added yet/ }).check();
  await d.getByLabel('Grade', { exact: true }).selectOption({ label: 'Grade 8' });
  await d.getByLabel('Curriculum (optional)').selectOption({ label: 'ICSE' });
  await d.getByRole('checkbox', { name: 'Science' }).check();
  await d.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(d.getByText(/You already have an active enquiry with this teacher/)).toBeVisible();

  // The teacher sees the parent's first name and grade only, and accepts.
  await t.goto('/teacher/enquiries');
  const enquiry = t.getByRole('article').filter({ hasText: 'From Priya (parent)' });
  await expect(enquiry.getByText('Grade 8 · ICSE')).toBeVisible();
  await expect(enquiry.getByText('Looking for help with chemistry basics.')).toBeVisible();
  expect(await t.content()).not.toContain(parentEmail);
  await noSeriousA11yIssues(t);
  await enquiry.getByLabel('Note to Priya (optional)').fill('Happy to help. Saturdays work best.');
  await enquiry.getByRole('button', { name: 'Accept the enquiry from Priya' }).click();
  await expect(t.getByText(/Accepted. The parent is told/)).toBeVisible();

  await d.goto('/parent/enquiries');
  await expect(d.getByText('Accepted', { exact: true })).toBeVisible();
  await expect(d.getByText('Happy to help. Saturdays work best.')).toBeVisible();
  await expect(d.getByRole('link', { name: 'Add teacher' })).toBeVisible();

  // A teacher who opens "Connect" is told only parents can connect; nothing is sent.
  await t.goto(d.url().replace(/\/parent\/enquiries$/, '/teachers'));
  await t.goto((await d.evaluate(() => location.origin)) + '/teachers');
  await vc.close();
  await dc.close();
  await tc.close();
});
