import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { MIGRATIONS_DIR, migrate } from '../../scripts/db-migrate.mjs';
import { decideTeacher } from '@/server/admin';
import { shareOptions } from '@/server/teacherResources';
import {
  acceptLinkRequest,
  addTeacher,
  addTeacherFromDirectory,
  declineLinkRequest,
  listLinkedStudents,
  listLinkRequests,
  listMyTeachers,
  resendLinkRequest,
  teacherMaySee,
  updateTeacherLinks,
  withdrawLinkRequest,
} from '@/server/teacherLinks';
import { saveTeacherProfile } from '@/server/teacherProfile';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * CR-12 Point 1 (FR-038; OC-97, OC-101): the teacher accepts or declines each child.
 * T-REQ-1 … T-REQ-11 map to AC-1 … AC-11. Synthetic people only.
 */
const sql = testDb();
const T0 = new Date('2026-10-18T10:00:00Z');
const BASE = 'http://aa.test';
const DAY = 86_400_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

/** A parent with two children (Kiran: maths, science, english; Meera: science, maths), grade 5 CBSE and grade 4. */
async function family() {
  const parent = await createAdult(sql, 'parent');
  await sql`UPDATE accounts SET display_name = 'Anita Sample' WHERE id = ${parent}`;
  const kiran = await createChild(sql, parent);
  const meera = await createChild(sql, parent);
  const kName = `Kiran${uniq()}`;
  const mName = `Meera${uniq()}`;
  await sql`UPDATE accounts SET display_name = ${kName} WHERE id = ${kiran}`;
  await sql`UPDATE accounts SET display_name = ${mName} WHERE id = ${meera}`;
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science', 'english']}, curriculum = 'CBSE'
            WHERE account_id = ${kiran}`;
  await sql`UPDATE student_profiles SET subjects = ${['science', 'maths']}, grade = 4 WHERE account_id = ${meera}`;
  const [row] = await sql<{ email: string }[]>`SELECT email FROM accounts WHERE id = ${parent}`;
  return { parent, parentEmail: row!.email, kiran, meera, kName, mName };
}

async function approvedTeacher(subjects: string[] = ['science', 'maths', 'english']) {
  const email = `teacher-${uniq()}@example.com`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', 'active', ${email}, 'Teacher B. Sample', 'x') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${row!.id}, 'self_registered', 'approved', ${subjects}, ${[4, 5]}, ${owner}, now())`;
  return { id: row!.id, email };
}

type Fam = Awaited<ReturnType<typeof family>>;

async function ask(f: Fam, teacherEmail: string, children: Array<[string, string[]]>, now = T0, message?: string) {
  return addTeacher(
    sql,
    f.parent,
    {
      name: 'Sample',
      email: teacherEmail,
      children: children.map(([childId, subjects]) => ({ childId, subjects })),
      baseUrl: BASE,
      message,
    },
    now,
  );
}

