import { afterAll, describe, expect, it } from 'vitest';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * M3 (0027) database rules for a student's frozen copy, the second line of defence behind the
 * code in PR 5: one student per assignment, linked in the subject, allowed status changes only,
 * questions locked once started (H-N4, proposed), answers only while open, the date of visible
 * work never moved (W-10). Invented accounts only.
 */
const sql = testDb();
afterAll(() => sql.end());

const HOUR = 60 * 60 * 1000;

async function teacher() {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', 'active', ${`t-${uniq()}@example.com`}, 'Teacher', 'x') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${row!.id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  return row!.id;
}

async function family(subjects = ['science']) {
  const parent = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
  return { parent, child, subjects };
}

/** An assignment (frozen copy) with one question; visible from `visibleFrom`. */
async function assignment(t: string, visibleFrom = new Date(Date.now() - HOUR), subject = 'science') {
  const [a] = await sql<{ id: string }[]>`
    INSERT INTO assignments (teacher_id, kind, title, grade, board, subject, visible_from)
    VALUES (${t}, 'exercise', 'Check-up', 5, 'CBSE', ${subject}, ${visibleFrom}) RETURNING id`;
  const [q] = await sql<{ id: string }[]>`
    INSERT INTO questions (assignment_id, position, type, prompt, data, answer_key, points)
    VALUES (${a!.id}, 1, 'true_false', 'Roots take in water.', '{}', ${sql.json({ correct: true })}, 1) RETURNING id`;
  return { id: a!.id, questionId: q!.id };
}

async function setup() {
  const t = await teacher();
  const f = await family();
  await activeLink(sql, { teacher: t, child: f.child, parent: f.parent, subjects: ['science'] });
  const a = await assignment(t);
  const [target] = await sql<{ id: string }[]>`
    INSERT INTO assignment_targets (assignment_id, student_id) VALUES (${a.id}, ${f.child}) RETURNING id`;
  return { t, f, a, targetId: target!.id };
}

describe('who can be given work', () => {
  it('only a student linked to the teacher in that subject; one student per assignment', async () => {
    const { t, f, a } = await setup();
    const other = await family();
    await activeLink(sql, { teacher: t, child: other.child, parent: other.parent, subjects: ['science'] });
    await expect(
      sql`INSERT INTO assignment_targets (assignment_id, student_id) VALUES (${a.id}, ${other.child})`,
    ).rejects.toThrow(/duplicate key|unique/);
    const maths = await assignment(t, new Date(Date.now() - HOUR), 'maths');
    await expect(
      sql`INSERT INTO assignment_targets (assignment_id, student_id) VALUES (${maths.id}, ${f.child})`,
    ).rejects.toThrow(/not linked to this teacher for this subject/);
    const stranger = await family();
    const b = await assignment(t);
    await expect(
      sql`INSERT INTO assignment_targets (assignment_id, student_id) VALUES (${b.id}, ${stranger.child})`,
    ).rejects.toThrow(/not linked/);
    await expect(
      sql`INSERT INTO assignment_targets (assignment_id, student_id) VALUES (${b.id}, ${f.parent})`,
    ).rejects.toThrow(/is not a student/);
  });

  it('the same worksheet can be given to the same student again as a separate copy (W-9)', async () => {
    const { t, f } = await setup();
    const again = await assignment(t);
    await expect(
      sql`INSERT INTO assignment_targets (assignment_id, student_id) VALUES (${again.id}, ${f.child})`,
    ).resolves.toBeDefined();
  });
});

describe('status changes (CR-07 §5)', () => {
  it('allows the lifecycle and refuses anything else', async () => {
    const { targetId } = await setup();
    const move = (to: string) => sql`UPDATE assignment_targets SET status = ${to},
      withdrawn_at = ${to === 'withdrawn' ? new Date() : null} WHERE id = ${targetId}`;
    await expect(move('reviewed')).rejects.toThrow(/cannot move from assigned to reviewed/);
    for (const to of [
      'in_progress',
      'submitted',
      'under_review',
      'revision_required',
      'in_progress',
      'submitted',
      'reviewed',
    ]) {
      await move(to);
    }
    await expect(move('assigned')).rejects.toThrow(/cannot move/);
    await expect(move('withdrawn')).rejects.toThrow(/cannot move from reviewed to withdrawn/);
  });

  it('the student of an assignment never changes', async () => {
    const { targetId } = await setup();
    const other = await family();
    await expect(sql`UPDATE assignment_targets SET student_id = ${other.child} WHERE id = ${targetId}`).rejects.toThrow(
      /never changes/,
    );
  });
});

