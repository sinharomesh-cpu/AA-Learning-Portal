import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { confirmFromMailbox, createAccount, freshEmail, PHRASE, signIn, choose } from './helpers';

/** WP2-4: child accounts end to end (M-02, M-06, M-07, M-08; G1-08 §3). */

const randomIp = () => {
  const n = () => Math.floor(Math.random() * 250) + 1;
  return `10.${n()}.${n()}.${n()}`;
};

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() });
});

async function noSeriousA11yIssues(page: Page) {
  // Next.js may stream the <title> in after first paint; wait for it before scanning.
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

async function signedInParent(page: Page) {
  const email = freshEmail('family');
  await createAccount(page, 'parent', email);
  await confirmFromMailbox(page, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/parent$/);
  return email;
}

async function addChild(page: Page, name: string, password = '') {
  await page.goto('/parent/children/new');
  if (await page.getByRole('heading', { level: 1, name: 'Before you add your child' }).isVisible()) {
    await page.getByRole('checkbox', { name: /parent or legal guardian/ }).check();
    await page.getByRole('checkbox', { name: /AI lessons/ }).check();
    await page.getByRole('button', { name: 'Agree and continue' }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Add a child' })).toBeVisible();
  await page.getByLabel('First name (shown in the app)').fill(name);
  await choose(page, 'Grade', 'Grade 5');
  await page.getByRole('checkbox', { name: 'Maths' }).check();
  await page.getByRole('checkbox', { name: 'English' }).check();
  await page.getByLabel('Username').fill(name);
  if (password) await page.getByLabel('Password (optional)').fill(password);
  await page.getByRole('button', { name: 'Add child' }).click();
  const card = page.getByTestId('child-credentials');
  await expect(card).toBeVisible();
  return {
    username: (await card.getByTestId('child-username').innerText()).trim(),
    password: (await card.getByTestId('child-password').innerText()).trim(),
  };
}

/** The child uses a separate browser, as on a different device. */
async function childPage(browser: Browser) {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': randomIp() } });
  return context.newPage();
}

async function childSignIn(page: Page, username: string, password: string) {
  await page.goto('/sign-in/child');
  await page.getByLabel('Your username').fill(username);
  await page.getByLabel('Your password').fill(password);
  await page.getByRole('button', { name: "Let's go" }).click();
}

test('a parent gives consent, adds a child, and the child signs in', async ({ page, browser }) => {
  await signedInParent(page);
  await page.goto('/parent/children/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Before you add your child' })).toBeVisible();
  await noSeriousA11yIssues(page);
  // "Agree and continue" does nothing until both required boxes are ticked.
  await page.getByRole('checkbox', { name: /parent or legal guardian/ }).check();
  await expect(page.getByRole('button', { name: 'Agree and continue' })).toHaveAttribute('aria-disabled', 'true');

  const creds = await addChild(page, 'Asha');
  expect(creds.username).toMatch(/^asha-\d{4}$/);
  expect(creds.password).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/);
  await noSeriousA11yIssues(page);

  await page.goto('/parent/children');
  await expect(page.getByRole('heading', { level: 2, name: 'Asha' })).toBeVisible();
  await page.goto('/parent');
  await expect(page.getByRole('heading', { name: 'Asha' })).toBeVisible();

  const kid = await childPage(browser);
  await childSignIn(kid, creds.username, creds.password);
  await expect(kid).toHaveURL(/\/student$/);
  await expect(kid.getByRole('heading', { level: 1 })).toContainText('Asha');
  await expect(kid.getByText('Maths')).toBeVisible();
  // A child cannot open parent pages.
  await kid.goto('/parent/children');
  await expect(kid.getByRole('heading', { level: 1 })).toHaveText('This page is for grown-ups');
  await kid.context().close();
});