async function requestIdFor(teacherId: string, childId: string) {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM teacher_student_links WHERE teacher_id = ${teacherId} AND student_id = ${childId}
    ORDER BY created_at DESC, id DESC LIMIT 1`;
  return row!.id;
}

async function childState(parent: string, teacherId: string, childId: string, now = T0) {
  const t = (await listMyTeachers(sql, parent, now)).find((x) => x.id === teacherId);
  return t?.children.find((c) => c.childId === childId);
}

describe('T-REQ-1 (AC-1): one waiting request per child, no access before accepting', () => {
  it('creates a request for each ticked child with its subjects; the teacher sees nothing of the children', async () => {
    const f = await family();
    const t = await approvedTeacher();
    const r = await ask(f, t.email, [
      [f.kiran, ['english']],
      [f.meera, ['science', 'maths']],
    ]);
    expect(r).toEqual({ ok: true, outcome: 'sent', teacherName: 'Teacher B. Sample', expiresAt: at(14) });
    const rows = await sql<{ student_id: string; status: string; subjects: string[]; expires_at: Date }[]>`
      SELECT student_id, status, subjects, expires_at FROM teacher_student_links WHERE teacher_id = ${t.id}`;
    expect(rows).toHaveLength(2);
    expect(rows.every((x) => x.status === 'requested' && x.expires_at.getTime() === at(14).getTime())).toBe(true);
    expect(rows.find((x) => x.student_id === f.meera)!.subjects).toEqual(['maths', 'science']);
    for (const child of [f.kiran, f.meera]) {
      expect(await teacherMaySee(sql, t.id, child)).toBe(false);
    }
    expect(await listLinkedStudents(sql, t.id)).toEqual([]);
    expect(await listLinkRequests(sql, t.id, T0)).toHaveLength(2);
    // Sharing a resource needs an active link (OC-41): waiting requests are not offered.
    expect(await shareOptions(sql, t.id)).toEqual([]);
    // The parent sees both as waiting.
    expect((await childState(f.parent, t.id, f.kiran))?.status).toBe('requested');
  });

  it('a child who already has a link or a request with this teacher is left unchanged', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await activeLink(sql, { teacher: t.id, child: f.kiran, parent: f.parent, subjects: ['english'] });
    expect(await ask(f, t.email, [[f.kiran, ['maths']]])).toEqual({
      ok: false,
      reason: 'already',
      teacherName: 'Teacher B. Sample',
    });
    expect(await ask(f, t.email, [[f.meera, ['maths']]])).toMatchObject({ ok: true });
    expect(await ask(f, t.email, [[f.meera, ['science']]])).toMatchObject({ ok: false, reason: 'already' });
    expect(await teacherMaySee(sql, t.id, f.kiran, 'maths')).toBe(false);
  });

  it('a message longer than 500 characters is refused; the database refuses one too', async () => {
    const f = await family();
    const t = await approvedTeacher();
    expect(await ask(f, t.email, [[f.kiran, ['maths']]], T0, 'x'.repeat(501))).toEqual({
      ok: false,
      reason: 'message',
    });
    await expect(
      sql`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects,
                                             requested_at, expires_at, parent_message)
          VALUES (${t.id}, ${f.kiran}, ${f.parent}, 'parent_added', 'requested', ${['maths']}, now(),
                  now() + interval '14 days', ${'x'.repeat(501)})`,
    ).rejects.toThrow(/parent_message/);
  });
});

describe('T-REQ-2 (AC-2): minimum details before accepting (Reading B)', () => {
  it('shows grade, curriculum, subjects, the parent’s first name, the message and dates; never the child', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await ask(f, t.email, [[f.kiran, ['english']]], T0, 'Help with reading,  please.');
    const [r] = await listLinkRequests(sql, t.id, T0);
    expect(r).toEqual({
      id: expect.any(String),
      grade: 5,
      curriculum: 'CBSE',
      subjects: ['english'],
      parentFirstName: 'Anita',
      message: 'Help with reading, please.',
      requestedAt: T0,
      expiresAt: at(14),
    });
    const text = JSON.stringify(r);
    expect(text).not.toContain(f.kName);
    expect(text).not.toContain(f.kiran);
    expect(text).not.toContain('Sample'); // the parent's surname
    // The teacher's email names no child either.
    const [mail] = await sql<{ template: string; payload: Record<string, string> }[]>`
      SELECT template, payload FROM email_outbox WHERE to_address = ${t.email} ORDER BY created_at DESC LIMIT 1`;
    expect(mail!.template).toBe('teacher_link_request');
    expect(JSON.stringify(mail!.payload)).not.toContain(f.kName);
  });

  it('a teacher still waiting for AA Pro approval sees no requests; approval sends them (Reading A)', async () => {
    const f = await family();
    const address = `new-${uniq()}@example.com`;
    expect(await ask(f, address, [[f.kiran, ['maths']]])).toMatchObject({ ok: true, outcome: 'waiting_approval' });
    const [teacher] = await sql<{ id: string }[]>`SELECT id FROM accounts WHERE email = ${address}`;
    expect(await listLinkRequests(sql, teacher!.id, T0)).toEqual([]);
    expect((await childState(f.parent, teacher!.id, f.kiran))?.status).toBe('pending');
    const saved = await saveTeacherProfile(
      sql,
      teacher!.id,
      {
        name: 'Teacher New',
        timeZone: 'Asia/Kolkata',
        subjects: ['maths'],
        grades: [5],
        bio: 'Primary teacher for many years.',
        curricula: [],
        experienceYears: null,
        acceptTerms: true,
      },
      'submit',
      T0,
    );
    expect(saved.ok).toBe(true);
    const owner = await createAdult(sql, 'superadmin');
    const approvedAt = at(3);
    expect(
      (
        await decideTeacher(
          sql,
          owner,
          teacher!.id,
          { decision: 'approve', note: 'Checked', baseUrl: BASE },
          approvedAt,
        )
      ).ok,
    ).toBe(true);
    const [r] = await listLinkRequests(sql, teacher!.id, approvedAt);
    // The 14 days start at approval.
    expect(r).toMatchObject({ requestedAt: approvedAt, expiresAt: at(17) });
    expect(await teacherMaySee(sql, teacher!.id, f.kiran)).toBe(false);
  });
});

describe('T-REQ-3 (AC-3): accepting one child', () => {
  it('gives access to that child and those subjects only; the other child keeps waiting', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await ask(f, t.email, [
      [f.kiran, ['english']],
      [f.meera, ['science']],
    ]);
    const r = await acceptLinkRequest(sql, t.id, await requestIdFor(t.id, f.kiran), BASE, at(1));
    expect(r).toEqual({
      ok: true,
      studentId: f.kiran,
      childName: f.kName,
      subjects: ['english'],
      parentFirstName: 'Anita',
    });
    expect(await teacherMaySee(sql, t.id, f.kiran, 'english')).toBe(true);
    expect(await teacherMaySee(sql, t.id, f.kiran, 'maths')).toBe(false);
    expect(await teacherMaySee(sql, t.id, f.meera)).toBe(false);
    expect((await listLinkRequests(sql, t.id, at(1))).map((x) => x.grade)).toEqual([4]);
    const kid = await childState(f.parent, t.id, f.kiran, at(1));
    expect(kid).toMatchObject({ status: 'active', answeredAt: at(1) });
    const mails = await sql<
      { template: string }[]
    >`SELECT template FROM email_outbox WHERE to_address = ${f.parentEmail}`;
    expect(mails.map((m) => m.template)).toContain('parent_link_request_accepted');
  });

  it('is refused when a requested subject has left the teacher’s approved profile', async () => {
    const f = await family();
    const t = await approvedTeacher(['science', 'english']);
    await ask(f, t.email, [[f.kiran, ['science', 'english']]]);
    await sql`UPDATE teacher_profiles SET subjects = ${['english']} WHERE account_id = ${t.id}`;
    expect(await acceptLinkRequest(sql, t.id, await requestIdFor(t.id, f.kiran), BASE, T0)).toEqual({
      ok: false,
      reason: 'not_taught',
    });
    expect(await teacherMaySee(sql, t.id, f.kiran)).toBe(false);
  });

  it('is refused when the parent is no longer the child’s guardian', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await ask(f, t.email, [[f.kiran, ['english']]]);
    await sql`UPDATE accounts SET status = 'deactivated', status_reason = 'Test' WHERE id = ${f.parent}`;
    expect(await acceptLinkRequest(sql, t.id, await requestIdFor(t.id, f.kiran), BASE, T0)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    // The database refuses it too.
    await expect(
      sql`UPDATE teacher_student_links SET status = 'active', answered_at = ${T0}
          WHERE teacher_id = ${t.id} AND student_id = ${f.kiran}`,
    ).rejects.toThrow(/no longer the child's guardian/);
  });
});

describe('T-REQ-4 (AC-4): declining', () => {
  it('needs a reason; the parent sees the reason and note; no access is granted', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await ask(f, t.email, [[f.kiran, ['english']]]);
    const id = await requestIdFor(t.id, f.kiran);
    expect(await declineLinkRequest(sql, t.id, id, { reason: '' }, BASE, T0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await declineLinkRequest(sql, t.id, id, { reason: 'other', note: 'x'.repeat(301) }, BASE, T0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(
      await declineLinkRequest(sql, t.id, id, { reason: 'no_time', note: 'Full until December, sorry!' }, BASE, at(2)),
    ).toEqual({ ok: true });
    expect(await teacherMaySee(sql, t.id, f.kiran)).toBe(false);
    expect(await childState(f.parent, t.id, f.kiran, at(2))).toMatchObject({
      status: 'declined',
      declineReason: 'no_time',
      declineNote: 'Full until December, sorry!',
      askAgainFrom: at(9),
    });
    expect(await acceptLinkRequest(sql, t.id, id, BASE, at(2))).toEqual({ ok: false, reason: 'answered' });
    // An ended request never comes back to life, even directly in the database.
    await expect(
      sql`UPDATE teacher_student_links SET status = 'active', removed_at = NULL, answered_at = now() WHERE id = ${id}`,
    ).rejects.toThrow(/cannot be changed/);
    await expect(
      sql`UPDATE teacher_student_links SET ended_as = 'declined', decline_reason = NULL WHERE id = ${id}`,
    ).rejects.toThrow();
  });
});

describe('T-REQ-5 (AC-5): expiry after 14 days', () => {
  it('expires; acceptance is refused by the server and the database; the parent is told', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await ask(f, t.email, [[f.kiran, ['english']]]);
    const id = await requestIdFor(t.id, f.kiran);
    // Still answerable one second before the end.
    expect(await listLinkRequests(sql, t.id, new Date(at(14).getTime() - 1000))).toHaveLength(1);
    // The database refuses an answer at or after the expiry moment, whatever the application does.
    await expect(
      sql`UPDATE teacher_student_links SET status = 'active', answered_at = ${at(14)} WHERE id = ${id}`,
    ).rejects.toThrow(/has expired/);
    expect(await acceptLinkRequest(sql, t.id, id, BASE, at(14))).toEqual({ ok: false, reason: 'expired' });
    expect(await teacherMaySee(sql, t.id, f.kiran)).toBe(false);
    expect(await listLinkRequests(sql, t.id, at(14))).toEqual([]);
    expect(await childState(f.parent, t.id, f.kiran, at(14))).toMatchObject({ status: 'expired', endedAt: at(14) });
    const mails = await sql<
      { template: string }[]
    >`SELECT template FROM email_outbox WHERE to_address = ${f.parentEmail}`;
    expect(mails.map((m) => m.template)).toContain('parent_link_request_expired');
    // Expired can be sent again at once.
    expect(await resendLinkRequest(sql, f.parent, id, BASE, at(14))).toMatchObject({ ok: true, outcome: 'sent' });
  });
});

describe('T-REQ-6 (AC-6): the 7-day wait after a decline', () => {
  it('applies to the same teacher and child on every route; other teachers and children are not affected', async () => {
    const f = await family();
    const t = await approvedTeacher();
    const other = await approvedTeacher();
    await ask(f, t.email, [[f.kiran, ['english']]]);
    const id = await requestIdFor(t.id, f.kiran);
    await declineLinkRequest(sql, t.id, id, { reason: 'personal' }, BASE, at(1));
    const wait = { ok: false, reason: 'wait', until: at(8) };
    expect(await ask(f, t.email, [[f.kiran, ['english']]], at(2))).toMatchObject({ ...wait, child: f.kName });
    expect(
      await addTeacherFromDirectory(sql, f.parent, t.id, [{ childId: f.kiran, subjects: ['maths'] }], {}, at(7)),
    ).toMatchObject({ ...wait, child: f.kName });
    expect(await resendLinkRequest(sql, f.parent, id, BASE, at(5))).toEqual({
      ok: false,
      reason: 'wait',
      until: at(8),
    });
    // The wait is checked under "change children" too.
    await ask(f, t.email, [[f.meera, ['science']]], at(2));
    expect(
      await updateTeacherLinks(
        sql,
        f.parent,
        t.id,
        [
          { childId: f.meera, subjects: ['science'] },
          { childId: f.kiran, subjects: ['english'] },
        ],
        at(3),
      ),
    ).toMatchObject({ ok: false, reason: 'wait', until: at(8) });
    // Another teacher at once; the same teacher for another child was allowed above.
    expect(await ask(f, other.email, [[f.kiran, ['english']]], at(2))).toMatchObject({ ok: true });
    // After 7 days, allowed again.
    expect(await resendLinkRequest(sql, f.parent, id, BASE, at(8))).toMatchObject({ ok: true });
    const audit = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM audit_events WHERE event_type = 'LINK_REQUEST_REFUSED' AND actor_id = ${f.parent}`;
    expect(audit[0]!.n).toBeGreaterThanOrEqual(4);
  });

  it('no wait after a withdrawal or an expiry', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await ask(f, t.email, [[f.kiran, ['english']]]);
    expect(await withdrawLinkRequest(sql, f.parent, await requestIdFor(t.id, f.kiran), T0)).toEqual({ ok: true });
    expect(await ask(f, t.email, [[f.kiran, ['english']]], T0)).toMatchObject({ ok: true });
  });
});

