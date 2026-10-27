import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/db-migrate.mjs';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * DRAFT M2 (0030, CR-17 PR 3) — not approved. Database rules, concurrency and rollback for the
 * teacher meeting-link tables, on a separate throw-away database. Nothing here touches any shared
 * database. Synthetic accounts only.
 */
const admin = testDb();
const name = `m2_${uniq()}`;
let sql: postgres.Sql;
let url: string;

beforeAll(async () => {
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const u = new URL(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres');
  u.pathname = `/${name}`;
  url = u.toString();
  sql = postgres(url, { max: 4, onnotice: () => {} });
  await migrate(sql);
});
afterAll(async () => {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
});

const s = () => sql as unknown as Parameters<typeof createAdult>[0];

async function teacher() {
  const id = await createAdult(s(), 'teacher');
  const owner = await createAdult(s(), 'superadmin');
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${id}, 'self_registered', 'approved', ${['maths']}, ${[5]}, ${owner}, now())`;
  return id;
}
/** Two parents of one child, linked to a teacher in maths, with a confirmed lesson in 3 days. */
async function family() {
  const t = await teacher();
  const parent = await createAdult(s(), 'parent');
  const parent2 = await createAdult(s(), 'parent');
  const child = await createChild(s(), parent);
  await sql`UPDATE student_profiles SET subjects = ${['maths']} WHERE account_id = ${child}`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  const link = await activeLink(s(), { teacher: t, child, parent, subjects: ['maths'] });
  const lesson = await rawLesson(t, child, parent, 'confirmed', "interval '3 days'");
  return { t, parent, parent2, child, link, lesson };
}
/** A lesson row inserted with triggers skipped (these tests are about M2, not M1's rules). */
async function rawLesson(t: string, child: string, parent: string, status: string, from: string) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [l] = await tx.unsafe<{ id: string }[]>(
      `INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                            reply_deadline, status, confirmed_at, currency, rate_minor, price_minor, price_basis)
       SELECT $1, $2, $3, 'maths', s, 30, s + interval '30 minutes', q,
              LEAST(q + interval '48 hours', s - interval '2 hours'), $4,
              CASE WHEN $4 = 'confirmed' THEN q + interval '1 minute' END, 'INR', 60000, 30000, 'listed'
       FROM (SELECT s, s - interval '3 days' AS q FROM (SELECT date_trunc('minute', now()) + ${from} AS s) y) x RETURNING id`,
      [t, child, parent, status],
    );
    return l!.id;
  });
}
const allow = (f: { t: string; child: string; parent: string }, by = f.parent) =>
  sql`INSERT INTO meeting_link_permissions (teacher_id, student_id, granted_by) VALUES (${f.t}, ${f.child}, ${by}) RETURNING id`;
const setLink = (lesson: string, by: string, link = 'https://us02web.zoom.us/wc/join/81234567890?pwd=abc123') =>
  sql`INSERT INTO lesson_meeting_links (lesson_id, url, set_by) VALUES (${lesson}, ${link}, ${by})
      ON CONFLICT (lesson_id) DO UPDATE SET url = EXCLUDED.url, set_by = EXCLUDED.set_by
      RETURNING version, delete_after`;
const refused = async (p: PromiseLike<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return 'accepted';
};
const linkCount = async (lesson: string) =>
  (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM lesson_meeting_links WHERE lesson_id = ${lesson}`)[0]!.n;