describe('questions and answers', () => {
  it('questions are locked once the student has started (H-N4, proposed)', async () => {
    const { a, targetId } = await setup();
    await sql`UPDATE questions SET prompt = 'Changed before starting' WHERE id = ${a.questionId}`;
    await sql`UPDATE assignment_targets SET status = 'in_progress' WHERE id = ${targetId}`;
    await expect(sql`UPDATE questions SET prompt = 'Changed later' WHERE id = ${a.questionId}`).rejects.toThrow(
      /locked/,
    );
    await expect(sql`DELETE FROM questions WHERE id = ${a.questionId}`).rejects.toThrow(/locked/);
    await expect(
      sql`INSERT INTO questions (assignment_id, position, type, prompt, points) VALUES (${a.id}, 2, 'short_answer', 'New?', 1)`,
    ).rejects.toThrow(/locked/);
    // Removing the whole assignment (retention) is still possible.
    await sql`DELETE FROM assignments WHERE id = ${a.id}`;
  });

  it('answers only for that homework’s questions and only while it is open', async () => {
    const { t, a, targetId } = await setup();
    const elsewhere = await assignment(t);
    await expect(
      sql`INSERT INTO answers (target_id, question_id, attempt, response) VALUES (${targetId}, ${elsewhere.questionId}, 1, '{}')`,
    ).rejects.toThrow(/not part of this homework/);
    await sql`INSERT INTO answers (target_id, question_id, attempt, response) VALUES (${targetId}, ${a.questionId}, 1, ${sql.json({ value: true })})`;
    await sql`UPDATE assignment_targets SET status = 'submitted' WHERE id = ${targetId}`;
    await expect(
      sql`UPDATE answers SET response = ${sql.json({ value: false })} WHERE target_id = ${targetId}`,
    ).rejects.toThrow(/only while the homework is open/);
    // The teacher's marks can still be recorded after submission.
    await sql`UPDATE answers SET teacher_points = 1 WHERE target_id = ${targetId}`;
  });

  it('a frozen question always has a key, unless it is a short answer', async () => {
    const t = await teacher();
    const a = await assignment(t);
    await expect(
      sql`INSERT INTO questions (assignment_id, position, type, prompt, points) VALUES (${a.id}, 2, 'single_choice', 'Q?', 1)`,
    ).rejects.toThrow(/check/);
  });
});

describe('dates (W-7, W-10)', () => {
  it('a hidden date may change; once visible it keeps its date; due is never before visible', async () => {
    const t = await teacher();
    const future = await assignment(t, new Date(Date.now() + 48 * HOUR));
    await sql`UPDATE assignments SET visible_from = ${new Date(Date.now() + 72 * HOUR)} WHERE id = ${future.id}`;
    const visible = await assignment(t);
    await expect(
      sql`UPDATE assignments SET visible_from = ${new Date(Date.now() + 72 * HOUR)} WHERE id = ${visible.id}`,
    ).rejects.toThrow(/keeps its date/);
    await expect(
      sql`UPDATE assignments SET due_at = ${new Date(Date.now() - 2 * HOUR)} WHERE id = ${visible.id}`,
    ).rejects.toThrow(/check/);
    await expect(sql`UPDATE assignments SET title = 'Renamed' WHERE id = ${visible.id}`).rejects.toThrow(/frozen/);
  });

  it('an assignment can only use the teacher’s own worksheet', async () => {
    const a = await teacher();
    const b = await teacher();
    const [w] = await sql<{ id: string }[]>`
      INSERT INTO worksheets (teacher_id, kind, title, grade, board, subject) VALUES (${b}, 'handwritten', 'B', 5, 'CBSE', 'science')
      RETURNING id`;
    await expect(
      sql`INSERT INTO assignments (teacher_id, worksheet_id, kind, title, grade, board, subject, visible_from)
          VALUES (${a}, ${w!.id}, 'handwritten', 'B', 5, 'CBSE', 'science', now())`,
    ).rejects.toThrow(/not this teacher/);
  });
});