describe('T-REQ-7 (AC-7): withdrawing', () => {
  it('a withdrawn request cannot be accepted or declined, by the server or the database', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await ask(f, t.email, [[f.kiran, ['english']]]);
    const id = await requestIdFor(t.id, f.kiran);
    expect(await withdrawLinkRequest(sql, f.parent, id, at(1))).toEqual({ ok: true });
    expect(await withdrawLinkRequest(sql, f.parent, id, at(1))).toEqual({ ok: false, reason: 'answered' });
    expect(await acceptLinkRequest(sql, t.id, id, BASE, at(1))).toEqual({ ok: false, reason: 'withdrawn' });
    expect(await declineLinkRequest(sql, t.id, id, { reason: 'other' }, BASE, at(1))).toEqual({
      ok: false,
      reason: 'withdrawn',
    });
    await expect(
      sql`UPDATE teacher_student_links SET status = 'active', answered_at = ${at(1)} WHERE id = ${id}`,
    ).rejects.toThrow(/cannot be changed/);
    expect(await childState(f.parent, t.id, f.kiran, at(1))).toMatchObject({ status: 'withdrawn' });
  });

  it('an accepted link cannot be "withdrawn" as a request', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await ask(f, t.email, [[f.kiran, ['english']]]);
    const id = await requestIdFor(t.id, f.kiran);
    await acceptLinkRequest(sql, t.id, id, BASE, T0);
    expect(await withdrawLinkRequest(sql, f.parent, id, T0)).toEqual({ ok: false, reason: 'answered' });
    expect(await teacherMaySee(sql, t.id, f.kiran)).toBe(true);
  });
});

