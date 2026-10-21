import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { choose } from './helpers';
import { expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * CR-17 PR 4 (boards W1, W2): the teacher's worksheet library with real sign-in, on desktop and
 * phone. WS-1 (save, edit, duplicate, archive, restore), WS-3/WS-4 (plan and Mark ready),
 * WS-5 (filters), the student preview without answers (AS-7 groundwork) and SEC-1 (another
 * teacher gets "not found"). Invented accounts only. WS_SHOTS=<folder> saves review screenshots.
 */

const sql = seedDb();
const shots = process.env.WS_SHOTS;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

test('a teacher writes, checks, previews and manages a worksheet', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const teacher = await seedTeacher(sql);
  await signInAs(page, teacher.email);
  await page.goto('/teacher/homework');
  await expect(page.getByRole('heading', { level: 1, name: 'Homework' })).toBeVisible();
  await expect(page.getByText(/No worksheets yet/)).toBeVisible();
  await page.getByRole('link', { name: 'New worksheet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New worksheet' })).toBeVisible();

  // Details (W-3 labels).
  await page.getByLabel('Title', { exact: true }).fill('Plants and cells — check-up');
  await choose(page, 'Grade', 'Grade 5');
  await choose(page, 'Board', 'CBSE');
  await choose(page, 'Subject', 'Science');
  await page.getByLabel('Chapter (optional)').fill('Chapter 2 (sample)');
  await page.getByLabel('Topic (optional)').fill('Parts of a plant');
  await page.getByRole('radio', { name: 'Medium' }).check();

  // The plan makes empty questions only.
  await page.getByLabel('How many: True / false').fill('1');
  await page.getByLabel('How many: Short written answer').fill('1');
  await page.getByRole('button', { name: /Add 2 empty questions/ }).click();
  await expect(page.getByTestId('question')).toHaveCount(2);
  await expect(page.getByText('Empty: write this question.')).toHaveCount(2);
  if (!phone) await shot(page, 'W2-builder-plan');

  // Mark ready is refused while questions are empty.
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await expect(page.getByRole('alert').first()).toContainText("Can't mark it ready yet");
  await expect(page.getByTestId('question').first()).toContainText('Write the question.');

  // Fill them in.
  await page.getByLabel('Question 1', { exact: true }).fill('Roots take in water from the soil.');
  await page.getByRole('radio', { name: 'True', exact: true }).check();
  await page.getByLabel('Question 2', { exact: true }).fill('In two sentences, explain why leaves are green.');
  await page.getByRole('button', { name: 'Fill in the blanks' }).click();
  await page.getByLabel('Question 3: the sentence').fill('Plants take in [carbon dioxide|CO2] and give out [oxygen].');
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await expect(page).toHaveURL(/\/teacher\/homework\/[0-9a-f-]{36}\?saved=ready/);
  await expect(page.getByText('Saved and marked ready. You can assign it now.')).toBeVisible();
  const id = page.url().match(/homework\/([0-9a-f-]{36})/)![1]!;

  // Preview as a student: no answers anywhere on the page.
  // (Loaded fresh: the builder page itself legitimately holds the teacher's answer key.)
  await expect(page.getByRole('link', { name: 'Preview as a student' })).toHaveAttribute(
    'href',
    `/teacher/homework/${id}/preview`,
  );
  const res = await page.goto(`/teacher/homework/${id}/preview`);
  const body = (await res?.text()) ?? '';
  await expect(page.getByRole('heading', { level: 1, name: 'Plants and cells — check-up' })).toBeVisible();
  for (const secret of ['carbon dioxide', 'CO2', 'oxygen']) {
    expect(body).not.toContain(secret);
    expect(await page.content()).not.toContain(secret);
  }
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);

  // Library card, duplicate, archive, restore.
  await page.goto('/teacher/homework');
  const original = () =>
    page
      .getByTestId('worksheet-card')
      .filter({ has: page.getByRole('heading', { name: 'Plants and cells — check-up', exact: true }) });
  const card = original();
  await expect(card).toContainText('Ready');
  await expect(card).toContainText('Exercise · 3 questions · 4 marks');
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);
  await shot(page, phone ? 'W1-library-phone' : 'W1-library-desktop');
  await card.getByRole('button', { name: 'Duplicate Plants and cells — check-up', exact: true }).click();
  await expect(page.getByText('Copy saved as a draft. Nothing was assigned.')).toBeVisible();
  await expect(page.getByTestId('worksheet-card').filter({ hasText: 'Copy of Plants and cells' })).toContainText(
    'Draft',
  );
  await card.getByRole('button', { name: 'Archive Plants and cells — check-up', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  await expect(original()).toHaveCount(0);
  await page.getByRole('link', { name: /^Archived · 1/ }).click();
  await page.getByRole('button', { name: /^Restore / }).click();
  await page.getByRole('link', { name: /^Ready · 1/ }).click();
  await expect(page.getByTestId('worksheet-card')).toHaveCount(1);

  // Search.
  await page.getByLabel('Search by title or topic').fill('parts of a');
  await page.getByRole('button', { name: 'Show worksheets' }).click();
  await expect(page.getByTestId('worksheet-card')).toHaveCount(1);

  // SEC-1: another teacher gets "not found" for this worksheet and its preview.
  const other = await seedTeacher(sql);
  const parent = await seedParent(sql);
  await seedChild(sql, parent.id);
  await page.context().clearCookies();
  await signInAs(page, other.email);
  for (const path of [`/teacher/homework/${id}`, `/teacher/homework/${id}/preview`]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
    await expect(page.getByText('Plants and cells')).toHaveCount(0);
  }
  await page.goto('/teacher/homework');
  await expect(page.getByText(/No worksheets yet/)).toBeVisible();
});