describe('M2 draft: parent permission (D3A-1)', () => {
  it('only a parent of the child, for a linked teacher; one live permission; withdrawn once by either parent', async () => {
    const f = await family();
    const stranger = await createAdult(s(), 'parent');
    const other = await teacher();
    expect(await refused(allow(f, stranger))).toBe('23514');
    expect(await refused(allow({ ...f, t: other }))).toBe('23514');
    const [p] = await allow(f);
    expect(await refused(allow(f, f.parent2))).toBe('23505'); // one live permission per teacher and child
    expect(
      await refused(
        sql`UPDATE meeting_link_permissions SET withdrawn_how = 'parent', withdrawn_by = ${stranger} WHERE id = ${p!.id}`,
      ),
    ).toBe('23514');
    expect(
      await refused(
        sql`UPDATE meeting_link_permissions SET granted_at = now() - interval '1 year' WHERE id = ${p!.id}`,
      ),
    ).toBe('23514');
    await sql`UPDATE meeting_link_permissions SET withdrawn_how = 'parent', withdrawn_by = ${f.parent2} WHERE id = ${p!.id}`;
    expect(
      await refused(
        sql`UPDATE meeting_link_permissions SET withdrawn_how = 'parent', withdrawn_by = ${f.parent} WHERE id = ${p!.id}`,
      ),
    ).toBe('23514');
    await allow(f, f.parent2); // allowed again later: a new row, history kept
    expect((await sql`SELECT 1 FROM meeting_link_permissions WHERE teacher_id = ${f.t}`).length).toBe(2);
  });

  it('removing the teacher-child link withdraws the permission (AA Pro), and the link-sharing stops', async () => {
    const f = await family();
    await allow(f);
    await setLink(f.lesson, f.t);
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE id = ${f.link}`;
    const [p] = await sql<{ withdrawn_how: string; withdrawn_by: string | null }[]>`
      SELECT withdrawn_how, withdrawn_by FROM meeting_link_permissions WHERE teacher_id = ${f.t}`;
    expect(p).toEqual({ withdrawn_how: 'aa_pro', withdrawn_by: null });
    expect(await refused(setLink(f.lesson, f.t, 'https://zoom.us/wc/join/2'))).toBe('23514');
  });
});

describe('M2 draft: meeting links', () => {
  it('accepts only https zoom.us addresses up to 500 characters', async () => {
    const f = await family();
    await allow(f);
    for (const ok of [
      'https://zoom.us/wc/join/81234567890',
      'https://us06web.zoom.us/wc/join/8123?pwd=Ab.c-d_e',
      'https://zoom.us',
    ])
      expect(await refused(setLink(f.lesson, f.t, ok))).toBe('accepted');
    for (const bad of [
      'http://zoom.us/wc/join/1',
      'https://evilzoom.us/wc/join/1',
      'https://zoom.us.evil.com/j/1',
      'https://~@zoom.us/wc/join/1',
      'https://zoom.us:8443/j/1',
      'https://ZOOM.US/wc/join/1',
      'https://zoom.us/wc/join/1 onclick=x',
      'javascript:alert(1)',
      'https://bit.ly/abc',
      `https://zoom.us/wc/join/${'1'.repeat(490)}`,
    ])
      expect(await refused(setLink(f.lesson, f.t, bad))).toBe('23514');
  });

  it('only the lesson’s own teacher, only on a confirmed lesson that has not ended, only while allowed', async () => {
    const f = await family();
    const other = await teacher();
    expect(await refused(setLink(f.lesson, f.t))).toBe('23514'); // no permission yet
    await allow(f);
    expect(await refused(setLink(f.lesson, other))).toBe('23514');
    expect(await refused(setLink(f.lesson, f.parent))).toBe('23514');
    const requested = await rawLesson(f.t, f.child, f.parent, 'requested', "interval '5 days'");
    expect(await refused(setLink(requested, f.t))).toBe('23514');
    const ended = await rawLesson(f.t, f.child, f.parent, 'confirmed', "- interval '2 hours'");
    expect(await refused(setLink(ended, f.t))).toBe('23514');
    const [r] = await setLink(f.lesson, f.t);
    const [l] = await sql<{ ends_at: Date }[]>`SELECT ends_at FROM lessons WHERE id = ${f.lesson}`;
    expect(r!.version).toBe(1);
    expect(r!.delete_after.getTime()).toBe(l!.ends_at.getTime() + 7 * 86_400_000); // D3A-8
    const [r2] = await setLink(f.lesson, f.t, 'https://zoom.us/wc/join/999');
    expect(r2!.version).toBe(2);
    expect(
      await refused(
        sql`UPDATE lesson_meeting_links SET delete_after = now() + interval '1 year' WHERE lesson_id = ${f.lesson}`,
      ),
    ).toBe('accepted');
    const [kept] = await sql<
      { delete_after: Date }[]
    >`SELECT delete_after FROM lesson_meeting_links WHERE lesson_id = ${f.lesson}`;
    expect(kept!.delete_after.getTime()).toBe(l!.ends_at.getTime() + 7 * 86_400_000); // reset by the database
    await sql`UPDATE meeting_link_permissions SET withdrawn_how = 'parent', withdrawn_by = ${f.parent} WHERE teacher_id = ${f.t}`;
    expect(await refused(setLink(f.lesson, f.t, 'https://zoom.us/wc/join/3'))).toBe('23514');
  });

  it('a cancelled lesson keeps no link; the purge removes only links past delete-after', async () => {
    const f = await family();
    await allow(f);
    await setLink(f.lesson, f.t);
    const due = await rawLesson(f.t, f.child, f.parent, 'confirmed', "interval '4 days'");
    await setLink(due, f.t);
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE lesson_meeting_links SET delete_after = now() - interval '1 minute' WHERE lesson_id = ${due}`;
    });
    const [{ n }] = (await sql<{ n: number }[]>`SELECT meeting_links_purge() AS n`) as unknown as [{ n: number }];
    expect(n).toBe(1);
    expect(await linkCount(due)).toBe(0);
    expect(await linkCount(f.lesson)).toBe(1);
    await sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      await tx`UPDATE lessons SET status = 'cancelled', closed_at = now(), closed_by = 'parent', closed_by_account = ${f.parent}
               WHERE id = ${f.lesson}`;
    });
    // Replica mode skipped the trigger above; do the real thing on a second lesson.
    const live = await rawLesson(f.t, f.child, f.parent, 'confirmed', "interval '6 days'");
    await setLink(live, f.t);
    await sql`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${live}`;
    expect(await linkCount(live)).toBe(0);
  });

  it('deleting a teacher or parent account does not get stuck on the guards', async () => {
    const f = await family();
    await allow(f, f.parent2);
    await setLink(f.lesson, f.t);
    await sql`DELETE FROM accounts WHERE id = ${f.parent2}`; // granted_by -> NULL through the guard
    const [p] = await sql<
      { granted_by: string | null }[]
    >`SELECT granted_by FROM meeting_link_permissions WHERE student_id = ${f.child}`;
    expect(p!.granted_by).toBeNull();
    await sql`DELETE FROM accounts WHERE id = ${f.t}`;
    expect(await linkCount(f.lesson)).toBe(0);
    expect(await sql`SELECT 1 FROM meeting_link_permissions WHERE student_id = ${f.child}`).toHaveLength(0);
  });
});

describe('M2 draft: concurrency on two real connections', () => {
  const two = () =>
    [postgres(url, { max: 1, onnotice: () => {} }), postgres(url, { max: 1, onnotice: () => {} })] as const;

  it('cancel first, link second: the link is refused once the cancellation commits', async () => {
    const f = await family();
    await allow(f);
    const [a, b] = two();
    try {
      const cancel = a.begin(async (tx) => {
        await tx`UPDATE lessons SET status = 'cancelled', closed_by = 'teacher', closed_by_account = ${f.t} WHERE id = ${f.lesson}`;
        await tx`SELECT pg_sleep(0.4)`;
      });
      await new Promise((r) => setTimeout(r, 100));
      const link = refused(
        b`INSERT INTO lesson_meeting_links (lesson_id, url, set_by) VALUES (${f.lesson}, 'https://zoom.us/wc/join/1', ${f.t})`,
      );
      await cancel;
      expect(await link).toBe('23514');
      expect(await linkCount(f.lesson)).toBe(0);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('link first, cancel second: the cancellation waits, then removes the link', async () => {
    const f = await family();
    await allow(f);
    const [a, b] = two();
    try {
      const link = a.begin(async (tx) => {
        await tx`INSERT INTO lesson_meeting_links (lesson_id, url, set_by) VALUES (${f.lesson}, 'https://zoom.us/wc/join/1', ${f.t})`;
        await tx`SELECT pg_sleep(0.4)`;
      });
      await new Promise((r) => setTimeout(r, 100));
      const cancel = b`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${f.lesson}`;
      await link;
      await cancel;
      expect(await linkCount(f.lesson)).toBe(0);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('withdrawal and a new link at the same moment: never a link saved after the withdrawal', async () => {
    const f = await family();
    await allow(f);
    const [a, b] = two();
    try {
      const withdraw = a.begin(async (tx) => {
        await tx`UPDATE meeting_link_permissions SET withdrawn_how = 'parent', withdrawn_by = ${f.parent} WHERE teacher_id = ${f.t}`;
        await tx`SELECT pg_sleep(0.4)`;
      });
      await new Promise((r) => setTimeout(r, 100));
      const link = refused(
        b`INSERT INTO lesson_meeting_links (lesson_id, url, set_by) VALUES (${f.lesson}, 'https://zoom.us/wc/join/1', ${f.t})`,
      );
      await withdraw;
      expect(await link).toBe('23514');
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('both parents allow at the same moment: exactly one live permission', async () => {
    const f = await family();
    const [a, b] = two();
    try {
      const r = await Promise.all([
        refused(
          a`INSERT INTO meeting_link_permissions (teacher_id, student_id, granted_by) VALUES (${f.t}, ${f.child}, ${f.parent})`,
        ),
        refused(
          b`INSERT INTO meeting_link_permissions (teacher_id, student_id, granted_by) VALUES (${f.t}, ${f.child}, ${f.parent2})`,
        ),
      ]);
      expect(r.sort()).toEqual(['23505', 'accepted']);
    } finally {
      await a.end();
      await b.end();
    }
  });
});

describe('M2 draft: rollback', () => {
  it('reverts cleanly, removes only M2 tables and link notifications, and can be applied again', async () => {
    const f = await family();
    await allow(f);
    await setLink(f.lesson, f.t);
    const note = (type: string) => sql`
      INSERT INTO notifications (recipient_id, kind, type, title, href, entity_type, entity_id, dedupe_key)
      VALUES (${f.parent}, 'update', ${type}, 'Sample', '/parent', 'lesson', ${f.lesson}, ${`${type}:${uniq()}`})`;
    await note('lesson_link_added');
    await note('lesson_accepted');
    // Link-level notifications (about the teacher-child link): removed only for the two M2 types.
    const linkNote = (type: string) => sql`
      INSERT INTO notifications (recipient_id, kind, type, title, href, entity_type, entity_id, dedupe_key)
      VALUES (${f.parent}, 'update', ${type}, 'Sample', '/parent', 'link_request', ${f.link}, ${`${type}:${uniq()}`})`;
    await linkNote('meeting_links_allowed');
    await linkNote('meeting_links_stopped');
    await linkNote('link_accepted');
    const lessonsBefore = (await sql`SELECT count(*)::int AS n FROM lessons`)[0]!.n;

    // M3 (0031) depends on M2's tables, so it is reverted first (and applied again afterwards).
    const revertM3 = await readFile(new URL('../../db/rollback/0031_revert_kept_lessons.sql', import.meta.url), 'utf8');
    await sql.begin((tx) => tx.unsafe(revertM3));
    const revert = await readFile(new URL('../../db/rollback/0030_revert_meeting_links.sql', import.meta.url), 'utf8');
    await sql.begin((tx) => tx.unsafe(revert));
    expect(
      await sql`SELECT 1 FROM information_schema.tables WHERE table_name IN ('lesson_meeting_links', 'meeting_link_permissions')`,
    ).toHaveLength(0);
    expect(
      await sql`SELECT 1 FROM pg_proc WHERE proname LIKE '%meeting%' OR proname = 'lessons_drop_link_on_cancel'`,
    ).toHaveLength(0);
    expect(
      await sql`SELECT 1 FROM pg_trigger WHERE tgname IN ('lessons_drop_link_on_cancel', 'teacher_links_withdraw_meeting_permission')`,
    ).toHaveLength(0);
    expect((await sql`SELECT type FROM notifications WHERE entity_id = ${f.lesson}`).map((r) => r.type)).toEqual([
      'lesson_accepted',
    ]);
    expect((await sql`SELECT type FROM notifications WHERE entity_id = ${f.link}`).map((r) => r.type)).toEqual([
      'link_accepted',
    ]);
    expect((await sql`SELECT count(*)::int AS n FROM lessons`)[0]!.n).toBe(lessonsBefore);
    // M1 still works after the revert: cancelling a lesson no longer touches a missing table.
    await sql`UPDATE lessons SET status = 'cancelled', closed_by = 'parent', closed_by_account = ${f.parent} WHERE id = ${f.lesson}`;

    const forward = await readFile(new URL('../../db/migrations/0030_meeting_links.sql', import.meta.url), 'utf8');
    await sql.begin((tx) => tx.unsafe(forward));
    const forwardM3 = await readFile(new URL('../../db/migrations/0031_kept_lessons.sql', import.meta.url), 'utf8');
    await sql.begin((tx) => tx.unsafe(forwardM3));
    expect(
      await sql`SELECT 1 FROM information_schema.tables WHERE table_name IN ('lesson_meeting_links', 'meeting_link_permissions')`,
    ).toHaveLength(2);
  });
});

describe('M2 draft: two builds migrating at the same moment', () => {
  it('0030 is applied exactly once; both runs finish; the second finds nothing to do', async () => {
    const { mkdtemp, readdir, copyFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const src = new URL('../../db/migrations/', import.meta.url).pathname;
    const upTo29 = await mkdtemp(join(tmpdir(), 'm2-'));
    for (const f of await readdir(src)) if (f < '0030') await copyFile(join(src, f), join(upTo29, f));
    const dbName = `m2c_${uniq()}`;
    await admin.unsafe(`CREATE DATABASE ${dbName}`);
    const u = new URL(url);
    u.pathname = `/${dbName}`;
    const a = postgres(u.toString(), { max: 1, onnotice: () => {} });
    const b = postgres(u.toString(), { max: 1, onnotice: () => {} });
    try {
      await migrate(a, { dir: upTo29 }); // the test database as it is today: 0001-0029
      // Both runs apply everything after 0029 exactly once between them (0030, 0031 since M3, and 0032 since TL-1).
      const [ra, rb] = await Promise.all([migrate(a), migrate(b)]);
      expect([...ra, ...rb].sort()).toEqual([
        '0030_meeting_links.sql',
        '0031_kept_lessons.sql',
        '0032_lesson_chapters.sql',
      ]);
      const rows = await a`SELECT name FROM schema_migrations WHERE name = '0030_meeting_links.sql'`;
      expect(rows).toHaveLength(1);
    } finally {
      await a.end();
      await b.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await rm(upTo29, { recursive: true, force: true });
    }
  });
});