describe('T-REQ-8 (AC-8): existing active links are kept', () => {
  it('migration 0020 leaves active and waiting links exactly as they were', async () => {
    const name = `aa_mig_${randomBytes(5).toString('hex')}`;
    await sql.unsafe(`CREATE DATABASE ${name}`);
    const testUrl = new URL(inject('databaseUrl'));
    testUrl.pathname = `/${name}`;
    const other = postgres(testUrl.toString(), { max: 1, onnotice: () => {} });
    const dir = await mkdtemp(path.join(tmpdir(), 'aa-mig-'));
    try {
      await cp(MIGRATIONS_DIR, dir, { recursive: true });
      await rm(path.join(dir, '0020_teacher_link_requests.sql'));
      await migrate(other, { dir });
      const parent = await createAdult(other as never, 'parent');
      const child = await createChild(other as never, parent);
      const [t] = await other<{ id: string }[]>`
        INSERT INTO accounts (role, status, email, display_name) VALUES ('teacher', 'active', 'old@example.com', 'Old')
        RETURNING id`;
      const owner = await createAdult(other as never, 'superadmin');
      await other`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, decided_by, decided_at)
                  VALUES (${t!.id}, 'self_registered', 'approved', ${['maths']}, ${owner}, now())`;
      const [link] = await other<{ id: string; created_at: Date }[]>`
        INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
        VALUES (${t!.id}, ${child}, ${parent}, 'parent_added', 'active', ${['maths']}) RETURNING id, created_at`;
      await migrate(other);
      const [after] = await other<
        { status: string; subjects: string[]; created_at: Date; requested_at: Date | null }[]
      >`
        SELECT status, subjects, created_at, requested_at FROM teacher_student_links WHERE id = ${link!.id}`;
      expect(after).toEqual({
        status: 'active',
        subjects: ['maths'],
        created_at: link!.created_at,
        requested_at: null,
      });
      expect(await teacherMaySee(other as never, t!.id, child, 'maths')).toBe(true);
    } finally {
      await other.end();
      await sql.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('an active link stays active through expiry runs and subject changes, with no re-acceptance', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await activeLink(sql, { teacher: t.id, child: f.kiran, parent: f.parent, subjects: ['english'] });
    await listMyTeachers(sql, f.parent, at(400));
    expect(
      await updateTeacherLinks(sql, f.parent, t.id, [{ childId: f.kiran, subjects: ['english', 'maths'] }], at(400)),
    ).toEqual({ ok: true, removed: false, requested: 0 });
    expect(await teacherMaySee(sql, t.id, f.kiran, 'maths')).toBe(true);
    expect((await childState(f.parent, t.id, f.kiran, at(400)))?.status).toBe('active');
  });

  it('a new link can no longer be created active, even directly in the database', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await expect(
      sql`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
          VALUES (${t.id}, ${f.kiran}, ${f.parent}, 'parent_added', 'active', ${['maths']})`,
    ).rejects.toThrow(/must be a request/);
  });
});

describe('T-REQ-9 (AC-9): answers at the same moment give one result', () => {
  it('accept and withdraw together', async () => {
    for (let i = 0; i < 3; i += 1) {
      const f = await family();
      const t = await approvedTeacher();
      await ask(f, t.email, [[f.kiran, ['english']]]);
      const id = await requestIdFor(t.id, f.kiran);
      const [a, w] = await Promise.all([
        acceptLinkRequest(sql, t.id, id, BASE, T0),
        withdrawLinkRequest(sql, f.parent, id, T0),
      ]);
      expect([a.ok, w.ok].filter(Boolean)).toHaveLength(1);
      const [row] = await sql<{ status: string; ended_as: string | null }[]>`
        SELECT status, ended_as FROM teacher_student_links WHERE id = ${id}`;
      expect(row).toEqual(a.ok ? { status: 'active', ended_as: null } : { status: 'removed', ended_as: 'withdrawn' });
      expect(await teacherMaySee(sql, t.id, f.kiran)).toBe(a.ok);
    }
  });

  it('accept twice, and accept with decline', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await ask(f, t.email, [
      [f.kiran, ['english']],
      [f.meera, ['science']],
    ]);
    const k = await requestIdFor(t.id, f.kiran);
    const twice = await Promise.all([
      acceptLinkRequest(sql, t.id, k, BASE, T0),
      acceptLinkRequest(sql, t.id, k, BASE, T0),
    ]);
    expect(twice.filter((r) => r.ok)).toHaveLength(1);
    expect(twice.find((r) => !r.ok)).toEqual({ ok: false, reason: 'answered' });
    const m = await requestIdFor(t.id, f.meera);
    const mixed = await Promise.all([
      acceptLinkRequest(sql, t.id, m, BASE, T0),
      declineLinkRequest(sql, t.id, m, { reason: 'no_time' }, BASE, T0),
    ]);
    expect(mixed.filter((r) => r.ok)).toHaveLength(1);
  });

  it('two requests sent at once for the same teacher and child make one', async () => {
    const f = await family();
    const t = await approvedTeacher();
    const both = await Promise.all([
      ask(f, t.email, [[f.kiran, ['english']]]),
      ask(f, t.email, [[f.kiran, ['english']]]),
    ]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.find((r) => !r.ok)).toMatchObject({ reason: 'already' });
  });
});

