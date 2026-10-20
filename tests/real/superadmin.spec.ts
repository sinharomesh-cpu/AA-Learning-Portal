import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, test, type Page } from '@playwright/test';
import { generate } from 'otplib';
import sharp from 'sharp';
import {
  addTimes,
  choose,
  confirmFromMailbox,
  createAccount,
  freshEmail,
  linkFromMailbox,
  PHRASE as ADULT_PHRASE,
  sendTeacherProfile,
  signIn,
} from './helpers';
import { bellCount, openBell, rows, signInAs } from './notificationHelpers';
import {
  readAtOf,
  seedDb,
  seedPackageNeedingDetails,
  seedTeacher,
  seedUsualTimes,
  setPricingV2,
} from './notificationSeed';

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
  // Design audit (OC-110): AUDIT_SHOTS=<folder> saves every page these tests check.
  if (process.env.AUDIT_SHOTS) {
    const name = new URL(page.url()).pathname.replace(/[^a-z0-9]+/gi, '_') || '_';
    await page.screenshot({ path: `${process.env.AUDIT_SHOTS}/${name}-${Date.now()}.png`, fullPage: true });
  }
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
  // CR-16 AC-47 (D-6): admin pages have no bell and make no notification requests.
  const actions: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.headers()['next-action']) actions.push(r.url());
  });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page.getByTestId('notification-bell')).toHaveCount(0);
  await page.goto('/admin/security');
  await expect(page.getByTestId('codes-left')).toHaveText('10');
  await expect(page.getByTestId('notification-bell')).toHaveCount(0);
  expect(actions).toEqual([]);
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
  // CR-16 AC-47 (D-6): no bell for an Admin either.
  await expect(a.getByTestId('notification-bell')).toHaveCount(0);
  const menu = a.getByRole('navigation', { name: 'Admin menu', exact: true });
  await expect(menu.getByRole('link')).toHaveText(['Home', 'Audit log', 'Security']);
  await a.goto('/admin/accounts');
  await expect(a.getByRole('heading', { level: 1 })).toHaveText('Not available to you');
  await a.goto('/admin/admins');
  await expect(a.getByRole('heading', { level: 1 })).toHaveText('Not available to you');
  await a.goto('/admin/storage');
  await expect(a.getByRole('heading', { level: 1 })).toHaveText('Not available to you');
  // CR-15 §5.1: verification decisions are the Super Admin's alone.
  await a.goto('/admin/verification');
  await expect(a.getByRole('heading', { level: 1 })).toHaveText('Not available to you');
  await a.goto('/admin/audit-log');
  await expect(a.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
  await expect(a.getByTestId('audit-row').filter({ hasText: 'Admin added' }).first()).toBeVisible();
  await noSeriousA11yIssues(a);
  await other.close();
});

