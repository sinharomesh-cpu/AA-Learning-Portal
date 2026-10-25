import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedDb, seedParent } from './notificationSeed';

/**
 * Owner decision, 25 Oct 2026, 18:38 IST: while AA Pro sends no email, the one-time consent form
 * no longer offers the optional email-reminder box, and the server ignores that field even if a
 * crafted form sends it. The required consents, their wording and the notice version are
 * unchanged, and existing email_reminders records are kept. Invented accounts only; no email.
 */

const sql = seedDb();
const NOTICE_VERSION = '2026-10-draft';

test('the email-reminder box is gone, a sent field is ignored, and existing records are kept', async ({
  page,
}, info) => {
  const phone = info.project.name === 'phone';
  // An earlier parent who did agree to email reminders: that record must stay untouched.
  const earlier = await seedParent(sql, 'Ravi', 'Shah');
  for (const kind of ['guardian', 'ai_tutor', 'email_reminders'])
    await sql`INSERT INTO consents (account_id, kind, version, accepted_at)
              VALUES (${earlier.id}, ${kind}, ${NOTICE_VERSION}, now() - interval '1 day')`;

  const parent = await seedParent(sql, 'Anita', 'Shah');
  await signInAs(page, parent.email);
  await page.goto('/parent/children/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Before you add your child' })).toBeVisible();
  // Only the two required boxes; nothing about email.
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(2);
  await expect(page.getByRole('checkbox', { name: /email/i })).toHaveCount(0);
  await expect(page.getByText(/reminders by email/i)).toHaveCount(0);
  // The required wording is unchanged.
  await expect(
    page.getByText(
      'I am the parent or legal guardian, and I agree to AA Pro creating and managing an account for my child as described above.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "I agree that lesson context and my child's voice are processed during AI lessons, without storing raw audio.",
    ),
  ).toBeVisible();
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);

  // A crafted form that still sends emailReminders=yes.
  await page.evaluate(() => {
    const form = document.querySelector('main form');
    const extra = document.createElement('input');
    extra.type = 'hidden';
    extra.name = 'emailReminders';
    extra.value = 'yes';
    form?.appendChild(extra);
  });
  await page.getByRole('checkbox', { name: /parent or legal guardian/ }).check();
  await page.getByRole('checkbox', { name: /AI lessons/ }).check();
  await page.getByRole('button', { name: 'Agree and continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add a child' })).toBeVisible({ timeout: 60_000 });

  // Recorded: the two required consents under the same notice version, and no email consent.
  const mine = await sql<{ kind: string; version: string }[]>`
    SELECT kind, version FROM consents WHERE account_id = ${parent.id} ORDER BY kind`;
  expect(mine).toEqual([
    { kind: 'ai_tutor', version: NOTICE_VERSION },
    { kind: 'guardian', version: NOTICE_VERSION },
  ]);
  const [audit] = await sql<{ details: { version: string; emailReminders: boolean } }[]>`
    SELECT details FROM audit_events WHERE event_type = 'CHILD_CONSENT_GIVEN' AND actor_id = ${parent.id}`;
  expect(audit?.details).toMatchObject({ version: NOTICE_VERSION, emailReminders: false });

  // The earlier parent's records, including email_reminders, are unchanged.
  const theirs = await sql<
    { kind: string }[]
  >`SELECT kind FROM consents WHERE account_id = ${earlier.id} ORDER BY kind`;
  expect(theirs.map((r) => r.kind)).toEqual(['ai_tutor', 'email_reminders', 'guardian']);
});