describe('when the link ends (FR-027.1, FR-027.3, W-11)', () => {
  it('unfinished work becomes Withdrawn with a history entry; reviewed work and answers stay', async () => {
    const { t, f, a, targetId } = await setup();
    await sql`INSERT INTO answers (target_id, question_id, attempt, response)
              VALUES (${targetId}, ${a.questionId}, 1, ${sql.json({ value: true })})`;
    await sql`UPDATE assignment_targets SET status = 'in_progress' WHERE id = ${targetId}`;
    const done = await assignment(t);
    const [d] = await sql<{ id: string }[]>`
      INSERT INTO assignment_targets (assignment_id, student_id) VALUES (${done.id}, ${f.child}) RETURNING id`;
    for (const to of ['in_progress', 'submitted', 'reviewed']) {
      await sql`UPDATE assignment_targets SET status = ${to} WHERE id = ${d!.id}`;
    }
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now()
              WHERE teacher_id = ${t} AND student_id = ${f.child}`;
    const rows = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM assignment_targets WHERE id IN (${targetId}, ${d!.id})`;
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      [targetId]: 'withdrawn',
      [d!.id]: 'reviewed',
    });
    const [ev] = await sql<{ to_status: string; note: string }[]>`
      SELECT to_status, note FROM assignment_events WHERE target_id = ${targetId}`;
    expect(ev).toMatchObject({ to_status: 'withdrawn' });
    expect(await sql`SELECT 1 FROM answers WHERE target_id = ${targetId}`).toHaveLength(1);
  });

  it('removing only that subject withdraws work in that subject only', async () => {
    const t = await teacher();
    const f = await family();
    await activeLink(sql, { teacher: t, child: f.child, parent: f.parent, subjects: ['science', 'maths'] });
    const sci = await assignment(t);
    const maths = await assignment(t, new Date(Date.now() - HOUR), 'maths');
    const ids: string[] = [];
    for (const x of [sci, maths]) {
      const [r] = await sql<{ id: string }[]>`
        INSERT INTO assignment_targets (assignment_id, student_id) VALUES (${x.id}, ${f.child}) RETURNING id`;
      ids.push(r!.id);
    }
    await sql`UPDATE teacher_student_links SET subjects = ${['maths']} WHERE teacher_id = ${t} AND student_id = ${f.child}`;
    const rows = await sql<
      { id: string; status: string }[]
    >`SELECT id, status FROM assignment_targets WHERE id IN ${sql(ids)}`;
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      [ids[0]!]: 'withdrawn',
      [ids[1]!]: 'assigned',
    });
  });
});

describe('assigning while the parent ends the link (review M1)', () => {
  it('the link update waits for the new work, then withdraws it', async () => {
    const t = await teacher();
    const f = await family();
    await activeLink(sql, { teacher: t, child: f.child, parent: f.parent, subjects: ['science'] });
    const a = await assignment(t);
    const other = testDb();
    let targetId = '';
    let unlinked: Promise<unknown> = Promise.resolve();
    await sql.begin(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO assignment_targets (assignment_id, student_id) VALUES (${a.id}, ${f.child}) RETURNING id`;
      targetId = row!.id;
      // The parent removes the teacher while the assignment is still being saved.
      unlinked = other`UPDATE teacher_student_links SET status = 'removed', removed_at = now()
                       WHERE teacher_id = ${t} AND student_id = ${f.child}`;
      await new Promise((r) => setTimeout(r, 300));
    });
    await unlinked;
    await other.end();
    const [row] = await sql<{ status: string }[]>`SELECT status FROM assignment_targets WHERE id = ${targetId}`;
    expect(row!.status).toBe('withdrawn');
  });
});

describe('widened lists', () => {
  it('notifications accept "assignment"; teacher resources get a type label defaulting to "other"', async () => {
    const [c] = await sql<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'notifications_entity_type_check'`;
    expect(c!.def).toContain("'assignment'");
    const [col] = await sql<{ d: string }[]>`
      SELECT column_default AS d FROM information_schema.columns WHERE table_name = 'teacher_resources' AND column_name = 'resource_type'`;
    expect(col!.d).toContain('other');
  });
});
