import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * F2 (owner, 25 Oct 2026, 18:38 IST): during private Friends & Family testing a real teacher sees
 * "Propose a meeting", labelled as not available yet. Its page says so honestly and asks for
 * feedback; nothing is proposed, sent or booked. The lesson rules don't mention proposing.
 * Invented accounts only. F2_SHOTS=<folder> saves screenshots for the owner's review.
 */

const sql = seedDb();
async function shot(page: Page, name: string) {
  if (!process.env.F2_SHOTS) return;
  mkdirSync(process.env.F2_SHOTS, { recursive: true });
  await page.screenshot({ path: `${process.env.F2_SHOTS}/${name}.png`, fullPage: true });
}

test('F2: Propose a meeting is visible, honestly not available yet, and changes nothing', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  const counts = async () =>
    (
      await sql<{ lessons: number; notes: number }[]>`
        SELECT (SELECT count(*)::int FROM lessons WHERE teacher_id = ${teacher.id}) AS lessons,
               (SELECT count(*)::int FROM notifications WHERE recipient_id IN (${parent.id}, ${teacher.id})) AS notes`
    )[0]!;
  const before = await counts();

  await signInAs(page, teacher.email);
  await page.goto('/teacher');
  const button = page.getByRole('link', { name: 'Propose a meeting (not available yet)' });
  await expect(button).toBeVisible();
  // The rules still describe only what exists.
  await expect(page.getByRole('region', { name: 'Lesson rules' })).not.toContainText(/propose/i);
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);
  await shot(page, `F2-teacher-home-${phone ? 'phone' : 'desktop'}`);

  // The first visit compiles the page on the local development server, so allow it time.
  await Promise.all([page.waitForURL(/\/teacher\/propose$/, { timeout: 60_000 }), button.click()]);
  await expect(page.getByRole('heading', { level: 1, name: 'Propose a meeting' })).toBeVisible();
  await expect(page.getByText('Not ready yet')).toBeVisible();
  await expect(
    page.getByText(
      /^Proposing a meeting isn’t available in AA Pro yet, and nothing is sent or booked from this page\./,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/We’d like your feedback: would you use this, and how would you want it to work\?/),
  ).toBeVisible();
  // No form or control that could look like it proposes anything.
  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.locator('main').getByRole('button')).toHaveCount(0);
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);
  await shot(page, `F2-propose-page-${phone ? 'phone' : 'desktop'}`);
  await page.getByRole('link', { name: 'Go to My schedule' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My schedule' })).toBeVisible();
  expect(await counts()).toEqual(before);

  // Still teachers only: a parent gets the usual "can't open this", not the page.
  const p = await (await page.context().browser()!.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/teacher/propose');
  await expect(p.getByText(/Proposing a meeting/)).toHaveCount(0);
  await p.context().close();
});