test('wrong details answer the same for real and unknown usernames, and the 5th try locks', async ({
  page,
  browser,
}) => {
  // About 20 sign-in attempts; allow for slower CI machines.
  test.setTimeout(150_000);
  await signedInParent(page);
  const creds = await addChild(page, 'Ravi', ['ravi', 'reads', 'books'].join('-'));
  const kid = await childPage(browser);
  await kid.goto('/sign-in/child');
  await noSeriousA11yIssues(kid);

  await childSignIn(kid, `ghost-${Date.now() % 10000}`, PHRASE);
  const unknown = await kid.getByRole('main').getByRole('alert').innerText();
  await childSignIn(kid, creds.username, PHRASE);
  await expect(kid.getByRole('main').getByRole('alert')).toHaveText(unknown);
  expect(unknown).toBe("Oops, that didn't match. Check your username and password and try again.");

  for (let i = 0; i < 3; i++) await childSignIn(kid, creds.username, PHRASE);
  await childSignIn(kid, creds.username, PHRASE);
  const breakText = "Let's take a break. You can try again in 15 minutes, or ask your parent for help.";
  await expect(kid.getByRole('main').getByRole('status')).toHaveText(breakText);
  // Even the right password waits.
  await childSignIn(kid, creds.username, creds.password);
  await expect(kid.getByRole('main').getByRole('status')).toHaveText(breakText);
  // An unknown username locks in exactly the same way.
  const ghost = `nobody-${Date.now() % 10000}`;
  for (let i = 0; i < 5; i++) await childSignIn(kid, ghost, PHRASE);
  await expect(kid.getByRole('main').getByRole('status')).toHaveText(breakText);

  // The parent sees the lock, confirms their password and unlocks.
  await page.goto('/parent/children');
  await page.getByRole('link', { name: "Edit Ravi's profile" }).click();
  await expect(page.getByText(/Locked · try again at/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlock now' })).toBeVisible();
  await page.getByRole('button', { name: 'Unlock now' }).click();
  await expect(page.getByText('Ravi can sign in again now.')).toBeVisible();

  await childSignIn(kid, creds.username, creds.password);
  await expect(kid).toHaveURL(/\/student$/);
  await kid.context().close();
});

test('a reset needs the parent password, shows the new one once and signs the child out', async ({ page, browser }) => {
  await signedInParent(page);
  const creds = await addChild(page, 'Neel');
  const kid = await childPage(browser);
  await childSignIn(kid, creds.username, creds.password);
  await expect(kid).toHaveURL(/\/student$/);

  // The parent signed in moments ago, so the password check is fresh (5-minute rule); the
  // stale case and the 5-wrong-tries sign-out are covered in tests/db/children.test.ts.
  await page.goto('/parent/children');
  await page.getByRole('link', { name: "Edit Neel's profile" }).click();
  // Wait for the profile page itself, or the scan can run while the page is still changing.
  await expect(page.getByLabel('New password for Neel (optional)')).toBeVisible();
  await noSeriousA11yIssues(page);
  await page.getByLabel('New password for Neel (optional)').fill(['neel', 'likes', 'kites'].join('-'));
  await page.getByRole('button', { name: "Reset Neel's password" }).click();
  const shown = page.getByTestId('child-credentials');
  await expect(shown.getByTestId('child-password')).toHaveText(['neel', 'likes', 'kites'].join('-'));

  // The child's open session ends at once.
  await kid.reload();
  await expect(kid).toHaveURL(/\/sign-in/);
  await childSignIn(kid, creds.username, creds.password);
  await expect(kid.getByRole('main').getByRole('alert')).toContainText("didn't match");
  await childSignIn(kid, creds.username, ['neel', 'likes', 'kites'].join('-'));
  await expect(kid).toHaveURL(/\/student$/);

  // Pause stops sign-in; resume allows it again.
  await page.goto(`/parent/children`);
  await page.getByRole('link', { name: "Edit Neel's profile" }).click();
  await page.getByRole('button', { name: 'Pause account' }).click();
  await expect(page.getByText(/Neel's account is paused/)).toBeVisible();
  await kid.reload();
  await expect(kid).toHaveURL(/\/sign-in/);
  await childSignIn(kid, creds.username, ['neel', 'likes', 'kites'].join('-'));
  await expect(kid.getByRole('main').getByRole('alert')).toHaveText('Your account is paused. Please ask your parent.');
  await page.getByRole('button', { name: 'Resume account' }).click();
  await expect(page.getByText('Neel can sign in again.')).toBeVisible();
  await kid.context().close();
});

test("another parent cannot open a family's child", async ({ page, browser }) => {
  await signedInParent(page);
  await addChild(page, 'Tara');
  await page.goto('/parent/children');
  await page.getByRole('link', { name: "Edit Tara's profile" }).click();
  await expect(page.getByRole('heading', { level: 1, name: "Edit Tara's profile" })).toBeVisible();
  const childUrl = new URL(page.url()).pathname;

  const other = await browser.newPage({ extraHTTPHeaders: { 'x-forwarded-for': randomIp() } });
  await signedInParent(other);
  await other.goto(childUrl);
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await other.goto(`${childUrl}/restrictions`);
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await other.goto('/parent/children');
  await expect(other.getByRole('heading', { name: 'Tara' })).toHaveCount(0);
  await other.close();
});

test('profile edits are saved', async ({ page }) => {
  await signedInParent(page);
  await addChild(page, 'Ishan');
  await page.goto('/parent/children');
  await page.getByRole('link', { name: "Edit Ishan's profile" }).click();
  await choose(page, 'Grade', 'Grade 6');
  await page.getByRole('checkbox', { name: 'Science' }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await page.goto('/parent/children');
  await expect(page.getByText('Grade 6').first()).toBeVisible();
  await page.getByRole('link', { name: "Edit Ishan's profile" }).click();
  await expect(page.getByRole('checkbox', { name: 'Science' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Grade: Grade 6' })).toBeVisible();
});

test('private files answer "not found" to anyone not allowed, and are never cached (CR-07 H-1)', async ({ page }) => {
  const missing = '/files/00000000-0000-4000-8000-000000000000';
  const signedOut = await page.request.get(missing);
  expect(signedOut.status()).toBe(404);
  expect(signedOut.headers()['cache-control']).toBe('private, no-store');
  await signedInParent(page);
  // OC-96: the parent sees their own storage use.
  await page.goto('/parent/content');
  await expect(page.getByTestId('storage-used')).toHaveText('0 MB of 200 MB used');
  await noSeriousA11yIssues(page);
  for (const path of [missing, '/files/not-an-id']) {
    const r = await page.request.get(path);
    expect(r.status()).toBe(404);
    expect(await r.text()).toBe(await signedOut.text());
    expect(r.headers()['cache-control']).toBe('private, no-store');
  }
  // H-2a: pieces of an upload are accepted only from this site, with the upload header.
  const base = new URL(page.url()).origin;
  const piece = `/files/upload?upload=${crypto.randomUUID()}&piece=0&of=1&name=a.pdf`;
  const pdf = '%PDF-1.4\n%%EOF\n';
  expect((await page.request.post(piece, { data: pdf, headers: { origin: base } })).status()).toBe(403);
  expect(
    (
      await page.request.post(piece, { data: pdf, headers: { origin: 'https://evil.example', 'x-aa-upload': '1' } })
    ).status(),
  ).toBe(403);
  const ok = await page.request.post(piece, {
    data: pdf,
    headers: { origin: base, 'x-aa-upload': '1', 'content-type': 'application/octet-stream' },
  });
  expect(await ok.json()).toEqual({ ok: true, received: 1, total: 1, complete: true });
  expect((await page.request.get(`${missing}?outline=1`)).status()).toBe(404);
  await page.goto(`${missing}/view`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
});
