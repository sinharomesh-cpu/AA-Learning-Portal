import { afterAll, describe, expect, it } from 'vitest';
import { emptyQuestion, planQuestions, type QuestionDraft } from '@/lib/worksheetQuestions';
import {
  builderOptions,
  duplicateWorksheet,
  getWorksheet,
  listWorksheets,
  previewWorksheet,
  questionsToCopy,
  saveWorksheet,
  setWorksheetArchived,
} from '@/server/worksheets';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * CR-17 PR 4: the Human Teacher's worksheet library (boards W1, W2; readiness pack WS-1 to WS-7,
 * SEC-1, SEC-10, SEC-17). Invented accounts only.
 */
const sql = testDb();
afterAll(() => sql.end());

const T0 = new Date('2026-10-23T10:00:00Z');

async function teacher(name = 'Teacher A. Rao', subjects = ['maths', 'science']) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', 'active', ${`t-${uniq()}@example.com`}, ${name}, 'x') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${row!.id}, 'self_registered', 'approved', ${subjects}, ${[4, 5]}, ${owner}, now())`;
  return row!.id;
}

const details = (extra: Record<string, unknown> = {}) => ({
  kind: 'exercise',
  title: 'Plants and cells — check-up',
  grade: 5,
  board: 'CBSE',
  subject: 'science',
  chapter: 'Chapter 2 (sample)',
  topic: 'Parts of a plant',
  difficulty: 'medium',
  instructions: 'Read pages 14 to 16 first.',
  ...extra,
});

const complete: QuestionDraft[] = [
  {
    type: 'single_choice',
    prompt: 'Which part of a plant makes food?',
    options: ['Root', 'Leaf', 'Stem'],
    correct: [1],
    points: 1,
  },
  {
    type: 'multi_select',
    prompt: 'Tick everything a plant needs to make food.',
    options: ['Sunlight', 'Water', 'Air', 'Soil'],
    correct: [0, 1, 2],
    partialCredit: true,
    points: 2,
  },
  {
    type: 'fill_blank',
    prompt: 'Plants take in [carbon dioxide|CO2] and give out [oxygen].',
    ignoreCase: true,
    points: 2,
  },
  { type: 'true_false', prompt: 'Roots take in water from the soil.', truth: true, points: 1 },
  {
    type: 'matching',
    prompt: 'Match each part to its job.',
    pairs: [
      ['Leaf', 'Makes food'],
      ['Root', 'Takes in water'],
      ['Stem', 'Holds the plant up'],
    ],
    points: 3,
  },
  { type: 'short_answer', prompt: 'In two sentences, explain why leaves are green.', points: 2 },
];

async function save(
  t: string,
  extra: { id?: string; questions?: unknown; ready?: boolean; details?: Record<string, unknown> } = {},
) {
  return saveWorksheet(
    sql,
    t,
    {
      id: extra.id,
      details: extra.details ?? details(),
      questions: extra.questions ?? complete,
      ready: extra.ready ?? true,
    },
    T0,
  );
}

describe('save, edit, duplicate, archive, restore (WS-1)', () => {
  it('saves a ready worksheet with all six question types and reads it back unchanged', async () => {
    const t = await teacher();
    const r = await save(t);
    expect(r).toMatchObject({ ok: true, status: 'ready' });
    if (!r.ok) return;
    const w = await getWorksheet(sql, t, r.id);
    expect(w).toMatchObject({
      title: 'Plants and cells — check-up',
      grade: 5,
      board: 'CBSE',
      subject: 'science',
      status: 'ready',
    });
    expect(w!.questions.map((q) => q.type)).toEqual([
      'single_choice',
      'multi_select',
      'fill_blank',
      'true_false',
      'matching',
      'short_answer',
    ]);
    expect(w!.questions[2]).toMatchObject({ prompt: 'Plants take in [carbon dioxide|CO2] and give out [oxygen].' });
    expect(w!.questions[1]).toMatchObject({ correct: [0, 1, 2], partialCredit: true });
  });

  it('edits replace the questions; duplicate makes an independent draft; archive and restore', async () => {
    const t = await teacher();
    const r = await save(t);
    if (!r.ok) throw new Error(r.reason);
    expect(
      await save(t, { id: r.id, questions: complete.slice(0, 2), details: details({ title: 'Shorter' }) }),
    ).toMatchObject({
      ok: true,
    });
    expect((await getWorksheet(sql, t, r.id))!.questions).toHaveLength(2);

    const copy = await duplicateWorksheet(sql, t, r.id, T0);
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    const c = await getWorksheet(sql, t, copy.id!);
    expect(c).toMatchObject({ title: 'Copy of Shorter', status: 'draft' });
    expect(c!.questions).toHaveLength(2);
    // Changing the copy leaves the original alone.
    await save(t, { id: copy.id, questions: complete, ready: false });
    expect((await getWorksheet(sql, t, r.id))!.questions).toHaveLength(2);

    expect(await setWorksheetArchived(sql, t, r.id, true, T0)).toEqual({ ok: true });
    expect(await setWorksheetArchived(sql, t, r.id, true, T0)).toEqual({ ok: false, reason: 'not_found' });
    // Archived worksheets can't be edited.
    expect(await save(t, { id: r.id })).toEqual({ ok: false, reason: 'not_found' });
    const lib = await listWorksheets(sql, t, { status: 'archived' }, T0);
    expect(lib.cards.map((x) => x.id)).toEqual([r.id]);
    expect(lib.counts).toMatchObject({ all: 1, archived: 1 });
    expect(await setWorksheetArchived(sql, t, r.id, false, T0)).toEqual({ ok: true });
    expect((await getWorksheet(sql, t, r.id))!.status).toBe('ready');
  });
});