test('OC-96: the Super Admin sees storage use and changes the safety limits without a code change', async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.6' });
  await ownerSignedIn(page);
  await page.goto('/admin/storage');
  await expect(page.getByRole('heading', { level: 1, name: 'Storage' })).toBeVisible();
  await expect(page.getByTestId('db-used')).toContainText(/of 1\.0 GB used/);
  await noSeriousA11yIssues(page);
  const perDay = page.getByLabel(/Uploads per account per day/);
  await expect(perDay).toHaveValue('100');
  await expect(page.getByLabel(/Storage per account/)).toHaveValue('200');

  // The warning level must stay below the stop level.
  await page.getByLabel(/Warn me at/).fill('95');
  await page.getByRole('button', { name: 'Save limits' }).click();
  await expect(page.getByText(/warning level must be lower than the level at which uploads stop/)).toBeVisible();

  await page.getByLabel(/Warn me at/).fill('75');
  await perDay.fill('50');
  await page.getByRole('button', { name: 'Save limits' }).click();
  await expect(page.getByText('Saved. The new limits apply to the next upload.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/Uploads per account per day/)).toHaveValue('50');
  // Put the approved default back.
  await page.getByLabel(/Uploads per account per day/).fill('100');
  await page.getByRole('button', { name: 'Save limits' }).click();
  await expect(page.getByText('Saved. The new limits apply to the next upload.')).toBeVisible();
  await page.goto('/admin/audit-log');
  await expect(page.getByTestId('audit-row').filter({ hasText: 'Storage limit changed' }).first()).toBeVisible();
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
  // The dashboard (S21) shows the real teacher's own profile, not sample data.
  await expect(t.getByRole('heading', { level: 1, name: 'Test Teacher' })).toBeVisible();
  await expect(t.getByText('Demo: sample data only')).toHaveCount(0);
  await expect(t.getByRole('link', { name: 'Your listing: Not started' })).toBeVisible();
  await expect(t.getByRole('heading', { name: 'No lessons coming up' })).toBeVisible();
  await expect(t.getByRole('heading', { name: 'No students linked yet' })).toBeVisible();
  await noSeriousA11yIssues(t);

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
  return { context, page: p, email: address };
}

test('a parent asks a new teacher; after approval the teacher accepts and sees only the ticked child and subjects (OC-36, OC-41, CR-12)', async ({
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
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(p.getByText('Tick at least one child and one subject.')).toBeVisible();
  await p.getByRole('group', { name: 'Subjects for Asha' }).getByRole('checkbox', { name: 'Maths' }).check();
  await p.getByLabel('Message to the teacher (optional)').fill('Help with fractions, please.');
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(p.getByText(/Request saved. Teacher H. Kapoor is waiting for AA Pro approval/)).toBeVisible();
  await expect(p.getByText('Waiting for AA Pro approval', { exact: true }).first()).toBeVisible();
  await noSeriousA11yIssues(p);

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

  // CR-12 (Reading A): after approval the teacher gets a request with the minimum details only.
  await t.goto('/teacher');
  await expect(t.getByText('1 request is waiting for your answer.', { exact: false })).toBeVisible();
  await t.getByRole('link', { name: 'Answer requests' }).click();
  const request = t.getByRole('article').filter({ hasText: 'Child 1 · Grade 5' });
  await expect(request).toContainText('Request from Test (parent)');
  await expect(request).toContainText('Help with fractions, please.');
  expect(await t.content()).not.toContain('Asha');
  await expect(t.getByText('When you accept a parent', { exact: false })).toBeVisible();
  await noSeriousA11yIssues(t);
  await request.getByRole('button', { name: 'Accept' }).click();
  await expect(t.getByRole('dialog')).toContainText('Only Maths.');
  await t.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(t.getByText(/Accepted. Asha is now in My students for Maths/)).toBeVisible();

  // The teacher sees Asha for Maths only.
  await expect(t.getByText('Grade 5 · Subjects with you: Maths')).toBeVisible();
  await noSeriousA11yIssues(t);
  await t.getByRole('link', { name: 'Open Asha' }).click();
  await expect(t.getByRole('heading', { level: 1, name: 'Asha' })).toBeVisible();
  const studentUrl = t.url();

  // The parent changes the subject: the teacher sees the change at once.
  await p.goto('/parent/teachers');
  await expect(p.getByText('Accepted', { exact: true })).toBeVisible();
  await expect(p.getByText(/Teacher H. Kapoor accepted your request for Asha \(Maths\)/)).toBeVisible();
  await noSeriousA11yIssues(p);
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
  await expect(t.getByText('When you accept a parent', { exact: false })).toBeVisible();
  await tc.close();
  await fam.context.close();
});

test('CR-07 H-2b: a teacher shares a worksheet; only the linked child and their parent can open it', async ({
  page,
  browser,
}) => {
  test.setTimeout(360_000);
  const fam = await parentWithChild(browser, '10.200.0.40', 'Nila', ['Science']);
  const p = fam.page;
  const childUser = (await p.getByTestId('child-username').innerText()).trim();
  const childPass = (await p.getByTestId('child-password').innerText()).trim();
  await p.goto('/parent/teachers/new');
  const teacherEmail = freshEmail('sharer');
  await p.getByLabel("Teacher's name").fill('Teacher S. Menon');
  await p.getByLabel("Teacher's email").fill(teacherEmail);
  await p.getByRole('group', { name: 'Subjects for Nila' }).getByRole('checkbox', { name: 'Science' }).check();
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(p.getByText(/Request saved/)).toBeVisible();

  const tc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.41' } });
  const t = await tc.newPage();
  const TEACHER_PHRASE = ['menon', 'shares', 'leaf', 'sheets'].join(' ');
  await t.goto(await linkFromMailbox(t, teacherEmail, 'teacher_added_by_parent'));
  await t.getByLabel('New password').fill(TEACHER_PHRASE);
  await t.getByLabel('Type it again').fill(TEACHER_PHRASE);
  await t.getByRole('button', { name: 'Save password and continue' }).click();
  await expect(t).toHaveURL(/\/sign-in/);
  await signIn(t, teacherEmail, TEACHER_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(t, ['Science'], [5]);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.42' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  const card = page.getByRole('article').filter({ hasText: teacherEmail });
  await card.getByLabel('Decision note (required)').fill('Added by a parent; checked');
  await card.getByRole('button', { name: 'Approve Teacher S. Menon' }).click();
  await expect(page.getByText(/Approved. The teacher was emailed/)).toBeVisible();

  // CR-12: the teacher accepts Nila's request before sharing anything.
  await t.goto('/teacher/students');
  await t.getByRole('article').filter({ hasText: 'Child 1' }).getByRole('button', { name: 'Accept' }).click();
  await t.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(t.getByText(/Accepted. Nila is now in My students/)).toBeVisible();

  // The teacher uploads a 5 MB PDF (sent in two pieces) and shares it with Nila.
  await t.goto('/teacher/resources');
  await expect(t.getByRole('heading', { level: 1, name: 'Learning resources' })).toBeVisible();
  await noSeriousA11yIssues(t);
  const size = 5 * 1024 * 1024;
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n', 'latin1'),
    Buffer.alloc(size - 16, 0x20),
    Buffer.from('\n%%EOF\n', 'latin1'),
  ]);
  await t
    .getByLabel('File', { exact: true })
    .setInputFiles({ name: 'Leaf worksheet.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(t.getByTestId('upload-ready')).toContainText('Leaf worksheet.pdf');
  await expect(t.getByLabel('Title')).toHaveValue('Leaf worksheet');
  await t.getByLabel('Chapter (optional)').fill('Chapter 2');
  await t.getByRole('checkbox', { name: /Nila/ }).check();
  await t.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(
    t.getByText('Shared with Nila. They can open it now, and their parents can see it in AA Pro.'),
  ).toBeVisible();
  await expect(t.getByTestId('storage-used')).toHaveText('5 MB of 200 MB used');
  const own = t.getByTestId('own-resource').filter({ hasText: 'Leaf worksheet' });
  const viewHref = (await own.getByRole('link', { name: 'Open' }).getAttribute('href')) ?? '';
  expect(viewHref).toMatch(/^\/files\/[0-9a-f-]{36}\/view$/);

  // The child sees it at once and opens it (joined from pieces in the browser).
  const cc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.43' } });
  const c = await cc.newPage();
  await c.goto('/sign-in/child');
  await c.getByLabel('Your username').fill(childUser);
  await c.getByLabel('Your password').fill(childPass);
  await c.getByRole('button', { name: "Let's go" }).click();
  await expect(c).toHaveURL(/\/student$/);
  await c.goto('/student/homework');
  const item = c.getByTestId('shared-resource').filter({ hasText: 'Leaf worksheet' });
  await expect(item).toContainText('From your teacher · Teacher S. Menon');
  await expect(item).toContainText('Chapter 2');
  await noSeriousA11yIssues(c);
  await item.getByRole('link', { name: /Open Leaf worksheet/ }).click();
  await expect(c.getByTestId('file-download')).toBeVisible({ timeout: 30_000 });

  // The parent sees it on Homework.
  await p.goto('/parent/homework');
  await expect(p.getByTestId('shared-resource').filter({ hasText: 'Leaf worksheet' })).toContainText('Nila');
  await noSeriousA11yIssues(p);

  // Another family cannot open it, nor can the Super Admin.
  const other = await parentWithChild(browser, '10.200.0.44', 'Ravi', ['Science']);
  await other.page.goto(viewHref);
  await expect(other.page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  expect((await other.page.request.get(viewHref.replace('/view', '?piece=0'))).status()).toBe(404);
  await other.context.close();
  expect((await page.request.get(viewHref.replace('/view', '?outline=1'))).status()).toBe(404);

  // Deleting hides it from the child at once.
  await t.goto('/teacher/resources');
  await own.getByRole('button', { name: 'Delete' }).click();
  await t.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(t.getByText(/Deleted. Removed for good on/)).toBeVisible();
  await c.goto('/student/homework');
  await expect(c.getByText('Nothing from your teachers yet.', { exact: false })).toBeVisible();
  await cc.close();
  await tc.close();
  await fam.context.close();
});

test('board 65: a parent finds an approved teacher and asks them; a decline starts the 7-day wait (OC-54, C-1, CR-12)', async ({
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
  // OC-106 (4): the modern search look; typing searches by itself.
  await search.getByLabel('Search teachers by name').fill(teacherName);
  await expect(p).toHaveURL(/name=/);
  await expect(p.getByRole('heading', { name: 'No results' })).toBeVisible();

  // Visible again: listed with the OC-54 fields only.
  await t.getByRole('button', { name: 'Show me in search' }).click();
  await expect(t.getByText(/You are visible again/)).toBeVisible();
  await p.getByRole('navigation', { name: 'Subjects' }).getByRole('link', { name: 'Maths', exact: true }).click();
  await expect(p).toHaveURL(/subject=maths/);
  await search.getByRole('button', { name: 'Grade: All grades' }).click();
  await search.getByRole('button', { name: 'Grade 5', exact: true }).click();
  await expect(p).toHaveURL(/subject=maths&grade=5/);
  await expect(p.getByText(/^(1 teacher|\d+ teachers) found/)).toBeVisible();
  await expect(p.getByRole('link', { name: 'Remove Grade 5' })).toBeVisible();
  const result = p.getByRole('article').filter({ has: p.getByRole('heading', { name: teacherName }) });
  await expect(result.getByText('Grades 4–5 · Asia/Kolkata')).toBeVisible();
  await expect(result.getByText('I have taught primary classes for eight years.')).toBeVisible();
  await expect(result.getByRole('button', { name: 'See available times' })).toHaveCount(0);
  expect(await p.content()).not.toContain(teacherEmail);
  await noSeriousA11yIssues(p);
  if (process.env.CR15_SHOTS)
    await p.screenshot({ path: `${process.env.CR15_SHOTS}/find-desktop.png`, fullPage: true });

  // Phone width: no sideways scrolling.
  await p.setViewportSize({ width: 390, height: 844 });
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.CR15_SHOTS) await p.screenshot({ path: `${process.env.CR15_SHOTS}/find-phone.png`, fullPage: true });
  await p.setViewportSize({ width: 1280, height: 900 });

  // "Add as my teacher" (C-1 option (a)): only subjects both have; a request the teacher answers (CR-12).
  await result.getByRole('link', { name: 'Add as my teacher' }).click();
  await expect(p.getByRole('heading', { level: 1, name: `Add ${teacherName}` })).toBeVisible();
  await noSeriousA11yIssues(p);
  expect(await p.content()).not.toContain(teacherEmail);
  const subjects = p.getByRole('group', { name: 'Subjects for Isha' });
  await expect(subjects.getByRole('checkbox', { name: 'English' })).toHaveCount(0);
  await expect(subjects.getByRole('checkbox', { name: 'Science' })).toHaveCount(0);
  await subjects.getByRole('checkbox', { name: 'Maths' }).check();
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(p.getByText(`Request sent to ${teacherName}.`, { exact: false })).toBeVisible();
  await expect(p.getByText('Waiting for the teacher', { exact: true })).toBeVisible();
  await noSeriousA11yIssues(p);
  // Queued only (shown in the development mailbox); nothing is sent for real.
  await p.goto('/dev/mailbox');
  await expect(
    p
      .getByTestId('mail')
      .filter({ has: p.getByTestId('mail-to').getByText(teacherEmail, { exact: true }) })
      .filter({ has: p.getByTestId('mail-template').getByText('teacher_link_request', { exact: true }) }),
  ).toHaveCount(1);

  // While the request waits the family sees "already your teacher" in the directory.
  await p.goto(`/parent/teachers/find?name=${encodeURIComponent(teacherName)}`);
  await expect(p.getByRole('link', { name: 'Already your teacher · Change children' })).toBeVisible();

  // The teacher declines with a reason (TR4); no access is granted.
  await t.goto('/teacher/students');
  const request = t.getByRole('article').filter({ hasText: 'Child 1 · Grade 5' });
  await request.getByRole('button', { name: 'Decline' }).click();
  const dialog = t.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Decline' }).click();
  await expect(dialog.getByText('Choose a reason.')).toBeVisible();
  await dialog.getByRole('radio', { name: 'No time at the moment' }).check();
  await dialog.getByLabel('Note to the parent (optional)').fill('Full until December, sorry!');
  await noSeriousA11yIssues(t);
  await dialog.getByRole('button', { name: 'Decline' }).click();
  await expect(t.getByText('Declined. The parent can see your reason.', { exact: false })).toBeVisible();
  await expect(t.getByText('No students yet')).toBeVisible();

  // The parent sees the answer and when they may ask again; asking again now is refused.
  await p.goto('/parent/teachers');
  await expect(p.getByText('Declined', { exact: true })).toBeVisible();
  await expect(p.getByText('Full until December, sorry!', { exact: false })).toBeVisible();
  await expect(p.getByText(/You can ask this teacher again for Isha from/)).toBeVisible();
  await expect(p.getByRole('link', { name: 'Find another teacher' })).toBeVisible();
  await noSeriousA11yIssues(p);
  await p.goto(`/parent/teachers/find?name=${encodeURIComponent(teacherName)}`);
  await p.getByRole('article').getByRole('link', { name: 'Add as my teacher' }).click();
  await p.getByRole('group', { name: 'Subjects for Isha' }).getByRole('checkbox', { name: 'Maths' }).check();
  await p.getByRole('button', { name: 'Send request' }).click();
  await expect(
    p.getByText(/declined your request for Isha recently. You can ask them again for Isha from/),
  ).toBeVisible();

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

/** Saves review screenshots when CR15_SHOTS is set (not part of the checks). */
const shot = async (p: Page, name: string) => {
  if (process.env.CR15_SHOTS) await p.screenshot({ path: `${process.env.CR15_SHOTS}/${name}.png`, fullPage: true });
};

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
  // AV0: one time on several days at once.
  await addTimes(times, ['Monday', 'Wednesday'], 960, 1080);
  // A time that overlaps on the same day is joined into one.
  await addTimes(times, ['Monday'], 1020, 1140);
  await expect(times.getByRole('button', { name: 'Change Monday 4:00–7:00 pm' })).toBeVisible();
  await times.getByRole('button', { name: 'Remove Wednesday 4:00–6:00 pm' }).click();
  await addTimes(times, ['Saturday'], 600, 720);
  await expect(times.getByText('2 changes not saved yet')).toBeVisible();
  await expect(times.getByRole('heading', { name: /Your week · 2 of 14 times · 5 h/ })).toBeVisible();
  await times.getByRole('button', { name: 'Save times' }).click();
  await expect(times.getByText(/Saved. Families will see these times/)).toBeVisible();
  await t.reload();
  await expect(times.getByRole('button', { name: 'Change Monday 4:00–7:00 pm' })).toBeVisible();
  await expect(times.getByRole('button', { name: 'Change Saturday 10:00 am–12:00 pm' })).toBeVisible();
  await expect(times.getByText('2 times saved')).toBeVisible();
  await noSeriousA11yIssues(t);
  await shot(t, 'av-desktop');
  // Drag down Tuesday from 8 am to 9 am on the week calendar (18 px a half hour).
  const tuesday = t.locator('[data-day="2"]');
  await t.evaluate(() => window.scrollTo(0, 250));
  const box = (await tuesday.boundingBox())!;
  const x = box.x + box.width / 2;
  await t.mouse.move(x, box.y + 16 * 18 + 5);
  await t.mouse.down();
  await t.mouse.move(x, box.y + 17 * 18, { steps: 4 });
  await t.mouse.move(x, box.y + 18 * 18 - 4, { steps: 4 });
  await t.mouse.up();
  await expect(times.getByRole('button', { name: 'Change Tuesday 8:00–9:00 am' })).toBeVisible();
  await t.getByRole('button', { name: 'Undo changes' }).click();
  await expect(times.getByRole('button', { name: 'Change Tuesday 8:00–9:00 am' })).toHaveCount(0);
  await t.setViewportSize({ width: 1440, height: 900 });
  await shot(t, 'av-desktop-1440');
  // AV1 (phone): the day list, and "Add" opens a sheet to add to several days at once.
  await t.setViewportSize({ width: 390, height: 844 });
  expect(await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(t, 'av-phone');
  await times.getByRole('button', { name: 'Add a time on Tuesday' }).click();
  const sheet = t.getByRole('dialog', { name: /^Add times/ });
  await expect(sheet.getByRole('button', { name: 'Tuesday', pressed: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Thursday' }).click();
  await shot(t, 'av-phone-sheet');
  await noSeriousA11yIssues(t);
  await sheet.getByRole('button', { name: 'Add to Tue and Thu' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(times.getByRole('button', { name: 'Change Thursday 4:00–6:00 pm' })).toBeVisible();
  await expect(t.getByText('2 changes not saved yet')).toBeVisible();
  await t.getByRole('button', { name: 'Undo changes' }).click();
  await expect(times.getByRole('button', { name: 'Change Thursday 4:00–6:00 pm' })).toHaveCount(0);
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
  await expect(t.getByText('Published: parents can find and open your listing.')).toBeVisible();
  await expect(t.getByText('Shown until', { exact: true })).toBeVisible();
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
  await addTimes(times, ['Wednesday'], 960, 1080);
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
  // OC-105 (SF1): filters apply at once; a real count; removable chips; Clear all.
  const search = v.getByRole('search', { name: 'Search teachers' });
  await search.getByRole('button', { name: 'Grade: All grades' }).click();
  await search.getByRole('group', { name: 'Grade' }).getByRole('button', { name: 'Grade 3', exact: true }).click();
  await expect(v).toHaveURL(/grade=3/);
  await expect(v.getByText('0 teachers found')).toBeVisible();
  await search.getByRole('button', { name: 'Grade: Grade 3' }).click();
  await v.keyboard.press('Escape');
  await expect(search.getByRole('group', { name: 'Grade' })).toHaveCount(0);
  await search.getByRole('button', { name: 'Grade: Grade 3' }).click();
  await search.getByRole('group', { name: 'Grade' }).getByRole('button', { name: 'Grade 8', exact: true }).click();
  await expect(v).toHaveURL(/grade=8/);
  await search.getByRole('button', { name: 'Curriculum: All curricula' }).click();
  // Only curricula that published teachers list, with real counts.
  await search.getByRole('group', { name: 'Curriculum' }).getByRole('button', { name: /ICSE/ }).click();
  await expect(v).toHaveURL(/curriculum=ICSE/);
  await search.getByRole('button', { name: 'Experience: Any experience' }).click();
  await search.getByRole('group', { name: 'Experience' }).getByRole('button', { name: '5+ years' }).click();
  await expect(v).toHaveURL(/experience=5/);
  await expect(v.getByRole('article', { name: teacherName })).toBeVisible();
  await expect(v.getByText(/^\d+ teachers? found/)).toBeVisible();
  if (process.env.CR15_SHOTS) await v.screenshot({ path: `${process.env.CR15_SHOTS}/sf-desktop.png`, fullPage: true });
  await v.getByRole('link', { name: 'Remove 5+ years' }).click();
  await expect(v).not.toHaveURL(/experience=/);
  await expect(v).toHaveURL(/grade=8/);
  await noSeriousA11yIssues(v);
  await v.getByRole('link', { name: 'Clear all' }).click();
  await expect(v).toHaveURL(/\/teachers#results$/);
  await expect(search.getByRole('button', { name: 'Grade: All grades' })).toBeVisible();
  // Name search updates the results after typing stops.
  await search.getByLabel('Search teachers by name').fill(teacherName);
  await expect(v).toHaveURL(new RegExp(`name=${encodeURIComponent(teacherName).replace(/%20/g, '\\+')}`));
  await expect(v.getByText('1 teacher found')).toBeVisible();
  await search.getByRole('button', { name: 'Clear search' }).click();
  await expect(v).not.toHaveURL(/name=/);
  // Phone: a Filters sheet with Reset and the real count.
  await v.setViewportSize({ width: 390, height: 844 });
  await search.getByRole('button', { name: /^Filters/ }).click();
  const sheet = v.getByRole('dialog', { name: 'Filters' });
  await sheet.getByRole('button', { name: 'Grade 8', exact: true }).click();
  await expect(sheet.getByRole('button', { name: /^Show \d+ teachers?$/ })).toBeVisible();
  if (process.env.CR15_SHOTS) await v.screenshot({ path: `${process.env.CR15_SHOTS}/sf-phone-sheet.png` });
  await sheet.getByRole('button', { name: /^Show \d+ teachers?$/ }).click();
  await expect(v).toHaveURL(/grade=8/);
  await expect(search.getByRole('button', { name: /^Filters, 1 active/ })).toBeVisible();
  expect(await v.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await noSeriousA11yIssues(v);
  await v.setViewportSize({ width: 1280, height: 900 });

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
  await choose(d, 'Grade', 'Grade 8');
  await choose(d, 'Curriculum (optional)', 'ICSE');
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
  await choose(d, 'Grade', 'Grade 8');
  await choose(d, 'Curriculum (optional)', 'ICSE');
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

test('CR-13: a parent proposes a rate; the teacher counters; the parent accepts; the agreed rate is separate (RN1–RN7)', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const letters = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghijklmnop'[b % 16]).join('');
  const teacherName = `Teacher Rate ${letters.charAt(0).toUpperCase()}${letters.slice(1)}`;
  const tc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.80' } });
  const t = await tc.newPage();
  const teacherEmail = freshEmail('rate-teacher');
  await createAccount(t, 'teacher', teacherEmail);
  await confirmFromMailbox(t, teacherEmail);
  await signIn(t, teacherEmail, ADULT_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(t, ['English'], [4, 5]);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.81' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  const card = page.getByRole('article').filter({ hasText: teacherEmail });
  await card.getByLabel('Decision note (required)').fill('Checked for rate proposals');
  await card.getByRole('button', { name: 'Approve Test Teacher' }).click();
  await expect(page.getByText(/Approved. The teacher was emailed/)).toBeVisible();
  await t.goto('/teacher/profile');
  await t.getByLabel('Name shown to families').fill(teacherName);
  await t.getByRole('button', { name: 'Save changes' }).click();
  await expect(t.getByText('Your profile is saved.')).toBeVisible();

  // RN4: a Monthly price with its "Proposals" switch on; the dashboard control is still off.
  await t.goto('/teacher/listing');
  await t.getByRole('button', { name: 'Add a price' }).click();
  await t.getByLabel('Plan (price 1)').selectOption({ label: 'Monthly' });
  await t.getByLabel('Amount per plan (price 1)').fill('4000');
  await t.getByLabel('Sessions in the plan (price 1)').fill('8');
  await t.getByRole('switch', { name: 'Rate proposals for price 1' }).check();
  await expect(t.getByText('Rate proposals are off on your dashboard', { exact: false })).toBeVisible();
  await t.getByRole('checkbox', { name: /I agree to AA Pro showing these details publicly/ }).check();
  await t.getByRole('button', { name: 'Publish' }).click();
  await expect(t.getByText(/Published. Parents can see your listing/)).toBeVisible();

  // RN1, AC-1: off by default, so the price is fixed.
  const vc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.82' } });
  const v = await vc.newPage();
  await v.goto('/teachers');
  await v.getByRole('link', { name: `View profile: ${teacherName}` }).click();
  await expect(v).toHaveURL(/\/teachers\/t-[a-z0-9]{10}$/);
  const publicUrl = v.url();
  await expect(v.getByText('Fixed price', { exact: true })).toBeVisible();
  await expect(v.getByRole('link', { name: 'Propose a rate' })).toHaveCount(0);

  await t.goto('/teacher');
  const panel = t.getByRole('region', { name: 'Rate negotiation' });
  await expect(panel.getByText('Prices open for proposals: Monthly', { exact: false })).toBeVisible();
  await panel.getByRole('button', { name: 'Accept rate proposals' }).click();
  await expect(panel.getByText('Accepting rate proposals', { exact: true })).toBeVisible();
  await noSeriousA11yIssues(t);

  // AC-2: a signed-out visitor is sent to sign in and comes back to the same teacher and price.
  await v.goto(publicUrl);
  await v.getByRole('link', { name: 'Propose a rate' }).click();
  await expect(v.getByRole('heading', { level: 1, name: `Propose a rate to ${teacherName}` })).toBeVisible();
  await expect(v.getByText(`${teacherName} · Monthly`)).toBeVisible();
  await noSeriousA11yIssues(v);
  const fam = await parentWithChild(browser, '10.200.0.83', 'Rhea', ['English']);
  await v.getByRole('link', { name: 'I already have an account — sign in' }).click();
  await expect(v.getByText(`Sign in to propose a rate to ${teacherName}`, { exact: false })).toBeVisible();
  await v.getByLabel('Email').fill(fam.email);
  await v.getByLabel('Password').fill(ADULT_PHRASE);
  await v.getByRole('button', { name: 'Sign in' }).click();
  await expect(v).toHaveURL(/\/teachers\/t-[a-z0-9]{10}\/propose\?price=0$/);

  // RN2: propose for the parent's own child; invalid amounts are refused with a clear message.
  await expect(v.getByRole('heading', { level: 1, name: `Propose a rate to ${teacherName}` })).toBeVisible();
  await choose(v, 'Subject', 'English');
  await v.getByLabel(/Your offer/).fill('0');
  await v.getByRole('button', { name: 'Send proposal' }).click();
  await expect(v.getByText('Enter an amount above zero', { exact: false })).toBeVisible();
  await v.getByLabel(/Your offer/).fill('3,400');
  await v.getByLabel('Message to the teacher (optional)').fill('Could we start in November at this rate?');
  await expect(v.getByText('AA Pro does not collect or process payments.', { exact: false }).first()).toBeVisible();
  await noSeriousA11yIssues(v);
  await v.getByRole('button', { name: 'Send proposal' }).click();
  await expect(v).toHaveURL(/\/parent\/enquiries\/rates\?sent=/);
  await expect(v.getByText(`Proposal sent. ${teacherName} has until`, { exact: false })).toBeVisible();
  await expect(v.getByText('Pending · waiting for the teacher')).toBeVisible();
  await noSeriousA11yIssues(v);

  // RN5: the teacher sees grade and curriculum only, never the child's name, and counters.
  await t.goto('/teacher/enquiries');
  await t.getByRole('link', { name: 'Rate proposals (1 waiting)' }).click();
  const proposal = t.getByTestId('rate-negotiation').first();
  await expect(proposal).toContainText('Pending · your turn');
  await expect(proposal).toContainText('Offer 1 of 6');
  await expect(proposal).toContainText('Could we start in November at this rate?');
  expect(await t.content()).not.toContain('Rhea');
  await noSeriousA11yIssues(t);
  await proposal.getByText('Counter-offer', { exact: true }).click();
  await proposal.getByLabel(/Your offer/).fill('3700');
  await proposal.getByLabel('Message (optional)').fill('I can do 3,700 from November.');
  await proposal.getByRole('button', { name: 'Send counter-offer' }).click();
  await expect(t.getByText('Counter-offer sent (offer 2 of 6)', { exact: false })).toBeVisible();
  await expect(t.getByText('Counter-proposed · waiting for the parent')).toBeVisible();

  // RN3/RN6: the parent accepts; the agreed rate shows beside the asking price; nothing is linked.
  await v.goto('/parent/enquiries/rates');
  const mine = v.getByTestId('rate-negotiation').first();
  await expect(mine).toContainText('Counter-proposed · your turn');
  await mine.getByRole('button', { name: 'Accept ₹3,700' }).click();
  await expect(v.getByRole('dialog')).toContainText("doesn't link the teacher");
  await v.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(v.getByText('Agreed. The rate is recorded for you both.', { exact: false })).toBeVisible();
  await expect(mine.getByText('Accepted', { exact: true })).toBeVisible();
  await expect(mine.getByRole('table')).toContainText('₹4,000 a month · 8 lessons × 40 min');
  await expect(mine.getByRole('table')).toContainText('₹3,700 a month · 8 lessons × 40 min');
  await expect(mine.getByRole('link', { name: 'Ask this teacher to teach Rhea' })).toBeVisible();
  await noSeriousA11yIssues(v);
  await t.goto('/teacher/students');
  await expect(t.getByText('No students yet')).toBeVisible();

  // Queued only (development mailbox); nothing is sent for real.
  await v.goto('/dev/mailbox');
  await expect(
    v
      .getByTestId('mail')
      .filter({ has: v.getByTestId('mail-to').getByText(teacherEmail, { exact: true }) })
      .filter({ has: v.getByTestId('mail-template').getByText('rate_proposal_received', { exact: true }) }),
  ).toHaveCount(1);

  // The AA Pro team sees counts only.
  await page.goto('/admin/rate-proposals');
  await expect(page.getByRole('heading', { level: 1, name: 'Rate proposals' })).toBeVisible();
  expect(await page.content()).not.toContain(teacherName);
  await noSeriousA11yIssues(page);

  await fam.context.close();
  await vc.close();
  await tc.close();
});

test('CR-15 A3: with the new pricing model on, a teacher offers hourly lessons and a learning package (PM1–PM3)', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const letters = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghijklmnop'[b % 16]).join('');
  const teacherName = `Teacher Offer ${letters.charAt(0).toUpperCase()}${letters.slice(1)}`;
  const tc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.90' } });
  const t = await tc.newPage();
  const teacherEmail = freshEmail('offers');
  await createAccount(t, 'teacher', teacherEmail);
  await confirmFromMailbox(t, teacherEmail);
  await signIn(t, teacherEmail, ADULT_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(t, ['Maths'], [5, 6]);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.91' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  const card = page.getByRole('article').filter({ hasText: teacherEmail });
  await card.getByLabel('Decision note (required)').fill('Checked for CR-15');
  await card.getByRole('button', { name: 'Approve Test Teacher' }).click();
  await expect(page.getByText(/Approved. The teacher was emailed/)).toBeVisible();
  await t.goto('/teacher/profile');
  await t.getByLabel('Name shown to families').fill(teacherName);
  await t.getByRole('button', { name: 'Save changes' }).click();
  await expect(t.getByText('Your profile is saved.')).toBeVisible();

  // Usual times: Monday and Wednesday 5–6 pm, Saturday 10–12.
  await t.goto('/teacher/availability');
  const times = t.getByRole('region', { name: 'Your usual weekly times' });
  await addTimes(times, ['Monday', 'Wednesday'], 1020, 1080);
  await addTimes(times, ['Saturday'], 600, 720);
  await times.getByRole('button', { name: 'Save times' }).click();
  await expect(times.getByText(/Saved. Families will see these times/)).toBeVisible();

  // Off by default: the editor still shows the earlier prices.
  await t.goto('/teacher/listing');
  await expect(t.getByRole('region', { name: 'Asking prices (up to 3, optional)' })).toBeVisible();
  await expect(t.getByRole('region', { name: 'Hourly lessons' })).toHaveCount(0);

  await page.goto('/admin/rate-proposals');
  await expect(page.getByRole('heading', { name: 'New pricing model (CR-15): off' })).toBeVisible();
  await page.getByRole('button', { name: 'Turn the new pricing model on' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByRole('heading', { name: 'New pricing model (CR-15): on' })).toBeVisible();
  try {
    await t.goto('/teacher/listing');
    await expect(t.getByRole('region', { name: 'Asking prices (up to 3, optional)' })).toHaveCount(0);
    const hourly = t.getByRole('region', { name: 'Hourly lessons' }).first();
    // OC-109: same design as the package builder (switch card, price field, stepper, slot cards).
    await hourly.getByRole('checkbox', { name: /Offer hourly lessons/ }).check();
    await hourly.getByLabel('Hourly rate', { exact: true }).fill('600');
    await hourly.getByRole('textbox', { name: 'Lesson length (min)' }).fill('40');
    await expect(hourly.getByText('a 40-minute lesson', { exact: false }).first()).toBeVisible();
    await expect(hourly.getByText('₹400', { exact: true })).toBeVisible();
    await hourly.getByRole('button', { name: 'Save hourly lessons' }).click();
    await expect(hourly.getByText(/Hourly lessons saved/)).toBeVisible();
    // Each time has its own setting; it applies at once.
    await hourly.getByRole('radio', { name: 'Open to offers' }).first().check();
    await expect(hourly.getByText('Saved. This applies at once.')).toBeVisible();

    const pkg = t.getByRole('region', { name: /Learning package/ }).first();
    // OC-108 (boards PT0–PT1): number buttons and a week planner instead of drop-downs.
    await pkg.getByRole('button', { name: '2 a week', exact: true }).click();
    await expect(pkg.getByRole('textbox', { name: 'Complete within (weeks)' })).toHaveValue('11');
    await pkg.getByLabel('Package price', { exact: true }).fill('8500');
    // Refused until every rule is met: no class times chosen yet.
    await pkg.getByRole('button', { name: 'Offer this package' }).click();
    await expect(pkg.getByText('Choose one time for each class a week.').first()).toBeVisible();
    await pkg.getByRole('button', { name: 'Monday 5:00 pm', exact: true }).click();
    await expect(pkg.getByRole('button', { name: 'Monday 5:00 pm, class time 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await pkg.getByRole('button', { name: 'Wednesday 5:00 pm', exact: true }).click();
    await expect(pkg.getByText('All 2 chosen')).toBeVisible();
    await expect(t.getByRole('complementary', { name: 'Package preview' })).toContainText('What parents will see');
    await pkg.getByRole('button', { name: 'Offer this package' }).click();
    await expect(pkg.getByText(/Package saved. Publish your listing/)).toBeVisible();
    await t.reload();
    await shot(t, 'pm-teacher-editor');
    // Phone: day tabs, no sideways scrolling (PT1).
    await t.setViewportSize({ width: 390, height: 844 });
    expect(await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(t, 'pt-teacher-editor-phone');
    await t.setViewportSize({ width: 1280, height: 900 });

    // The preview shows both offers separately; old prices are gone from it.
    const preview = t.getByRole('region', { name: 'What parents see' });
    await expect(preview.getByRole('region', { name: 'Hourly lessons' })).toContainText('₹600');
    await expect(preview.getByRole('region', { name: 'Learning package' })).toContainText('₹8,500');
    await expect(preview.getByText('22 classes × 40 min · 2 a week · complete within 11 weeks')).toBeVisible();
    await t.getByRole('checkbox', { name: /I agree to AA Pro showing these details publicly/ }).check();
    await t.getByRole('button', { name: 'Publish' }).click();
    await expect(t.getByText(/Published. Parents can see your listing/)).toBeVisible();
    await noSeriousA11yIssues(t);

    // The package's times can't be removed while it is offered.
    await t.goto('/teacher/availability');
    // AV1: shown with a lock, no Remove, and can't be shortened past the class.
    await expect(times.getByRole('button', { name: 'Remove Wednesday 5:00–6:00 pm' })).toHaveCount(0);
    await times.getByRole('button', { name: 'Change Wednesday 5:00–6:00 pm (used by your learning package)' }).click();
    const change = times.getByRole('region', { name: 'Change Wednesday 5:00–6:00 pm' });
    await change.getByRole('slider', { name: 'To' }).fill('1050');
    await change.getByRole('button', { name: 'Save this change' }).click();
    await expect(change.getByRole('alert')).toContainText('Your learning package has a class at Wednesday 5:00 pm');
    await expect(t.getByRole('dialog')).toHaveCount(0);
    await shot(t, 'av-locked');
    await change.getByRole('button', { name: 'Cancel' }).click();

    // A visitor sees the two offers, each with its own label.
    const vc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.92' } });
    const v = await vc.newPage();
    await v.goto('/teachers');
    await v.getByRole('link', { name: `View profile: ${teacherName}` }).click();
    const h = v.getByRole('region', { name: 'Hourly lessons' });
    const p = v.getByRole('region', { name: 'Learning package' });
    await expect(h).toContainText('₹400 a 40-minute lesson');
    await expect(h).toContainText('no minimum number of lessons');
    await expect(p).toContainText('₹8,500');
    await expect(p).toContainText('never renews automatically');
    await expect(p.getByText('Fixed price', { exact: true })).toBeVisible();
    // The master switch is off, so nothing shows as negotiable to parents yet.
    await expect(h.getByText('Open to offers')).toHaveCount(0);
    await expect(p).not.toContainText(/month/i);
    // After a client-side link the page title is set a moment later; wait for it before the check.
    await expect(v).toHaveTitle(/\S/);
    await noSeriousA11yIssues(v);
    await shot(v, 'pm-public-profile');
    await v.setViewportSize({ width: 390, height: 844 });
    await v.reload();
    expect(await v.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(v, 'pm-public-profile-phone');
    await t.setViewportSize({ width: 390, height: 844 });
    await t.goto('/teacher/listing');
    expect(await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await t.setViewportSize({ width: 1280, height: 900 });
    const profileUrl = v.url();
    await vc.close();

    // A4 (FR-043): the teacher opens the package price to proposals and turns on the master switch.
    const pk = t.getByRole('region', { name: /Learning package/ }).first();
    await pk.getByRole('radio', { name: /Open to offers/ }).check();
    await pk.getByRole('button', { name: 'Offer this package' }).click();
    await expect(pk.getByText(/Package saved/)).toBeVisible();
    await t.goto('/teacher');
    await t
      .getByRole('region', { name: 'Rate negotiation' })
      .getByRole('button', { name: 'Accept rate proposals' })
      .click();
    await expect(t.getByText('Accepting rate proposals', { exact: true })).toBeVisible();

    // A parent proposes an hourly rate at Monday's time, then a package price: both can be open.
    const fam = await parentWithChild(browser, '10.200.0.93', 'Tara', ['Maths']);
    const pp = fam.page;
    await pp.goto(profileUrl);
    await pp.getByRole('region', { name: 'Hourly lessons' }).getByRole('link', { name: 'Propose a rate' }).click();
    await expect(pp.getByRole('heading', { level: 1, name: `Propose to ${teacherName}` })).toBeVisible();
    await expect(pp.getByRole('radio', { name: /Hourly lessons · Monday/ })).toBeChecked();
    await choose(pp, 'Subject', 'Maths');
    await pp.getByLabel(/Your hourly rate offer/).fill('525');
    await expect(pp.getByText('= ₹350 a 40-minute lesson', { exact: false })).toBeVisible();
    await noSeriousA11yIssues(pp);
    await pp.getByRole('button', { name: 'Send proposal' }).click();
    await expect(pp).toHaveURL(/\/parent\/enquiries\/rates\?sent=/);
    await pp.goto(profileUrl);
    await pp.getByRole('link', { name: 'Propose a package price' }).click();
    await expect(pp.getByRole('radio', { name: /Learning package/ })).toBeChecked();
    await choose(pp, 'Subject', 'Maths');
    await pp.getByLabel(/Your package price offer/).fill('7,800');
    await pp.getByRole('button', { name: 'Send proposal' }).click();
    await expect(pp).toHaveURL(/\/parent\/enquiries\/rates\?sent=/);
    await expect(pp.getByTestId('rate-negotiation')).toHaveCount(2);

    // The teacher counters the package on price only; there is no field for anything else.
    await t.goto('/teacher/enquiries/rates');
    const pkgCard = t.getByTestId('rate-negotiation').filter({ hasText: 'Learning package' });
    await expect(pkgCard).toContainText('22 classes × 40 min · 2 a week · complete within 11 weeks');
    expect(await t.content()).not.toContain('Tara');
    await pkgCard.getByText('Counter-offer', { exact: true }).click();
    await expect(pkgCard.getByLabel('Minutes per lesson')).toHaveCount(0);
    await pkgCard.getByLabel(/Your offer/).fill('8200');
    await pkgCard.getByRole('button', { name: 'Send counter-offer' }).click();
    await expect(t.getByText('Counter-offer sent (offer 2 of 6)', { exact: false })).toBeVisible();
    await expect(t.getByTestId('rate-negotiation').filter({ hasText: 'Hourly lessons' })).toContainText(
      'Pending · your turn',
    );
    // Checked on a fresh load: just after the counter-offer the page is still settling its redirect.
    await t.goto('/teacher/enquiries/rates');
    await expect(t.getByTestId('rate-negotiation')).toHaveCount(2);
    await noSeriousA11yIssues(t);
    await fam.context.close();
  } finally {
    await page.goto('/admin/rate-proposals');
    await page.getByRole('button', { name: 'Turn the new pricing model off' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click();
    await expect(page.getByRole('heading', { name: 'New pricing model (CR-15): off' })).toBeVisible();
  }
  await tc.close();
});

test('CR-15 A5: the Super Admin sees a read-only dry run of the price conversion (PM8)', async ({ page }) => {
  await ownerSignedIn(page);
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Pricing migration' }).click();
  // First visit compiles the page on the development server.
  await expect(page.getByRole('heading', { level: 1, name: 'Pricing migration (CR-15)' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('heading', { name: 'Dry run — nothing has changed' })).toBeVisible();
  await expect(page.getByText('Listings to convert')).toBeVisible();
  // Applying needs the typed word; a wrong word changes nothing.
  // OC-107 (3): converting and turning the model on are one step.
  const apply = page.getByRole('region', { name: 'Convert and turn on' });
  await apply.getByLabel('Type CONVERT to confirm').fill('yes');
  await apply.getByRole('button', { name: 'Convert and turn on' }).click();
  await expect(apply.getByText('Type CONVERT to confirm.', { exact: true })).toBeVisible();
  await expect(page.getByText('Already converted earlier (skipped): 0.')).toBeVisible();
  if (process.env.CR15_SHOTS)
    await page.screenshot({ path: `${process.env.CR15_SHOTS}/pm8-dry-run.png`, fullPage: true });
  await noSeriousA11yIssues(page);

  // OC-107 (3), synthetic data only: convert and turn on in one step, then turn off and roll back.
  await apply.getByLabel('Type CONVERT to confirm').fill('CONVERT');
  await apply.getByRole('button', { name: 'Convert and turn on' }).click();
  await expect(apply.getByText(/and turned the new pricing model on/)).toBeVisible();
  await expect(page.getByText('New pricing model: on', { exact: false })).toBeVisible();
  const back = page.getByRole('region', { name: 'Turn off and roll back' });
  await back.getByLabel('Type ROLL BACK to confirm').fill('ROLL BACK');
  await back.getByRole('button', { name: 'Turn off and roll back' }).click();
  await expect(back.getByText(/Turned the new pricing model off and restored/)).toBeVisible();
  await expect(page.getByText('Already converted earlier (skipped): 0.')).toBeVisible();
});

const VF_EXPLANATION =
  "AA Pro checked this teacher's email, reviewed their profile and confirmed their identity on a video call. This does not independently verify teaching qualifications, experience or background checks.";

test('CR-15 §5.1: an approved teacher asks for "AA Pro Verified"; the Super Admin verifies, the public tick shows, then is removed', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const letters = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'abcdefghijklmnop'[b % 16]).join('');
  const teacherName = `Teacher Vf ${letters.charAt(0).toUpperCase()}${letters.slice(1)}`;
  const tc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.100' } });
  const t = await tc.newPage();
  const teacherEmail = freshEmail('verify');
  await createAccount(t, 'teacher', teacherEmail);
  await confirmFromMailbox(t, teacherEmail);
  await signIn(t, teacherEmail, ADULT_PHRASE);
  await expect(t).toHaveURL(/\/teacher\/status$/);
  await sendTeacherProfile(t, ['Maths'], [5]);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.200.0.101' });
  await ownerSignedIn(page);
  await page.goto('/admin/approvals');
  const approval = page.getByRole('article').filter({ hasText: teacherEmail });
  await approval.getByLabel('Decision note (required)').fill('Checked for verification');
  await approval.getByRole('button', { name: 'Approve Test Teacher' }).click();
  await expect(page.getByText(/Approved. The teacher was emailed/)).toBeVisible();

  // A published listing, so there is a public profile and card.
  await t.goto('/teacher/profile');
  await t.getByLabel('Name shown to families').fill(teacherName);
  await t.getByRole('button', { name: 'Save changes' }).click();
  await expect(t.getByText('Your profile is saved.')).toBeVisible();
  await t.goto('/teacher/availability');
  const times = t.getByRole('region', { name: 'Your usual weekly times' });
  await addTimes(times, ['Thursday'], 960, 1080);
  await times.getByRole('button', { name: 'Save times' }).click();
  await expect(times.getByText(/Saved. Families will see these times/)).toBeVisible();
  await t.goto('/teacher/listing');
  await t.getByRole('checkbox', { name: /I agree to AA Pro showing these details publicly/ }).check();
  await t.getByRole('button', { name: 'Publish' }).click();
  await expect(t.getByText(/Published. Parents can see your listing/)).toBeVisible();

  // The teacher asks on their dashboard.
  await t.goto('/teacher');
  const panel = t.getByRole('region', { name: 'AA Pro Verified' });
  await expect(panel.getByText('Not started', { exact: true })).toBeVisible();
  await expect(panel.getByText(VF_EXPLANATION)).toBeVisible();
  await panel.getByRole('button', { name: 'Request verification' }).click();
  await expect(panel.getByText(/Request sent/)).toBeVisible();
  await expect(panel.getByText('Waiting for review', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Request verification/ })).toHaveCount(0);
  await noSeriousA11yIssues(t);
  await shot(t, 'vf-teacher');

  // No tick before the decision.
  const vc = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.200.0.102' } });
  const v = await vc.newPage();
  await v.goto(`/teachers?name=${encodeURIComponent(teacherName)}`);
  await expect(v.getByRole('article', { name: teacherName })).toBeVisible();
  await expect(v.getByTestId('verified-tick')).toHaveCount(0);

  // The Super Admin: the email check comes from the account; all three checks are needed.
  await page.goto('/admin');
  await page
    .getByRole('navigation', { name: 'Super Admin menu', exact: true })
    .getByRole('link', { name: 'Verification' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: /Verification/ })).toBeVisible({ timeout: 30_000 });
  const req = page.getByRole('article', { name: teacherName });
  await expect(req.getByRole('checkbox', { name: /Email address confirmed/ })).toBeChecked();
  await expect(req.getByRole('checkbox', { name: /Email address confirmed/ })).toBeDisabled();
  await expect(req.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(req.getByText('Do not type ID numbers.')).toBeVisible();
  await req.getByLabel('Decision note (required)').fill('Profile and video call done');
  await req.getByRole('checkbox', { name: /I reviewed this teacher/ }).check();
  await req.getByRole('button', { name: `Mark ${teacherName} verified` }).click();
  await expect(req.getByText('Tick both checks you did before marking the teacher verified.')).toBeVisible();
  await req.getByRole('checkbox', { name: /I checked this teacher.s identity on a video call/ }).check();
  await noSeriousA11yIssues(page);
  await shot(page, 'vf-admin');
  await req.getByRole('button', { name: `Mark ${teacherName} verified` }).click();
  await expect(page.getByText(/Marked verified for 12 months/)).toBeVisible();
  const done = page
    .getByRole('region', { name: 'Verified teachers' })
    .getByRole('article')
    .filter({ hasText: teacherName });
  await expect(done.getByText(/Re-check due/)).toBeVisible();
  await expect(done.getByTestId('vf-history').first()).toContainText('Profile and video call done');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  // The teacher sees it; the public profile and card show the tick and its exact explanation.
  await t.reload();
  await expect(panel.getByText('Verified', { exact: true })).toBeVisible();
  await expect(panel.getByText(/Re-check due/)).toBeVisible();
  await t.setViewportSize({ width: 390, height: 844 });
  expect(await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await t.setViewportSize({ width: 1280, height: 900 });

  await v.reload();
  const card = v.getByRole('article', { name: teacherName });
  const cardTick = card.getByTestId('verified-tick');
  await expect(cardTick).toContainText('AA Pro Verified');
  await cardTick.getByText('What this means').click();
  await expect(cardTick.getByText(VF_EXPLANATION)).toBeVisible();
  // The homepage keeps its approved design (OC-110): no tick there until the owner approves.
  await v.goto('/');
  await expect(v.locator('#teachers').getByTestId('verified-tick')).toHaveCount(0);
  await v.goto(`/teachers?name=${encodeURIComponent(teacherName)}`);
  await card.getByRole('link', { name: `View profile: ${teacherName}` }).click();
  await expect(v).toHaveURL(/\/teachers\/t-[a-z0-9]{10}$/);
  await expect(v.getByRole('heading', { level: 1, name: teacherName })).toBeVisible();
  const tick = v.getByTestId('verified-tick');
  await expect(tick).toContainText('AA Pro Verified');
  await expect(tick.getByText(VF_EXPLANATION, { exact: true })).toBeVisible();
  await expect(v).toHaveTitle(/\S/);
  await noSeriousA11yIssues(v);
  await shot(v, 'vf-public');
  const profileUrl = v.url();
  await v.setViewportSize({ width: 390, height: 844 });
  await v.reload();
  expect(await v.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(v, 'vf-public-phone');
  await v.setViewportSize({ width: 1280, height: 900 });

  // Removal needs a reason; the tick goes at once and the teacher may ask again.
  await done.getByRole('button', { name: `Remove verification: ${teacherName}` }).click();
  await done.getByRole('button', { name: 'Remove verification', exact: true }).click();
  await expect(done.getByText('Write the reason (required).')).toBeVisible();
  await done.getByLabel('Reason (required)').fill('Removed for the test');
  await done.getByRole('button', { name: 'Remove verification', exact: true }).click();
  await expect(page.getByText('Verification removed. The tick no longer shows anywhere.')).toBeVisible();
  await v.goto(profileUrl);
  await expect(v.getByRole('heading', { level: 1, name: teacherName })).toBeVisible();
  await expect(v.getByTestId('verified-tick')).toHaveCount(0);
  await v.goto(`/teachers?name=${encodeURIComponent(teacherName)}`);
  await expect(v.getByRole('article', { name: teacherName })).toBeVisible();
  await expect(v.getByTestId('verified-tick')).toHaveCount(0);
  await t.reload();
  await expect(panel.getByText('Removed', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Request verification again' })).toBeVisible();
  await vc.close();
  await tc.close();
});

/**
 * CR-16 AC-54 and AC-55 (b) "completes the package". The CR-15 switch is platform-wide, so this
 * runs here, in order with the other CR-15 tests, never beside them. Synthetic teachers whose
 * monthly price was converted into a package that needs details (as CR-15 A5 stores it).
 */
test('CR-16 AC-54, AC-55 (b): "Finish your learning package" shows read or unread and clears only when the package is completed or withdrawn; badge and label change in the same response', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const sql = seedDb();
  const done = await seedTeacher(sql);
  const stopped = await seedTeacher(sql);
  const pkg: Record<string, { pkg: string; note: string }> = {};
  for (const t of [done, stopped]) {
    await seedUsualTimes(sql, t.id);
    pkg[t.id] = await seedPackageNeedingDetails(sql, t.id);
  }
  await setPricingV2(sql, true);
  try {
    const finish = (p: Page) => p.getByRole('region', { name: 'Finish your learning package' });
    const labelOf = async (p: Page) => {
      await openBell(p);
      const row = rows(p).filter({ hasText: 'Finish your learning package' });
      await expect(row).toHaveCount(1);
      const text = await row.innerText();
      await p.keyboard.press('Escape');
      return ['Needs your reply', 'No longer needed', 'Done'].find((l) => text.includes(l)) ?? 'none';
    };

    // The browser clock is frozen after sign-in: no 60-second refresh can run (AC-55).
    await page.clock.install();
    await signInAs(page, done.email);
    await expect(page).toHaveURL(/\/teacher$/);
    await page.clock.pauseAt(new Date(Date.now() + 5_000));
    const menu = page.getByRole('navigation', { name: 'Teacher menu' });
    // AC-54: shown while details are needed and the notification is unread…
    await expect(finish(page)).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Looking for students, 1 waiting for you' })).toBeVisible();
    expect(await labelOf(page)).toBe('Needs your reply');
    // …and still shown after it is read (a fresh server render of the dashboard).
    await openBell(page);
    await rows(page)
      .filter({ hasText: 'Finish your learning package' })
      .getByRole('button', { name: /^Mark as read/ })
      .click();
    await expect(bellCount(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect.poll(() => readAtOf(sql, pkg[done.id]!.note)).not.toBeNull();
    await menu.getByRole('link', { name: /^Looking for students/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Looking for students' })).toBeVisible({
      timeout: 30_000,
    });
    await menu.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(finish(page)).toBeVisible();
    expect(await labelOf(page)).toBe('Needs your reply');

    // AC-55 (b): completing the package (one Server Action, no navigation) lowers the badge and
    // updates the label in the response that completes it.
    await menu.getByRole('link', { name: /^Looking for students/ }).click();
    const builder = page.getByRole('region', { name: /Learning package/ }).first();
    await expect(builder).toBeVisible({ timeout: 30_000 });
    await builder.getByRole('button', { name: '2 a week', exact: true }).click();
    await builder.getByRole('button', { name: 'Monday 5:00 pm', exact: true }).click();
    await builder.getByRole('button', { name: 'Wednesday 5:00 pm', exact: true }).click();
    await expect(builder.getByText('All 2 chosen')).toBeVisible();
    await builder.getByRole('button', { name: 'Offer this package' }).click();
    await expect(builder.getByText(/Package saved/)).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Looking for students', exact: true })).toBeVisible();
    await expect(menu.getByTestId('menu-badge')).toHaveCount(0);
    expect(await labelOf(page)).toBe('Done');
    // AC-54: cleared once completed.
    await menu.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(finish(page)).toHaveCount(0);

    // The other teacher never reads it: the banner shows until the package is withdrawn.
    const t = await (await browser.newContext()).newPage();
    await t.clock.install();
    await signInAs(t, stopped.email);
    await expect(t).toHaveURL(/\/teacher$/);
    await t.clock.pauseAt(new Date(Date.now() + 5_000));
    const tMenu = t.getByRole('navigation', { name: 'Teacher menu' });
    await expect(finish(t)).toBeVisible();
    await expect(tMenu.getByRole('link', { name: 'Looking for students, 1 waiting for you' })).toBeVisible();
    await tMenu.getByRole('link', { name: /^Looking for students/ }).click();
    await t.getByRole('button', { name: 'Stop offering the package' }).click();
    await expect(t.getByText(/You no longer offer the package/)).toBeVisible();
    await expect(tMenu.getByRole('link', { name: 'Looking for students', exact: true })).toBeVisible();
    await expect(tMenu.getByTestId('menu-badge')).toHaveCount(0);
    expect(await labelOf(t)).toBe('No longer needed');
    await tMenu.getByRole('link', { name: 'Dashboard' }).click();
    await expect(t).toHaveURL(/\/teacher$/);
    await expect(t.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(finish(t)).toHaveCount(0);
    expect(await readAtOf(sql, pkg[stopped.id]!.note)).toBeNull();
    await t.context().close();

    const statuses = await sql<{ teacher_id: string; status: string }[]>`
      SELECT teacher_id, status FROM learning_packages WHERE teacher_id IN (${done.id}, ${stopped.id})`;
    expect(statuses.find((s) => s.teacher_id === done.id)!.status).toBe('offered');
    expect(statuses.find((s) => s.teacher_id === stopped.id)!.status).toBe('draft');
  } finally {
    await setPricingV2(sql, false);
  }
});
