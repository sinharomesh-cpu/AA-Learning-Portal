import { expect, type Page, test } from '@playwright/test';
import { childSignIn, expectNoHorizontalScroll, noSeriousA11yIssues, signInAs } from './notificationHelpers';
import { seedActiveLink, seedChild, seedDb, seedParent, seedTeacher } from './notificationSeed';

/**
 * TL-6, information-only chapter display (owner authorisation, 30 Oct 2026, 20:25 IST), desktop and
 * phone: the child's today card, the parent's home ("This week" on desktop, the child's card on a
 * phone) and the teacher's home show a lesson's chapters in the calendars' words. The child sees
 * titles of confirmed lessons only (D-TLS-10); the teacher also sees "No longer shared" (D-TLS-19).
 * No links, no actions. Invented accounts only.
 */
const sql = seedDb();
async function check(page: Page, phone: boolean) {
  await noSeriousA11yIssues(page);
  if (phone) await expectNoHorizontalScroll(page);
}

/** A lesson with chapters, written with the rules skipped for this transaction only. */
async function lesson(
  t: string,
  c: string,
  p: string,
  fromMin: number,
  status: 'confirmed' | 'requested',
  chapters: Array<{ chapter?: string; topic?: string; label: string }>,
) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [l] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
      SELECT ${t}, ${c}, ${p}, 'maths', s, 30, s + interval '30 minutes', r, least(r + interval '48 hours', s - interval '2 hours'),
             ${status}, ${status === 'confirmed' ? sql`r + interval '1 minute'` : null}, 'INR', 60000, 30000, 'listed'
      FROM (SELECT s, CASE WHEN ${status} = 'confirmed' THEN s - interval '3 days' ELSE now() - interval '1 hour' END AS r
            FROM (SELECT date_trunc('minute', now()) + make_interval(mins => ${fromMin}) AS s) y) x RETURNING id`;
    for (const [i, ch] of chapters.entries())
      await tx`INSERT INTO lesson_chapters (lesson_id, position, book_chapter_id, topic, source, label)
               VALUES (${l!.id}, ${i + 1}, ${ch.chapter ?? null}, ${ch.topic ?? null}, 'requested', ${ch.label})`;
    return l!.id;
  });
}

test('TL-6: chapters on the child’s today card, the parent’s home and the teacher’s home', async ({
  browser,
}, info) => {
  test.setTimeout(180_000);
  const phone = info.project.name === 'phone';
  const parent = await seedParent(sql, 'Anita', 'Shah');
  const teacher = await seedTeacher(sql, 'approved', 'Ms Priya Rao');
  const child = await seedChild(sql, parent.id, 'Kiran');
  // "Today" must still be today 30 minutes from now in the child's zone, whatever the hour the
  // test runs: if India's day ends too soon, the invented child lives in a zone where it doesn't.
  const zone = ['Asia/Kolkata', 'UTC', 'America/Los_Angeles'].find((z) => {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: 'numeric', hourCycle: 'h23' }).format(new Date()),
    );
    return hour >= 1 && hour <= 22;
  })!;
  await sql`UPDATE accounts SET time_zone = ${zone} WHERE id = ${child.id}`;
  await seedActiveLink(sql, teacher.id, child.id, parent.id);
  const book = async (title: string, assigned: boolean) => {
    const [b] = await sql<{ id: string }[]>`
      INSERT INTO books (owner_id, title, subject, form, status) VALUES (${parent.id}, ${title}, 'maths', 'chapter_files', 'published')
      RETURNING id`;
    const [ch] = await sql<{ id: string }[]>`
      INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, 1, 'Fractions') RETURNING id`;
    if (assigned) await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${child.id})`;
    return ch!.id;
  };
  const shared = await book('Maths Practice', true);
  const unshared = await book('Old Workbook', false); // not shared with the child: the teacher can't view it
  // Later today (the child's card): a shared chapter. Tomorrow: a chapter no longer shared.
  await lesson(teacher.id, child.id, parent.id, 30, 'confirmed', [
    { chapter: shared, label: 'Maths Practice · 1. Fractions' },
  ]);
  await lesson(teacher.id, child.id, parent.id, 24 * 60 + 60, 'confirmed', [
    { chapter: unshared, label: 'Old Workbook · 1. Fractions' },
  ]);
  // An open request (in 3 hours) with a topic: the child never sees it.
  await lesson(teacher.id, child.id, parent.id, 180, 'requested', [{ topic: 'Long division', label: 'Long division' }]);

  // The child: today's card shows the confirmed lesson's chapter title; nothing from the request.
  const k = await (await browser.newContext()).newPage();
  await childSignIn(k, child.username, child.password);
  await k.goto('/student');
  const card = k.getByRole('region', { name: `Maths with ${teacher.name}` });
  await expect(card.getByTestId('home-chapters')).toHaveText('Chapter: Maths Practice · 1. Fractions');
  await expect(k.getByText('Long division')).toHaveCount(0);
  await expect(k.getByTestId('home-chapter-not-shared')).toHaveCount(0);
  await expect(card.getByRole('link', { name: /Fractions/ })).toHaveCount(0); // no links
  await check(k, phone);

  // The parent: the same words beside each lesson; the topic of the open request too.
  const p = await (await browser.newContext()).newPage();
  await signInAs(p, parent.email);
  await p.goto('/parent');
  const lines = phone
    ? p.getByRole('article', { name: 'Kiran' }).getByTestId('home-chapters')
    : p.getByRole('region', { name: 'This week' }).getByTestId('home-chapters');
  await expect(lines.filter({ hasText: 'Chapter: Maths Practice · 1. Fractions' })).toHaveCount(1);
  if (!phone) {
    // The desktop table lists the whole week; the phone card shows the next two lessons.
    await expect(lines.filter({ hasText: 'Chapter: Old Workbook · 1. Fractions' })).toHaveCount(1);
  }
  await expect(lines.filter({ hasText: 'Topic: Long division' })).toHaveCount(1);
  await expect(p.getByTestId('home-chapter-not-shared')).toHaveCount(0); // sharing is the teacher's view
  await check(p, phone);

  // The teacher: chapter labels and visibility, as on My schedule.
  const t = await (await browser.newContext()).newPage();
  await signInAs(t, teacher.email);
  await t.goto('/teacher');
  const teacherLines = t.getByTestId('home-chapters');
  await expect(teacherLines.filter({ hasText: 'Chapter: Maths Practice · 1. Fractions' })).toHaveCount(1);
  const old = teacherLines.filter({ hasText: 'Old Workbook' });
  await expect(old).toHaveText('Chapter: Old Workbook · 1. Fractions · No longer shared');
  await expect(teacherLines.filter({ hasText: 'Maths Practice' }).getByTestId('home-chapter-not-shared')).toHaveCount(
    0,
  );
  await check(t, phone);
  for (const c of [k, p, t]) await c.context().close();
});
