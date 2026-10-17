import { afterAll, describe, expect, it } from 'vitest';
import { getUsualTimes, saveUsualTimes } from '@/server/teacherUsualTimes';
import { createAdult, testDb, uniq } from './helpers';

/** PR-D1c: usual weekly times, a guide for families (boards D3, D5, D9; OC-85). */
const sql = testDb();
const T0 = new Date('2026-10-17T09:00:00Z');
afterAll(() => sql.end());

async function teacher(approval: 'approved' | 'submitted' | 'rejected' = 'approved', status = 'active') {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', ${status}, ${`times-${uniq()}@example.com`}, 'Teacher T. Sample', 'x') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  const decided = approval !== 'submitted';
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at,
                                  submitted_at)
    VALUES (${row!.id}, 'self_registered', ${approval}, ${['maths']}, ${[5]}, 'Teaches maths to primary classes.',
            ${decided ? owner : null}, ${decided ? T0 : null}, ${T0})`;
  return row!.id;
}

describe('usual weekly times', () => {
  it('an approved teacher saves a week; saving again replaces it; an empty list clears it', async () => {
    const id = await teacher();
    expect(
      await saveUsualTimes(
        sql,
        id,
        [
          { weekday: 6, start: 600, end: 720 },
          { weekday: 1, start: 960, end: 1080 },
        ],
        T0,
      ),
    ).toEqual({ ok: true, count: 2 });
    expect(await getUsualTimes(sql, id)).toEqual([
      { weekday: 1, start: 960, end: 1080 },
      { weekday: 6, start: 600, end: 720 },
    ]);
    await saveUsualTimes(sql, id, [{ weekday: 3, start: 960, end: 1080 }], T0);
    expect(await getUsualTimes(sql, id)).toEqual([{ weekday: 3, start: 960, end: 1080 }]);
    expect(await saveUsualTimes(sql, id, [], T0)).toEqual({ ok: true, count: 0 });
    expect(await getUsualTimes(sql, id)).toEqual([]);
    const audit =
      await sql`SELECT 1 FROM audit_events WHERE subject_id = ${id} AND event_type = 'TEACHER_USUAL_TIMES_UPDATED'`;
    expect(audit.length).toBe(3);
  });

  it('refuses overlapping, invalid and too many times, and keeps the previous week', async () => {
    const id = await teacher();
    await saveUsualTimes(sql, id, [{ weekday: 1, start: 960, end: 1080 }], T0);
    expect(
      await saveUsualTimes(
        sql,
        id,
        [
          { weekday: 2, start: 960, end: 1080 },
          { weekday: 2, start: 1050, end: 1110 },
        ],
        T0,
      ),
    ).toEqual({ ok: false, reason: 'overlap' });
    expect(await saveUsualTimes(sql, id, [{ weekday: 8, start: 960, end: 1080 }], T0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    const fifteen = Array.from({ length: 15 }, (_, i) => ({
      weekday: (i % 7) + 1,
      start: Math.floor(i / 7) * 120,
      end: Math.floor(i / 7) * 120 + 60,
    }));
    expect(await saveUsualTimes(sql, id, fifteen, T0)).toEqual({ ok: false, reason: 'count' });
    expect(await getUsualTimes(sql, id)).toEqual([{ weekday: 1, start: 960, end: 1080 }]);
  });

  it('only an approved, active teacher can save; never a waiting, rejected or deactivated one, or a parent', async () => {
    const week = [{ weekday: 1, start: 960, end: 1080 }];
    for (const id of [
      await teacher('submitted', 'pending_approval'),
      await teacher('rejected', 'pending_approval'),
      await teacher('approved', 'deactivated'),
      await createAdult(sql, 'parent'),
      'not-an-id',
    ]) {
      expect(await saveUsualTimes(sql, id, week, T0)).toEqual({ ok: false, reason: 'not_allowed' });
    }
  });

  it('the database refuses overlaps, bad steps and non-teachers whatever the application does', async () => {
    const id = await teacher();
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, 4, 960, 1080)`;
    await expect(
      sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, 4, 1020, 1140)`,
    ).rejects.toThrow(/usual times overlap/);
    await expect(
      sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, 5, 965, 1080)`,
    ).rejects.toThrow(/check constraint/);
    const parent = await createAdult(sql, 'parent');
    await expect(
      sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${parent}, 1, 960, 1080)`,
    ).rejects.toThrow(/is not a teacher/);
  });
});