describe('labels (WS-2)', () => {
  it('needs grade 1–12, a board from the list and a subject the teacher teaches', async () => {
    const t = await teacher('T', ['science']);
    for (const [bad, field] of [
      [{ grade: 0 }, 'grade'],
      [{ grade: 13 }, 'grade'],
      [{ board: 'Made-up board' }, 'board'],
      [{ subject: 'art' }, 'subject'],
      [{ subject: 'maths' }, 'subject'],
      [{ title: '' }, 'title'],
      [{ title: 'x'.repeat(121) }, 'title'],
      [{ difficulty: 'impossible' }, 'difficulty'],
      [{ topic: 't'.repeat(121) }, 'topic'],
      [{ instructions: 'i'.repeat(4001) }, 'instructions'],
      [{ kind: 'quiz' }, 'kind'],
    ] as const) {
      const r = await save(t, { details: details(bad) });
      expect(r).toMatchObject({ ok: false, reason: 'details' });
      if (!r.ok && r.reason === 'details') expect(r.fields).toContain(field);
    }
    expect(
      await save(t, { details: details({ board: 'ICSE', difficulty: '', topic: '', chapter: '' }) }),
    ).toMatchObject({
      ok: true,
    });
  });
});

describe('question plan and "Mark ready" (WS-3, WS-4)', () => {
  it('the plan makes only empty questions; a draft with empty questions saves; Mark ready is refused', async () => {
    const plan = planQuestions([
      { type: 'single_choice', count: 2, points: 1 },
      { type: 'true_false', count: 1, points: 1 },
      { type: 'short_answer', count: 1, points: 2 },
    ])!;
    expect(plan).toHaveLength(4);
    expect(plan.every((q) => q.prompt === '')).toBe(true);
    const t = await teacher();
    const draft = await save(t, { questions: plan, ready: false });
    expect(draft).toMatchObject({ ok: true, status: 'draft' });
    const ready = await save(t, { questions: plan, ready: true });
    expect(ready).toMatchObject({ ok: false, reason: 'not_ready' });
    if (!ready.ok && ready.reason === 'not_ready') expect(ready.problems.map((p) => p.index)).toEqual([0, 1, 2, 3]);
    const lib = await listWorksheets(sql, t, {}, T0);
    expect(lib.cards[0]).toMatchObject({ status: 'draft', questions: 4, emptyQuestions: 4, marks: 5 });
  });

  it('refuses Mark ready for a missing answer key, a fill-in without [ ], and an exercise with no questions', async () => {
    const t = await teacher();
    for (const q of [
      { type: 'single_choice', prompt: 'Q?', options: ['A', 'B'], correct: [], points: 1 },
      { type: 'multi_select', prompt: 'Q?', options: ['A', ''], correct: [0], points: 1 },
      { type: 'fill_blank', prompt: 'No blanks here.', points: 1 },
      { type: 'true_false', prompt: 'Q?', truth: null, points: 1 },
      { type: 'matching', prompt: 'Q?', pairs: [['A', '1']], points: 1 },
    ]) {
      expect(await save(t, { questions: [q] })).toMatchObject({ ok: false, reason: 'not_ready' });
    }
    expect(await save(t, { questions: [] })).toMatchObject({ ok: false, reason: 'not_ready', empty: true });
    // Handwritten worksheets have no questions and can be ready.
    expect(await save(t, { questions: [], details: details({ kind: 'handwritten' }) })).toMatchObject({ ok: true });
    expect(await save(t, { questions: complete, details: details({ kind: 'handwritten' }) })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('refuses shapes no editor sends', async () => {
    const t = await teacher();
    for (const q of [
      { type: 'essay', prompt: 'Q', points: 1 },
      { type: 'single_choice', prompt: 'Q', options: ['A', 'B'], correct: [5], points: 1 },
      { type: 'single_choice', prompt: 'Q', options: Array(7).fill('x'), correct: [0], points: 1 },
      { type: 'true_false', prompt: 'Q', truth: true, points: 101 },
      { type: 'true_false', prompt: 'Q', truth: true, points: 1.5 },
      { type: 'true_false', prompt: 'Q', truth: true, points: 1, sourcePage: 0 },
      'not a question',
    ]) {
      expect(await save(t, { questions: [q] })).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(await save(t, { questions: Array(101).fill(emptyQuestion('short_answer')), ready: false })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('the database refuses an incomplete Ready worksheet even if the code is bypassed', async () => {
    const t = await teacher();
    const r = await save(t, { questions: complete });
    if (!r.ok) throw new Error(r.reason);
    await expect(
      sql`UPDATE worksheet_questions SET prompt = '' WHERE worksheet_id = ${r.id} AND position = 1`,
    ).rejects.toThrow(/empty question or a missing answer key/);
    await expect(sql`DELETE FROM worksheet_questions WHERE worksheet_id = ${r.id}`).rejects.toThrow(
      /at least one question/,
    );
  });
});

describe('search and filters (WS-5)', () => {
  it('filters by title or topic, grade, board, subject, chapter, status, and a linked student only', async () => {
    const t = await teacher();
    await save(t, {
      details: details({ title: 'Water cycle quiz', topic: 'Evaporation', chapter: 'Chapter 3 (sample)' }),
    });
    await save(t, {
      details: details({ title: 'Fractions practice', subject: 'maths', grade: 4, board: 'ICSE', chapter: '' }),
      ready: false,
    });
    await save(t, { details: details({ title: 'Plants check-up' }) });

    const titles = async (f: Parameters<typeof listWorksheets>[2]) =>
      (await listWorksheets(sql, t, f, T0)).cards.map((c) => c.title).sort();
    expect(await titles({ q: 'evapo' })).toEqual(['Water cycle quiz']);
    expect(await titles({ q: 'PLANTS' })).toEqual(['Plants check-up']);
    expect(await titles({ q: '%' })).toEqual([]);
    expect(await titles({ grade: 4 })).toEqual(['Fractions practice']);
    expect(await titles({ board: 'CBSE' })).toEqual(['Plants check-up', 'Water cycle quiz']);
    expect(await titles({ subject: 'maths' })).toEqual(['Fractions practice']);
    expect(await titles({ chapter: 'Chapter 3 (sample)' })).toEqual(['Water cycle quiz']);
    expect(await titles({ status: 'draft' })).toEqual(['Fractions practice']);
    expect(await titles({ status: 'ready' })).toEqual(['Plants check-up', 'Water cycle quiz']);

    const lib = await listWorksheets(sql, t, {}, T0);
    expect(lib.options).toMatchObject({ grades: [4, 5], boards: ['CBSE', 'ICSE'], subjects: ['maths', 'science'] });

    // A student filter for someone not linked to this teacher is ignored (W-11).
    const parent = await createAdult(sql, 'parent');
    const stranger = await createChild(sql, parent);
    expect((await listWorksheets(sql, t, { studentId: stranger }, T0)).cards).toHaveLength(3);
    // A linked student appears among the choices.
    const child = await createChild(sql, parent);
    await sql`UPDATE student_profiles SET subjects = ${['science']} WHERE account_id = ${child}`;
    await activeLink(sql, { teacher: t, child, parent, subjects: ['science'] });
    expect((await listWorksheets(sql, t, {}, T0)).options.students.map((s) => s.id)).toEqual([child]);
    expect((await listWorksheets(sql, t, { studentId: child }, T0)).cards).toHaveLength(0);
  });
});

describe('copying questions (WS-7) and preview', () => {
  it('lists and copies only the teacher’s own worksheets', async () => {
    const a = await teacher('A');
    const b = await teacher('B');
    const mine = await save(a);
    const theirs = await save(b);
    if (!mine.ok || !theirs.ok) throw new Error('setup');
    const opts = await builderOptions(sql, a);
    expect(opts!.worksheets.map((w) => w.id)).toEqual([mine.id]);
    expect(await questionsToCopy(sql, a, mine.id)).toHaveLength(6);
    expect(await questionsToCopy(sql, a, theirs.id)).toBeNull();
  });

  it('the student preview never contains an answer key', async () => {
    const t = await teacher();
    const r = await save(t);
    if (!r.ok) throw new Error(r.reason);
    const p = await previewWorksheet(sql, t, r.id);
    expect(p!.marks).toBe(11);
    const text = JSON.stringify(p);
    for (const secret of ['carbon dioxide', 'CO2', 'oxygen', 'correct', 'aligned', 'answerKey', 'answer_key']) {
      expect(text).not.toContain(secret);
    }
    expect(p!.questions[2]).toMatchObject({ prompt: 'Plants take in ____ and give out ____.' });
    expect([...p!.questions[4]!.right!].sort()).toEqual(['Holds the plant up', 'Makes food', 'Takes in water']);
  });
});

describe('nobody else sees or changes a library (SEC-1, SEC-10)', () => {
  it('another teacher, a parent, a student, an Admin and the Super Admin get nothing', async () => {
    const t = await teacher();
    const r = await save(t);
    if (!r.ok) throw new Error(r.reason);
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    const [admin] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name) VALUES ('admin', 'active', ${`a-${uniq()}@example.com`}, 'A') RETURNING id`;
    const others = [await teacher('Other'), parent, child, admin!.id, await createAdult(sql, 'superadmin')];
    for (const who of others) {
      expect(await getWorksheet(sql, who, r.id)).toBeNull();
      expect(await previewWorksheet(sql, who, r.id)).toBeNull();
      expect((await listWorksheets(sql, who, {}, T0)).cards).toEqual([]);
      expect((await duplicateWorksheet(sql, who, r.id, T0)).ok).toBe(false);
      expect((await setWorksheetArchived(sql, who, r.id, true, T0)).ok).toBe(false);
      expect((await save(who, { id: r.id })).ok).toBe(false);
    }
    expect((await getWorksheet(sql, t, r.id))!.archived).toBe(false);
  });

  it('a teacher who is not approved or not active can do nothing', async () => {
    const t = await teacher();
    const r = await save(t);
    if (!r.ok) throw new Error(r.reason);
    await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${t}`;
    expect(await save(t)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await getWorksheet(sql, t, r.id)).toBeNull();
  });

  it('the source file must be the teacher’s own (also enforced by the database)', async () => {
    const a = await teacher('A');
    const b = await teacher('B');
    const owner = await createAdult(sql, 'superadmin');
    expect(owner).toBeTruthy();
    const [file] = await sql<{ id: string }[]>`
      INSERT INTO stored_files (owner_id, purpose, media_type, byte_size, sha256, file_name, body)
      VALUES (${b}, 'teacher_resource', 'application/pdf', 5, ${Buffer.alloc(32)}, 'x.pdf', ${Buffer.from('%PDF-')})
      RETURNING id`;
    const [res] = await sql<{ id: string }[]>`
      INSERT INTO teacher_resources (teacher_id, file_id, title, subject) VALUES (${b}, ${file!.id}, 'B notes', 'science')
      RETURNING id`;
    expect(
      await save(a, { details: details({ sourceResourceId: res!.id, sourceFromPage: 1, sourceToPage: 2 }) }),
    ).toEqual({
      ok: false,
      reason: 'details',
      fields: ['source'],
    });
    const ok = await save(b, { details: details({ sourceResourceId: res!.id, sourceFromPage: 3, sourceToPage: 4 }) });
    expect(ok).toMatchObject({ ok: true });
    await expect(
      sql`INSERT INTO worksheets (teacher_id, kind, title, grade, board, subject, source_resource_id)
          VALUES (${a}, 'exercise', 'x', 5, 'CBSE', 'science', ${res!.id})`,
    ).rejects.toThrow(/source file is not this teacher/);
  });
});

describe('long or hostile text (SEC-17)', () => {
  it('is kept as plain text within the limits', async () => {
    const t = await teacher();
    const hostile = '<script>alert(1)</script>';
    const r = await save(t, {
      details: details({ title: hostile }),
      questions: [{ type: 'short_answer', prompt: hostile, points: 1 }],
    });
    if (!r.ok) throw new Error(r.reason);
    const w = await getWorksheet(sql, t, r.id);
    expect(w!.title).toBe(hostile);
    expect(w!.questions[0]!.prompt).toBe(hostile);
  });
});
