import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { type Sql, seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * CR-17 PR 5 (boards W3, W4, HW4 to HW8) with real sign-in, desktop and phone: a teacher assigns
 * a worksheet to one student, the child answers and hands it in, the teacher marks and releases,
 * the child and parent see the marks; a future date keeps it hidden (W-7). Invented accounts only.
 * HW_SHOTS=<folder> saves review screenshots.
 */

const sql = seedDb();
const shots = process.env.HW_SHOTS;
async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

/** A Ready maths worksheet in the teacher's library: two automatic questions and one written answer. */
async function seedWorksheet(db: Sql, teacher: string, title: string): Promise<string> {
  const [w] = await db<{ id: string }[]>`
    INSERT INTO worksheets (teacher_id, kind, title, grade, board, subject, chapter, status)
    VALUES (${teacher}, 'exercise', ${title}, 5, 'CBSE', 'maths', 'Chapter 4 (sample)', 'draft') RETURNING id`;
  const id = w!.id;
  await db`INSERT INTO worksheet_questions (worksheet_id, position, type, prompt, data, answer_key, points) VALUES
    (${id}, 1, 'single_choice', 'Which is bigger?', ${db.json({ options: ['1/2', '1/4'] })}, ${db.json({ correct: 0 })}, 1),
    (${id}, 2, 'true_false', '2/4 is the same as 1/2.', '{}', ${db.json({ correct: true })}, 1),
    (${id}, 3, 'short_answer', 'Explain how you compared them.', ${db.json({ maxLength: 1000 })}, NULL, 2)`;
  await db`UPDATE worksheets SET status = 'ready' WHERE id = ${id}`;
  return id;
}

test('assign, answer, hand in, mark, release and see the marks', async ({ browser }, info) => {
  const phone = info.project.name === 'phone';
  const parent = await seedParent(sql);
  const teacher = await seedTeacher(sql);
  const child = await seedChild(sql, parent.id);
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  await sql`UPDATE student_profiles SET curriculum = 'CBSE', grade = 5 WHERE account_id = ${child.id}`;
  await seedWorksheet(sql, teacher.id, 'Fractions check-up');
  await seedWorksheet(sql, teacher.id, 'Fractions — later');

  // Teacher assigns today, and a second worksheet for a later date.
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher/homework');
  await t.getByRole('link', { name: 'Assign Fractions check-up', exact: true }).click();
  await expect(t.getByRole('heading', { level: 1 })).toContainText('Assign “Fractions check-up”');
  await t.getByRole('radio', { name: new RegExp(child.name) }).check();
  await noSeriousA11yIssues(t);
  if (phone) await expectNoHorizontalScroll(t);
  await shot(t, phone ? 'W3-assign-phone' : 'W3-assign-desktop');
  await t.getByRole('button', { name: `Assign to ${child.name}` }).click();
  await expect(t.getByText('Assigned. The student sees it under My homework')).toBeVisible();

  await t.getByRole('link', { name: 'Assign Fractions — later', exact: true }).click();
  await t.getByRole('radio', { name: new RegExp(child.name) }).check();
  await t.getByRole('radio', { name: 'On a later date' }).check();
  const later = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date(Date.now() + 3 * 86_400_000),
  );
  await t.getByLabel('Assignment date').fill(later);
  await t.getByRole('button', { name: `Assign to ${child.name}` }).click();
  await expect(t.getByText('Scheduled.')).toBeVisible();

  // The child sees only today's homework, answers and hands it in.
  const k = await (await browser.newContext()).newPage();
  await childSignIn(k, child.username, child.password);
  await k.goto('/student/homework');
  await expect(k.getByRole('link', { name: /Fractions check-up/ })).toBeVisible();
  await expect(k.getByText('Fractions — later')).toHaveCount(0);
  await k.getByRole('link', { name: /Fractions check-up/ }).click();
  await k.getByRole('radio', { name: '1/2' }).check();
  await k.getByRole('radio', { name: 'True' }).check();
  await k.getByLabel('Question 3, your answer').fill('I made the bottoms the same.');
  await expect(k.getByText('Saved.')).toBeVisible();
  await noSeriousA11yIssues(k);
  if (phone) await expectNoHorizontalScroll(k);
  await shot(k, phone ? 'HW6-player-phone' : 'HW6-player-desktop');
  await k.getByRole('button', { name: 'Hand in my homework' }).click();
  await k.getByRole('dialog').getByRole('button', { name: 'Yes, hand it in' }).click();
  await expect(k.getByText('Handed in. Well done!')).toBeVisible();
  await expect(k.getByRole('button', { name: 'Hand in my homework' })).toHaveCount(0);

  // The teacher marks the written answer and releases.
  await t.goto('/teacher/homework/review');
  await t.getByRole('link', { name: `Mark Fractions check-up for ${child.name}` }).click();
  await expect(t.getByText('Automatic: 1')).toHaveCount(2);
  await t.getByLabel('Marks', { exact: true }).fill('2');
  await t.getByLabel('Feedback for the student (optional)').fill('Well explained.');
  await noSeriousA11yIssues(t);
  if (phone) await expectNoHorizontalScroll(t);
  await shot(t, phone ? 'HW4-mark-phone' : 'HW4-mark-desktop');
  await t.getByRole('button', { name: 'Save and release' }).click();
  await expect(t.getByText('Marked and released.')).toBeVisible();

  // The child and the parent see the marks.
  await k.goto('/student/homework');
  await expect(k.getByText('Marks: 4 out of 4')).toBeVisible();
  await k.getByRole('link', { name: /Fractions check-up/ }).click();
  await expect(k.getByRole('heading', { name: 'Your marks: 4 out of 4' })).toBeVisible();
  await expect(k.getByText('Well explained.')).toBeVisible();
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent/homework');
  await expect(p.getByText('Marks: 4 out of 4')).toBeVisible();
  await expect(p.getByText('Fractions — later')).toHaveCount(0);
  await noSeriousA11yIssues(p);

  // W4: the teacher's results on the student's page.
  await t.goto(`/teacher/students/${child.id}`);
  const results = t.getByRole('region', { name: 'Results' });
  await expect(results).toContainText('4 / 4');
  await expect(results).toContainText('Reviewed: 1');

  // W-11: once the parent removes the teacher, the teacher can't open it any more.
  await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now()
            WHERE teacher_id = ${teacher.id} AND student_id = ${child.id}`;
  await t.goto('/teacher/homework/review');
  await expect(t.getByText('Fractions check-up')).toHaveCount(0);
  for (const c of [t, k, p]) await c.context().close();
});
