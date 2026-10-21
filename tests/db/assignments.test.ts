import { afterAll, describe, expect, it } from 'vitest';
import {
  assignOptions,
  assignWorksheet,
  changeAssignmentDates,
  getForReview,
  getHomeworkForStudent,
  listHomeworkForParent,
  listHomeworkForStudent,
  listTeacherHomework,
  noteVisibleHomework,
  releaseResults,
  saveAnswers,
  saveReview,
  studentResults,
  submitExercise,
  wallTimeToUtc,
  withdrawAssignment,
} from '@/server/assignments';
import { saveWorksheet } from '@/server/worksheets';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * CR-17 PR 5: assigning one worksheet to one student, answering, marking, review, release and
 * results (readiness pack AS-1 to AS-13, SEC-2 to SEC-7, SEC-10, SEC-21). Invented accounts only.
 */
const sql = testDb();
afterAll(() => sql.end());

const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

async function teacher(name = 'Teacher A. Rao') {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', 'active', ${`t-${uniq()}@example.com`}, ${name}, 'x') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${row!.id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  return row!.id;
}

async function family(name = 'Kiran', grade = 5, board = 'CBSE') {
  const parent = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']}, grade = ${grade}, curriculum = ${board}
            WHERE account_id = ${child}`;
  await sql`UPDATE accounts SET display_name = ${name} WHERE id = ${child}`;
  return { parent, child };
}

const QUESTIONS = [
  {
    type: 'single_choice',
    prompt: 'Which part makes food?',
    options: ['Root', 'Leaf', 'Stem'],
    correct: [1],
    points: 1,
  },
  { type: 'fill_blank', prompt: 'Plants give out [oxygen|O2].', ignoreCase: true, points: 2 },
  { type: 'true_false', prompt: 'Roots take in water.', truth: true, points: 1 },
];

async function worksheet(t: string, extra: { questions?: unknown[]; subject?: string; title?: string } = {}) {
  const r = await saveWorksheet(
    sql,
    t,
    {
      details: {
        kind: 'exercise',
        title: extra.title ?? 'Plants check-up',
        grade: 5,
        board: 'CBSE',
        subject: extra.subject ?? 'science',
      },
      questions: extra.questions ?? QUESTIONS,
      ready: true,
    },
    NOW,
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.id;
}

async function setup(questions?: unknown[]) {
  const t = await teacher();
  const f = await family();
  await activeLink(sql, { teacher: t, child: f.child, parent: f.parent, subjects: ['science'] });
  const w = await worksheet(t, { questions });
  return { t, f, w };
}

async function assign(t: string, w: string, studentId: string, extra: Record<string, unknown> = {}) {
  const r = await assignWorksheet(sql, t, { worksheetId: w, studentId, ...extra }, NOW);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r;
}

const RIGHT = [{ choice: 1 }, { blanks: ['Oxygen '] }, { value: true }];

describe('assigning (AS-1 to AS-4, W-2, W-9)', () => {
  it('makes one frozen copy for one student; library edits never reach it', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child);
    expect(a.scheduled).toBe(false);
    await saveWorksheet(
      sql,
      t,
      {
        id: w,
        details: { kind: 'exercise', title: 'Renamed', grade: 5, board: 'CBSE', subject: 'science' },
        questions: QUESTIONS.slice(0, 1),
        ready: true,
      },
      NOW,
    );
    const hw = await getHomeworkForStudent(sql, f.child, a.targetId, NOW);
    expect(hw).toMatchObject({ title: 'Plants check-up', status: 'assigned' });
    expect(hw!.questions).toHaveLength(3);
  });

  it('only students linked in that subject; nothing else is accepted', async () => {
    const { t, w } = await setup();
    const stranger = await family('Arjun');
    expect(await assignWorksheet(sql, t, { worksheetId: w, studentId: stranger.child }, NOW)).toEqual({
      ok: false,
      reason: 'not_linked',
    });
    const mathsOnly = await family('Meera');
    await activeLink(sql, { teacher: t, child: mathsOnly.child, parent: mathsOnly.parent, subjects: ['maths'] });
    expect(await assignWorksheet(sql, t, { worksheetId: w, studentId: mathsOnly.child }, NOW)).toEqual({
      ok: false,
      reason: 'not_linked',
    });
    expect(await assignWorksheet(sql, t, { worksheetId: w, studentId: [mathsOnly.child] }, NOW)).toEqual({
      ok: false,
      reason: 'not_linked',
    });
    const opts = await assignOptions(sql, t, w);
    expect(opts!.students.map((s) => s.name)).toEqual(['Kiran']);
  });

  it('a grade or board mismatch needs the teacher’s confirmation (W-2)', async () => {
    const t = await teacher();
    const f = await family('Arjun', 5, 'ICSE');
    await activeLink(sql, { teacher: t, child: f.child, parent: f.parent, subjects: ['science'] });
    const w = await worksheet(t);
    expect(await assignWorksheet(sql, t, { worksheetId: w, studentId: f.child }, NOW)).toEqual({
      ok: false,
      reason: 'mismatch',
      grade: false,
      board: true,
    });
    expect((await assignWorksheet(sql, t, { worksheetId: w, studentId: f.child, confirmMismatch: true }, NOW)).ok).toBe(
      true,
    );
  });

  it('drafts and archived worksheets can’t be assigned; another teacher’s worksheet is "not found"', async () => {
    const { t, f, w } = await setup();
    const draft = await saveWorksheet(
      sql,
      t,
      {
        details: { kind: 'exercise', title: 'D', grade: 5, board: 'CBSE', subject: 'science' },
        questions: [],
        ready: false,
      },
      NOW,
    );
    if (!draft.ok) throw new Error('setup');
    expect(await assignWorksheet(sql, t, { worksheetId: draft.id, studentId: f.child }, NOW)).toEqual({
      ok: false,
      reason: 'not_ready',
    });
    const other = await teacher('Other');
    expect(await assignWorksheet(sql, other, { worksheetId: w, studentId: f.child }, NOW)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    await sql`UPDATE worksheets SET archived_at = now() WHERE id = ${w}`;
    expect(await assignWorksheet(sql, t, { worksheetId: w, studentId: f.child }, NOW)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('handwritten worksheets wait for page uploads (PR 6) before they can be assigned', async () => {
    const { t, f } = await setup();
    const hw = await saveWorksheet(
      sql,
      t,
      {
        details: { kind: 'handwritten', title: 'Draw a leaf', grade: 5, board: 'CBSE', subject: 'science' },
        questions: [],
        ready: true,
      },
      NOW,
    );
    if (!hw.ok) throw new Error('setup');
    expect(await assignWorksheet(sql, t, { worksheetId: hw.id, studentId: f.child }, NOW)).toEqual({
      ok: false,
      reason: 'handwritten_later',
    });
  });

  it('the same worksheet to the same student again is an independent copy (W-9, AS-11)', async () => {
    const { t, f, w } = await setup();
    const one = await assign(t, w, f.child);
    const two = await assign(t, w, f.child);
    expect(one.targetId).not.toBe(two.targetId);
    await saveAnswers(sql, f.child, one.targetId, RIGHT, NOW);
    await submitExercise(sql, f.child, one.targetId, NOW);
    const list = await listHomeworkForStudent(sql, f.child, NOW);
    expect(Object.fromEntries(list.map((h) => [h.targetId, h.status]))).toEqual({
      [one.targetId]: 'reviewed',
      [two.targetId]: 'assigned',
    });
    expect((await assignOptions(sql, t, w))!.students[0]!.copies).toBe(2);
  });

  it('"as soon as marked" only for an exercise with no short answers', async () => {
    const { t, f } = await setup();
    const withShort = await worksheet(t, { questions: [{ type: 'short_answer', prompt: 'Why?', points: 2 }] });
    expect(
      await assignWorksheet(sql, t, { worksheetId: withShort, studentId: f.child, releaseMode: 'on_marking' }, NOW),
    ).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('dates (AS-5, AS-6, AS-12, W-7, W-10)', () => {
  it('future work is hidden until its date; the notification comes on the first visit after it, once', async () => {
    const { t, f, w } = await setup();
    const later = new Date(NOW.getTime() + 3 * DAY);
    const a = await assign(t, w, f.child, { visibleOn: ymd(later), dueOn: ymd(new Date(later.getTime() + 2 * DAY)) });
    expect(a.scheduled).toBe(true);
    expect(await listHomeworkForStudent(sql, f.child, NOW)).toEqual([]);
    expect(await listHomeworkForParent(sql, f.parent, NOW)).toEqual([]);
    expect(await getHomeworkForStudent(sql, f.child, a.targetId, NOW)).toBeNull();
    expect(await noteVisibleHomework(sql, { id: f.child, role: 'student' }, NOW)).toBe(0);

    const after = new Date(a.visibleFrom.getTime() + 60_000);
    expect(await listHomeworkForStudent(sql, f.child, after)).toHaveLength(1);
    expect(await noteVisibleHomework(sql, { id: f.child, role: 'student' }, after)).toBeGreaterThan(0);
    expect(await noteVisibleHomework(sql, { id: f.child, role: 'student' }, after)).toBe(0);
    expect(await noteVisibleHomework(sql, { id: f.parent, role: 'parent' }, after)).toBe(0);
    const notes = await sql<{ recipient_id: string; title: string }[]>`
      SELECT recipient_id, title FROM notifications WHERE entity_id = ${a.targetId} ORDER BY title`;
    expect(notes.map((n) => n.recipient_id).sort()).toEqual([f.child, f.parent].sort());
    expect(notes.find((n) => n.recipient_id === f.child)!.title).toBe(
      'New homework from Teacher A. Rao: Plants check-up',
    );
  });

  it('work visible now notifies the student and parent straight away', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child);
    expect(await sql`SELECT 1 FROM notifications WHERE entity_id = ${a.targetId}`).toHaveLength(2);
  });

  it('the date of hidden work can change; visible work keeps its date; dates are checked', async () => {
    const { t, f, w } = await setup();
    const later = ymd(new Date(NOW.getTime() + 3 * DAY));
    const a = await assign(t, w, f.child, { visibleOn: later });
    expect(
      await changeAssignmentDates(sql, t, a.assignmentId, { visibleOn: ymd(new Date(NOW.getTime() + 5 * DAY)) }, NOW),
    ).toEqual({ ok: true });
    const now = await assign(t, w, f.child);
    expect(await changeAssignmentDates(sql, t, now.assignmentId, { visibleOn: later }, NOW)).toEqual({
      ok: false,
      reason: 'visible',
    });
    expect(
      await assignWorksheet(
        sql,
        t,
        { worksheetId: w, studentId: f.child, visibleOn: ymd(new Date(NOW.getTime() - 2 * DAY)) },
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'dates', problem: 'past' });
    expect(
      await assignWorksheet(sql, t, { worksheetId: w, studentId: f.child, visibleOn: later, dueOn: ymd(NOW) }, NOW),
    ).toEqual({ ok: false, reason: 'dates', problem: 'due_before' });
    expect(await assignWorksheet(sql, t, { worksheetId: w, studentId: f.child, visibleOn: '2026-02-30' }, NOW)).toEqual(
      { ok: false, reason: 'dates', problem: 'bad' },
    );
  });

  it('turns a date in the teacher’s time zone into the right moment', () => {
    expect(wallTimeToUtc('2026-10-25', '00:00', 'Asia/Kolkata')!.toISOString()).toBe('2026-10-24T18:30:00.000Z');
    expect(wallTimeToUtc('2026-07-01', '18:00', 'Europe/London')!.toISOString()).toBe('2026-07-01T17:00:00.000Z');
    // Clocks go back in London on 25 Oct 2026: 6 pm that evening is 18:00 UTC.
    expect(wallTimeToUtc('2026-10-25', '18:00', 'Europe/London')!.toISOString()).toBe('2026-10-25T18:00:00.000Z');
    expect(wallTimeToUtc('2026-13-01', '00:00', 'Asia/Kolkata')).toBeNull();
    // Cuba's clocks jump from midnight to 01:00 on 8 Mar 2026: "from 8 March" starts at 01:00
    // that day, never on 7 March (review L7).
    expect(wallTimeToUtc('2026-03-08', '00:00', 'America/Havana')!.toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('a visit notifies only about work not yet started; closed copies are never listed (review L3, L5)', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child);
    await saveAnswers(sql, f.child, a.targetId, RIGHT, NOW);
    await submitExercise(sql, f.child, a.targetId, NOW);
    await sql`DELETE FROM notifications WHERE entity_id = ${a.targetId}`;
    expect(await noteVisibleHomework(sql, { id: f.child, role: 'student' }, NOW)).toBe(0);
    await sql`UPDATE assignments SET status = 'closed' WHERE id = ${a.assignmentId}`;
    expect(await listHomeworkForStudent(sql, f.child, NOW)).toEqual([]);
    expect(await listHomeworkForParent(sql, f.parent, NOW)).toEqual([]);
    expect(await getHomeworkForStudent(sql, f.child, a.targetId, NOW)).toBeNull();
    expect(await listTeacherHomework(sql, t, NOW)).toEqual([]);
    expect(await getForReview(sql, t, a.targetId, NOW)).toBeNull();
  });
});

describe('answering and submitting (AS-7, AS-8, AS-9, H-N1, D3A-18)', () => {
  it('saves as you go, never shows the key before release, and marks automatically', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child);
    const before = JSON.stringify(await getHomeworkForStudent(sql, f.child, a.targetId, NOW));
    for (const secret of ['oxygen', 'O2', '"correct"', 'answer_key', 'answerKey']) expect(before).not.toContain(secret);

    expect(await saveAnswers(sql, f.child, a.targetId, [{ choice: 1 }], NOW)).toEqual({ ok: true });
    expect((await getHomeworkForStudent(sql, f.child, a.targetId, NOW))!.status).toBe('in_progress');
    expect(await submitExercise(sql, f.child, a.targetId, NOW)).toEqual({
      ok: false,
      reason: 'incomplete',
      missing: [1, 2],
    });
    expect(await saveAnswers(sql, f.child, a.targetId, RIGHT, NOW)).toEqual({ ok: true });
    expect(await submitExercise(sql, f.child, a.targetId, NOW)).toEqual({ ok: true, status: 'reviewed', late: false });
    // Submitting is final (H-N1).
    expect(await saveAnswers(sql, f.child, a.targetId, RIGHT, NOW)).toEqual({ ok: false, reason: 'closed' });
    expect(await submitExercise(sql, f.child, a.targetId, NOW)).toEqual({ ok: false, reason: 'closed' });
    // Reviewed automatically but not released (manual release is the default).
    const hw = await getHomeworkForStudent(sql, f.child, a.targetId, NOW);
    expect(hw).toMatchObject({ status: 'reviewed', released: false, score: null });
    expect(JSON.stringify(hw)).not.toContain('oxygen');
    const review = await getForReview(sql, t, a.targetId, NOW);
    expect(review!.questions.map((q) => q.autoPoints)).toEqual([1, 2, 1]);
    expect(await releaseResults(sql, t, a.targetId, NOW)).toEqual({ ok: true });
    const after = await getHomeworkForStudent(sql, f.child, a.targetId, NOW);
    expect(after).toMatchObject({ released: true, score: 4, maxScore: 4 });
    expect(after!.questions[1]).toMatchObject({ marks: 2, correct: 'oxygen or O2' });
  });

  it('refuses answers no player can send', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child);
    for (const bad of [[{ choice: 7 }], [{ choice: 1 }, { blanks: ['x', 'y'] }], 'nope', [{}, {}, { value: 'yes' }]]) {
      expect(await saveAnswers(sql, f.child, a.targetId, bad, NOW)).toEqual({ ok: false, reason: 'invalid' });
    }
  });

  it('records Late when handed in after the due date, and it is never rewritten', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child, { dueOn: ymd(NOW), dueTime: '23:59' });
    const late = new Date(NOW.getTime() + 2 * DAY);
    expect((await listHomeworkForStudent(sql, f.child, late))[0]!.overdue).toBe(true);
    await saveAnswers(sql, f.child, a.targetId, RIGHT, late);
    expect(await submitExercise(sql, f.child, a.targetId, late)).toMatchObject({ ok: true, late: true });
    const [row] = await sql<{ submitted_late: boolean; due_at_when_submitted: Date }[]>`
      SELECT submitted_late, due_at_when_submitted FROM assignment_targets WHERE id = ${a.targetId}`;
    expect(row!.submitted_late).toBe(true);
    expect(row!.due_at_when_submitted).not.toBeNull();
  });
});

describe('teacher review (HW4)', () => {
  const WITH_SHORT = [...QUESTIONS, { type: 'short_answer', prompt: 'Why are leaves green?', points: 2 }];

  it('short answers go to the teacher; marks can be overridden; revision makes a new attempt', async () => {
    const { t, f, w } = await setup(WITH_SHORT);
    const a = await assign(t, w, f.child);
    await saveAnswers(sql, f.child, a.targetId, [{ choice: 0 }, ...RIGHT.slice(1), { text: 'Chlorophyll.' }], NOW);
    expect(await submitExercise(sql, f.child, a.targetId, NOW)).toEqual({ ok: true, status: 'submitted', late: false });
    const queue = await listTeacherHomework(sql, t, NOW);
    expect(queue[0]).toMatchObject({ targetId: a.targetId, status: 'submitted' });
    // A short answer needs a mark before "Reviewed".
    expect(await saveReview(sql, t, a.targetId, { marks: [null, null, null, null], outcome: 'reviewed' }, NOW)).toEqual(
      { ok: false, reason: 'marks' },
    );
    expect(await saveReview(sql, t, a.targetId, { marks: [null, null, null, 3], outcome: 'reviewed' }, NOW)).toEqual({
      ok: false,
      reason: 'marks',
    });
    expect(await saveReview(sql, t, a.targetId, { marks: [null, null, null, 1], outcome: 'revision' }, NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(
      await saveReview(
        sql,
        t,
        a.targetId,
        { marks: [1, null, null, 1], outcome: 'revision', note: 'Look at question 1 again.' },
        NOW,
      ),
    ).toEqual({ ok: true, status: 'revision_required', released: false });
    const hw = await getHomeworkForStudent(sql, f.child, a.targetId, NOW);
    expect(hw).toMatchObject({
      status: 'revision_required',
      attempt: 2,
      revisionNote: 'Look at question 1 again.',
      canAnswer: true,
    });
    await saveAnswers(sql, f.child, a.targetId, [...RIGHT, { text: 'Chlorophyll is green.' }], NOW);
    await submitExercise(sql, f.child, a.targetId, NOW);
    expect(
      await saveReview(
        sql,
        t,
        a.targetId,
        {
          marks: [null, 1.5, null, 2],
          comments: ['', 'Spelling', '', 'Good'],
          feedback: 'Well done.',
          outcome: 'reviewed',
          release: true,
        },
        NOW,
      ),
    ).toEqual({ ok: true, status: 'reviewed', released: true });
    expect(await getHomeworkForStudent(sql, f.child, a.targetId, NOW)).toMatchObject({
      score: 5.5,
      maxScore: 6,
      feedback: 'Well done.',
    });
    const events = await sql<
      { to_status: string }[]
    >`SELECT to_status FROM assignment_events WHERE target_id = ${a.targetId} ORDER BY at, id`;
    expect(events.map((e) => e.to_status)).toEqual(
      expect.arrayContaining(['assigned', 'in_progress', 'submitted', 'under_review', 'revision_required', 'reviewed']),
    );
  });

  it('released marks are final: no new marks and no further attempt (review M2)', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child);
    await saveAnswers(sql, f.child, a.targetId, RIGHT, NOW);
    await submitExercise(sql, f.child, a.targetId, NOW);
    expect(await releaseResults(sql, t, a.targetId, NOW)).toEqual({ ok: true });
    expect(
      await saveReview(sql, t, a.targetId, { marks: [null, null, null], outcome: 'revision', note: 'Again' }, NOW),
    ).toEqual({ ok: false, reason: 'closed' });
    expect(await saveReview(sql, t, a.targetId, { marks: [0, 0, 0], outcome: 'reviewed' }, NOW)).toEqual({
      ok: false,
      reason: 'closed',
    });
    expect(await getHomeworkForStudent(sql, f.child, a.targetId, NOW)).toMatchObject({ score: 4, status: 'reviewed' });
  });

  it('after 20 further attempts another one is refused, not an error (review L4)', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child);
    await saveAnswers(sql, f.child, a.targetId, RIGHT, NOW);
    await submitExercise(sql, f.child, a.targetId, NOW);
    await sql`UPDATE assignment_targets SET revision_count = 20 WHERE id = ${a.targetId}`;
    await sql`UPDATE answers SET attempt = 21 WHERE target_id = ${a.targetId}`;
    expect(
      await saveReview(sql, t, a.targetId, { marks: [null, null, null], outcome: 'revision', note: 'Again' }, NOW),
    ).toEqual({ ok: false, reason: 'closed' });
  });

  it('withdraw stops unfinished work; reviewed work can’t be withdrawn', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child);
    expect(await withdrawAssignment(sql, t, a.assignmentId, NOW)).toEqual({ ok: true });
    expect((await listHomeworkForStudent(sql, f.child, NOW))[0]!.status).toBe('withdrawn');
    expect(await saveAnswers(sql, f.child, a.targetId, RIGHT, NOW)).toEqual({ ok: false, reason: 'closed' });
  });
});

describe('who sees what (SEC-2 to SEC-7, SEC-10, W-11, AS-10, AS-13)', () => {
  it('another family, another teacher, Admins and the Super Admin get nothing', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child);
    const other = await family('Meera');
    const [admin] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name) VALUES ('admin', 'active', ${`a-${uniq()}@example.com`}, 'A') RETURNING id`;
    const superadmin = await createAdult(sql, 'superadmin');
    for (const who of [other.child, other.parent, admin!.id, superadmin]) {
      expect(await getHomeworkForStudent(sql, who, a.targetId, NOW)).toBeNull();
      expect(await listHomeworkForStudent(sql, who, NOW)).toEqual([]);
      expect(await listHomeworkForParent(sql, who, NOW)).toEqual([]);
      expect(await saveAnswers(sql, who, a.targetId, RIGHT, NOW)).toEqual({ ok: false, reason: 'not_found' });
    }
    const otherTeacher = await teacher('Other');
    for (const who of [otherTeacher, admin!.id, superadmin]) {
      expect(await getForReview(sql, who, a.targetId, NOW)).toBeNull();
      expect(await studentResults(sql, who, f.child, NOW)).toBeNull();
      expect((await releaseResults(sql, who, a.targetId, NOW)).ok).toBe(false);
      expect((await withdrawAssignment(sql, who, a.assignmentId, NOW)).ok).toBe(false);
    }
    // The parent sees their own child's work; the student theirs; neither before release sees marks.
    expect((await listHomeworkForParent(sql, f.parent, NOW)).map((h) => h.childName)).toEqual(['Kiran']);
    expect(await getHomeworkForStudent(sql, f.parent, a.targetId, NOW)).toBeNull();
  });

  it('when the parent removes the teacher: access stops at once, work is withdrawn, records stay', async () => {
    const { t, f, w } = await setup();
    const done = await assign(t, w, f.child);
    await saveAnswers(sql, f.child, done.targetId, RIGHT, NOW);
    await submitExercise(sql, f.child, done.targetId, NOW);
    const open = await assign(t, w, f.child);
    expect(await studentResults(sql, t, f.child, NOW)).toHaveLength(2);
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE teacher_id = ${t} AND student_id = ${f.child}`;
    expect(await studentResults(sql, t, f.child, NOW)).toBeNull();
    expect(await getForReview(sql, t, done.targetId, NOW)).toBeNull();
    expect(await listTeacherHomework(sql, t, NOW)).toEqual([]);
    expect(await releaseResults(sql, t, done.targetId, NOW)).toEqual({ ok: false, reason: 'not_found' });
    const mine = await listHomeworkForStudent(sql, f.child, NOW);
    expect(Object.fromEntries(mine.map((h) => [h.targetId, h.status]))).toEqual({
      [done.targetId]: 'reviewed',
      [open.targetId]: 'withdrawn',
    });
    expect(await sql`SELECT 1 FROM answers WHERE target_id = ${done.targetId}`).toHaveLength(3);
  });

  it('the results tab lists only this teacher’s work for a linked child, as numbers only', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child);
    await saveAnswers(sql, f.child, a.targetId, RIGHT, NOW);
    await submitExercise(sql, f.child, a.targetId, NOW);
    const other = await teacher('Other');
    await activeLink(sql, { teacher: other, child: f.child, parent: f.parent, subjects: ['science'] });
    const ow = await worksheet(other, { title: 'Other teacher’s quiz' });
    await assign(other, ow, f.child);
    const results = await studentResults(sql, t, f.child, NOW);
    expect(results!.map((r) => r.title)).toEqual(['Plants check-up']);
    expect(results![0]).toMatchObject({ status: 'reviewed', score: 4, maxScore: 4 });
  });

  it('the teacher’s "handed in" notification never names the child', async () => {
    const { t, f, w } = await setup();
    const a = await assign(t, w, f.child);
    await saveAnswers(sql, f.child, a.targetId, RIGHT, NOW);
    await submitExercise(sql, f.child, a.targetId, NOW);
    const [n] = await sql<
      { title: string; body: string }[]
    >`SELECT title, body FROM notifications WHERE recipient_id = ${t}`;
    expect(n!.title).toBe('Homework handed in: Plants check-up');
    expect(`${n!.title} ${n!.body}`).not.toContain('Kiran');
  });
});