describe('T-REQ-10 (AC-10): who can see and answer requests', () => {
  it('only the teacher asked, while approved and active', async () => {
    const f = await family();
    const t = await approvedTeacher();
    await ask(f, t.email, [[f.kiran, ['english']]]);
    const id = await requestIdFor(t.id, f.kiran);
    const otherTeacher = await approvedTeacher();
    const otherParent = await createAdult(sql, 'parent');
    const admin = await createAdult(sql, 'superadmin');
    for (const who of [otherTeacher.id, otherParent, f.parent, f.kiran, admin, 'not-a-uuid']) {
      expect(await listLinkRequests(sql, who, T0)).toEqual([]);
      expect(await acceptLinkRequest(sql, who, id, BASE, T0)).toEqual({ ok: false, reason: 'not_found' });
      expect(await declineLinkRequest(sql, who, id, { reason: 'other' }, BASE, T0)).toEqual({
        ok: false,
        reason: 'not_found',
      });
    }
    // Another parent cannot withdraw it, see it, or send it again.
    expect(await withdrawLinkRequest(sql, otherParent, id, T0)).toEqual({ ok: false, reason: 'not_found' });
    expect(await listMyTeachers(sql, otherParent, T0)).toEqual([]);
    // A deactivated teacher can neither see nor answer.
    await sql`UPDATE accounts SET status = 'deactivated', status_reason = 'Test' WHERE id = ${t.id}`;
    expect(await listLinkRequests(sql, t.id, T0)).toEqual([]);
    expect(await acceptLinkRequest(sql, t.id, id, BASE, T0)).toEqual({ ok: false, reason: 'not_allowed' });
    await expect(
      sql`UPDATE teacher_student_links SET status = 'active', answered_at = ${T0} WHERE id = ${id}`,
    ).rejects.toThrow(/active teacher account|approved teacher/);
    expect(await teacherMaySee(sql, t.id, f.kiran)).toBe(false);
  });
});

