import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { endAiSession, getAiAllowance, markNoService, markTutorOutput, startAiSession } from '@/server/aiSessions';
import { createAdult, createChild, testDb } from './helpers';

/** OC-89(4): one 15-minute AI Tutor session per child in any rolling 24 hours, enforced on the server. */
const sql = testDb();
afterAll(() => sql.end());

const T0 = new Date('2026-10-20T10:00:00Z');
const MIN = 60_000;
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);

async function family() {
  const parent = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  return { parent, child };
}

const start = (child: string, now: Date, key = randomUUID(), subject = 'maths') =>
  startAiSession(sql, child, { requestKey: key, subject }, now);

describe('session length', () => {
  it('a session lasts 15 minutes at most, and never past a booked end', async () => {
    const { child } = await family();
    const r = await start(child, T0);
    expect(r.ok && r.session.endsAt.getTime() - r.session.startedAt.getTime()).toBe(15 * MIN);
    const other = await family();
    const short = await startAiSession(
      sql,
      other.child,
      { requestKey: randomUUID(), subject: 'maths', endsBy: at(6) },
      T0,
    );
    expect(short.ok && short.session.endsAt).toEqual(at(6));
    const late = await startAiSession(
      sql,
      other.child,
      { requestKey: randomUUID(), subject: 'maths', endsBy: at(90) },
      at(1),
    );
    // Still the same running session; a booked end later than 15 minutes is ignored.
    expect(late.ok && late.rejoined).toBe(true);
  });

  it('the database refuses a session longer than 15 minutes', async () => {
    const { child } = await family();
    await expect(
      sql`INSERT INTO ai_sessions (student_id, request_key, subject, started_at, ends_at)
          VALUES (${child}, ${randomUUID()}, 'maths', ${T0}, ${at(16)})`,
    ).rejects.toThrow(/ai_sessions_length/);
  });
});

describe('one session in any rolling 24 hours, any subject', () => {
  it('refuses a second start until exactly 24 hours after the first, with the time shown', async () => {
    const { child } = await family();
    expect((await start(child, T0)).ok).toBe(true);
    const again = await start(child, at(30), randomUUID(), 'science');
    expect(again).toEqual({ ok: false, reason: 'daily_limit', nextAvailableAt: at(24 * 60) });
    expect((await start(child, at(24 * 60 - 1), randomUUID(), 'english')).ok).toBe(false);
    expect((await start(child, at(24 * 60), randomUUID(), 'english')).ok).toBe(true);
  });

  it('the database refuses a second session within 24 hours even without the app check', async () => {
    const { child } = await family();
    await start(child, T0);
    await sql`UPDATE ai_sessions SET status = 'ended', end_reason = 'time_up', ended_at = ends_at WHERE student_id = ${child}`;
    await expect(
      sql`INSERT INTO ai_sessions (student_id, request_key, subject, started_at, ends_at)
          VALUES (${child}, ${randomUUID()}, 'science', ${at(120)}, ${at(135)})`,
    ).rejects.toThrow(/ai daily limit/);
  });

  it('each child has their own allowance', async () => {
    const parent = await createAdult(sql, 'parent');
    const a = await createChild(sql, parent);
    const b = await createChild(sql, parent);
    expect((await start(a, T0)).ok).toBe(true);
    expect((await start(b, T0)).ok).toBe(true);
  });
});

describe('no duplicates: refresh, second tab, second browser, double click', () => {
  it('the same request key returns the same session', async () => {
    const { child } = await family();
    const key = randomUUID();
    const first = await start(child, T0, key);
    const second = await start(child, at(1), key);
    expect(first.ok && second.ok && second.session.id === first.session.id && second.rejoined).toBe(true);
  });

  it('a different page while a session runs rejoins it without adding time', async () => {
    const { child } = await family();
    const first = await start(child, T0);
    const other = await start(child, at(5), randomUUID(), 'science');
    expect(other.ok && first.ok && other.session.id === first.session.id).toBe(true);
    expect(other.ok && other.session.endsAt).toEqual(at(15));
    expect(other.ok && other.session.subject).toBe('maths');
  });

  it('ten starts at the same moment make exactly one session', async () => {
    const { child } = await family();
    const results = await Promise.all(Array.from({ length: 10 }, () => start(child, T0)));
    const ids = new Set(results.flatMap((r) => (r.ok ? [r.session.id] : [])));
    expect(ids.size).toBe(1);
    const [count] = await sql<
      Array<{ n: number }>
    >`SELECT count(*)::int AS n FROM ai_sessions WHERE student_id = ${child}`;
    expect(count!.n).toBe(1);
  });

  it('the database allows only one active session per child', async () => {
    const { child } = await family();
    await start(child, T0);
    // Even a day later, a second row cannot be "active" while the first one still is.
    await expect(
      sql`INSERT INTO ai_sessions (student_id, request_key, subject, started_at, ends_at)
          VALUES (${child}, ${randomUUID()}, 'maths', ${at(30 * 60)}, ${at(30 * 60 + 15)})`,
    ).rejects.toThrow(/ai_sessions_one_active/);
  });
});

