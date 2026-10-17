import 'server-only';
import { checkUsualTimes, sortUsualTimes, type UsualTime, type UsualTimesProblem } from '@/lib/usualTimes';
import { writeAudit } from './auth/audit';
import type { Db, Sql } from './db/client';

/**
 * Usual weekly times (PR-D1c; boards D3, D5, D9; OC-85). A guide for families shown on a
 * listing: nothing is booked or reserved from them. Only an approved, active teacher edits
 * their own times; the teacher always comes from the session.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getUsualTimes(sql: Db, teacherId: string): Promise<UsualTime[]> {
  if (!UUID.test(teacherId)) return [];
  const rows = await sql<Array<{ weekday: number; start_minute: number; end_minute: number }>>`
    SELECT weekday, start_minute, end_minute FROM teacher_usual_times
    WHERE teacher_id = ${teacherId} ORDER BY weekday, start_minute`;
  return rows.map((r) => ({ weekday: Number(r.weekday), start: Number(r.start_minute), end: Number(r.end_minute) }));
}

export type SaveUsualTimesResult =
  { ok: true; count: number } | { ok: false; reason: 'not_allowed' } | { ok: false; reason: UsualTimesProblem };

/** Replaces the teacher's whole week (an empty list clears it). */
export async function saveUsualTimes(
  sql: Sql,
  teacherId: string,
  ranges: UsualTime[],
  now: Date = new Date(),
): Promise<SaveUsualTimesResult> {
  if (!UUID.test(teacherId)) return { ok: false, reason: 'not_allowed' };
  const problem = checkUsualTimes(ranges);
  if (problem) return { ok: false, reason: problem };
  const week = sortUsualTimes(ranges);
  return sql.begin(async (tx): Promise<SaveUsualTimesResult> => {
    // Lock the teacher: two saves at once must not mix their weeks.
    const [t] = await tx`
      SELECT a.id FROM accounts a JOIN teacher_profiles p ON p.account_id = a.id
      WHERE a.id = ${teacherId} AND a.role = 'teacher' AND a.status = 'active' AND p.approval_status = 'approved'
      FOR UPDATE OF a`;
    if (!t) return { ok: false, reason: 'not_allowed' };
    await tx`DELETE FROM teacher_usual_times WHERE teacher_id = ${teacherId}`;
    for (const r of week) {
      await tx`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute)
               VALUES (${teacherId}, ${r.weekday}, ${r.start}, ${r.end})`;
    }
    await writeAudit(
      tx,
      {
        type: 'TEACHER_USUAL_TIMES_UPDATED',
        outcome: 'success',
        actorId: teacherId,
        subjectId: teacherId,
        details: { ranges: week.length },
      },
      now,
    );
    return { ok: true, count: week.length };
  });
}