describe('T-REQ-11 (AC-11): audit trail', () => {
  it('records each change without the parent’s message or the decline note', async () => {
    const f = await family();
    const t = await approvedTeacher();
    const secret = `msg-${uniq()}`;
    const note = `note-${uniq()}`;
    await ask(
      f,
      t.email,
      [
        [f.kiran, ['english']],
        [f.meera, ['science']],
      ],
      T0,
      secret,
    );
    await acceptLinkRequest(sql, t.id, await requestIdFor(t.id, f.kiran), BASE, T0);
    await declineLinkRequest(sql, t.id, await requestIdFor(t.id, f.meera), { reason: 'not_a_fit', note }, BASE, T0);
    await acceptLinkRequest(sql, t.id, await requestIdFor(t.id, f.meera), BASE, T0);
    const rows = await sql<{ event_type: string; details: Record<string, unknown> }[]>`
      SELECT event_type, details FROM audit_events
      WHERE subject_id = ANY(${[t.id, f.kiran, f.meera]}) OR actor_id = ${t.id}`;
    const types = rows.map((r) => r.event_type);
    expect(types).toEqual(
      expect.arrayContaining([
        'LINK_REQUEST_SENT',
        'LINK_REQUEST_ACCEPTED',
        'LINK_REQUEST_DECLINED',
        'LINK_REQUEST_REFUSED',
      ]),
    );
    expect(rows.find((r) => r.event_type === 'LINK_REQUEST_DECLINED')!.details).toMatchObject({ reason: 'not_a_fit' });
    const all = JSON.stringify(rows);
    expect(all).not.toContain(secret);
    expect(all).not.toContain(note);
  });
});