describe('interrupted and abandoned sessions', () => {
  it('an interrupted session can be rejoined until its end; afterwards it counts as used', async () => {
    const { child } = await family();
    const key = randomUUID();
    await start(child, T0, key);
    const back = await start(child, at(14), key);
    expect(back.ok && back.rejoined).toBe(true);
    const after = await start(child, at(16), key);
    expect(after).toEqual({ ok: false, reason: 'daily_limit', nextAvailableAt: at(24 * 60) });
    const [row] = await sql<Array<{ status: string; end_reason: string }>>`
      SELECT status, end_reason FROM ai_sessions WHERE student_id = ${child}`;
    expect(row).toEqual({ status: 'ended', end_reason: 'time_up' });
  });

  it('ending early still uses the day’s session', async () => {
    const { child } = await family();
    const r = await start(child, T0);
    if (!r.ok) throw new Error('start failed');
    expect(await endAiSession(sql, child, r.session.id, at(3))).toBe(true);
    expect(await start(child, at(4))).toMatchObject({ ok: false, reason: 'daily_limit' });
  });

  it('a session the AI service never served (no output, within 3 minutes) does not count', async () => {
    const { child } = await family();
    const r = await start(child, T0);
    if (!r.ok) throw new Error('start failed');
    expect(await markNoService(sql, r.session.id, at(2))).toBe(true);
    expect((await start(child, at(3))).ok).toBe(true);
  });

  it('once the tutor has spoken, or after 3 minutes, a failure still counts', async () => {
    const a = await family();
    const r1 = await start(a.child, T0);
    if (!r1.ok) throw new Error('start failed');
    await markTutorOutput(sql, r1.session.id, at(0.5));
    expect(await markNoService(sql, r1.session.id, at(1))).toBe(false);
    const b = await family();
    const r2 = await start(b.child, T0);
    if (!r2.ok) throw new Error('start failed');
    expect(await markNoService(sql, r2.session.id, at(4))).toBe(false);
  });
});

describe('who can see and act', () => {
  it('the child and their parent see the allowance; another parent, a teacher and strangers do not', async () => {
    const { parent, child } = await family();
    await start(child, T0);
    const own = await getAiAllowance(sql, child, child, at(1));
    expect(own).toMatchObject({ canStart: false, sessionMinutes: 15, nextAvailableAt: at(24 * 60) });
    expect(own?.active?.endsAt).toEqual(at(15));
    expect(await getAiAllowance(sql, parent, child, at(1))).toMatchObject({ canStart: false });
    expect(await getAiAllowance(sql, await createAdult(sql, 'parent'), child, at(1))).toBeNull();
    expect(await getAiAllowance(sql, await createAdult(sql, 'teacher'), child, at(1))).toBeNull();
    expect(await getAiAllowance(sql, randomUUID(), child, at(1))).toBeNull();
  });

  it('only a student account can start; a parent cannot start one for the child', async () => {
    const { parent } = await family();
    expect(await startAiSession(sql, parent, { requestKey: randomUUID(), subject: 'maths' }, T0)).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  it('a parent can end the child’s session; another parent cannot', async () => {
    const { parent, child } = await family();
    const r = await start(child, T0);
    if (!r.ok) throw new Error('start failed');
    expect(await endAiSession(sql, await createAdult(sql, 'parent'), r.session.id, at(1))).toBe(false);
    expect(await endAiSession(sql, parent, r.session.id, at(1))).toBe(true);
  });

  it('rejects bad input', async () => {
    const { child } = await family();
    expect(await startAiSession(sql, child, { requestKey: 'x', subject: 'maths' }, T0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await startAiSession(sql, child, { requestKey: randomUUID(), subject: 'magic' }, T0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('records starts and refusals in the audit log', async () => {
    const { child } = await family();
    await start(child, T0);
    await start(child, at(60));
    const events = await sql<Array<{ event_type: string }>>`
      SELECT event_type FROM audit_events WHERE subject_id = ${child} ORDER BY occurred_at, id`;
    expect(events.map((e) => e.event_type)).toEqual(['AI_SESSION_STARTED', 'AI_SESSION_REFUSED']);
  });
});
