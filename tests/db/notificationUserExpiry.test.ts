import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadViewer } from '@/server/notifications/access';
import { menuBadges } from '@/server/notifications/badges';
import { listNotifications, refreshBell, unreadCount } from '@/server/notifications/queries';
import { runSharedSweep, userScopedExpiryCheck } from '@/server/notifications/sweep';
import { listParentNegotiations } from '@/server/rateNegotiations';
import { listTeacherEnquiries } from '@/server/teacherEnquiries';
import { createAdult, createChild, testDb, uniq } from './helpers';
import {
  BASE,
  clearFailure,
  DAY,
  emailsTo,
  enquire,
  family,
  holdSweep,
  injectFailure,
  lastSweep,
  notesFor,
  notesOf,
  propose,
  requestLink,
  resetSweep,
  secondParent,
  teacher,
} from './notificationFixtures';

/**
 * CR-16 §7.6 (B-1 option C): the user-scoped expiry check run on every bell refresh, limited to
 * the signed-in user's own authorised records. AC-72 to AC-75.
 */
const sql = testDb();
const T0 = new Date('2036-05-01T04:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);

beforeAll(async () => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
  await sql`UPDATE notification_throttles SET last_run_at = 'infinity' WHERE name = 'cleanup'`;
});
afterAll(async () => {
  await clearFailure(sql);
  await resetSweep(sql);
  await sql`UPDATE notification_throttles SET last_run_at = '-infinity' WHERE name = 'cleanup'`;
  await sql.end();
});

async function status(table: 'teacher_enquiries' | 'teacher_student_links' | 'rate_negotiations', id: string) {
  const [r] = await sql.unsafe<{ status: string }[]>(`SELECT status FROM ${table} WHERE id = $1`, [id]);
  return r!.status;
}

async function counts() {
  const [r] = await sql<{ n: number; a: number; m: number }[]>`
    SELECT (SELECT count(*)::int FROM notifications) AS n, (SELECT count(*)::int FROM audit_events) AS a,
           (SELECT count(*)::int FROM email_outbox) AS m`;
  return r!;
}

async function pools<T>(fns: Array<(db: ReturnType<typeof testDb>) => Promise<T>>): Promise<T[]> {
  const dbs = fns.map(() => testDb());
  try {
    return await Promise.all(fns.map((fn, i) => fn(dbs[i]!)));
  } finally {
    await Promise.all(dbs.map((d) => d.end()));
  }
}

describe('AC-72: scope and authorisation', () => {
  it("AC-72: only the viewer's own, still-authorised records expire; everyone else's are left to the shared sweep", async () => {
    const viewerTeacher = await teacher(sql, T0);
    const otherTeacher = await teacher(sql, T0);
    const viewerFamily = await family(sql);
    const otherFamily = await family(sql);
    // The viewer teacher's own records with the other family, and the other teacher's with the viewer family.
    const mine = {
      enquiry: await enquire(sql, viewerTeacher, otherFamily, T0),
      link: await requestLink(sql, viewerTeacher, otherFamily, T0),
      rate: await propose(sql, viewerTeacher, otherFamily, T0),
    };
    const theirs = {
      enquiry: await enquire(sql, otherTeacher, viewerFamily, T0),
      link: await requestLink(sql, otherTeacher, viewerFamily, T0),
      rate: await propose(sql, otherTeacher, viewerFamily, T0),
    };
    // A parent who asked for a child they are no longer the active guardian of.
    const ended = await family(sql);
    const endedLink = await requestLink(sql, otherTeacher, ended, T0);
    await secondParent(sql, ended.child);
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = ${at(1)} WHERE parent_id = ${ended.parent}`;
    await holdSweep(sql);
    const held = await lastSweep(sql);
    const now = at(15);

    // The teacher's check: only the viewer teacher's three records.
    await refreshBell(sql, viewerTeacher.id, BASE, now);
    expect([
      await status('teacher_enquiries', mine.enquiry),
      await status('teacher_student_links', mine.link),
      await status('rate_negotiations', mine.rate),
    ]).toEqual(['expired', 'removed', 'expired']);
    expect([
      await status('teacher_enquiries', theirs.enquiry),
      await status('teacher_student_links', theirs.link),
      await status('rate_negotiations', theirs.rate),
    ]).toEqual(['pending', 'requested', 'pending']);

    // The ended-guardian parent's check leaves the request alone (they may no longer see it).
    await refreshBell(sql, ended.parent, BASE, now);
    expect(await status('teacher_student_links', endedLink)).toBe('requested');

    // The viewer parent's check: the parent's side of the other teacher's records.
    await refreshBell(sql, viewerFamily.parent, BASE, now);
    expect([
      await status('teacher_enquiries', theirs.enquiry),
      await status('teacher_student_links', theirs.link),
      await status('rate_negotiations', theirs.rate),
    ]).toEqual(['expired', 'removed', 'expired']);
    expect(await status('teacher_student_links', endedLink)).toBe('requested');
    expect((await lastSweep(sql)).getTime()).toBe(held.getTime());

    // Same statuses, audit entries and email keys as the existing functions.
    const [l] = await sql<{ ended_as: string; removed_at: Date; expires_at: Date }[]>`
      SELECT ended_as, removed_at, expires_at FROM teacher_student_links WHERE id = ${mine.link}`;
    expect(l!.ended_as).toBe('expired');
    expect(l!.removed_at.getTime()).toBe(l!.expires_at.getTime());
    expect((await emailsTo(sql, otherFamily.parentEmail)).map((m) => m.dedupe_key)).toEqual(
      expect.arrayContaining([
        `link_request_expired:${mine.link}`,
        `rate_expired:${mine.rate}:${otherFamily.parentEmail}`,
      ]),
    );
    expect((await emailsTo(sql, viewerTeacher.email)).map((m) => m.dedupe_key)).toContain(
      `rate_expired:${mine.rate}:${viewerTeacher.email}`,
    );
  });

  it("AC-72: a student's and an awaiting-approval teacher's refresh run no expiry statement, no reminder and no clean-up", async () => {
    const p = await createAdult(sql, 'parent');
    const student = await createChild(sql, p);
    const [w] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name) VALUES ('teacher', 'pending_approval', ${`w-${uniq()}@example.com`}, 'W')
      RETURNING id`;
    await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status) VALUES (${w!.id}, 'self_registered', 'submitted')`;
    const t = await teacher(sql, at(100));
    const f = await family(sql);
    const e = await enquire(sql, t, f, at(100));
    for (const id of [student, w!.id]) {
      expect(await userScopedExpiryCheck(sql, await loadViewer(sql, id), at(155))).toEqual({
        enquiries: 0,
        linkRequests: 0,
        rateProposals: 0,
      });
    }
    await holdSweep(sql);
    const before = await counts();
    await refreshBell(sql, student, BASE, at(155));
    await refreshBell(sql, w!.id, BASE, at(155));
    expect(await counts()).toEqual(before); // no expiry, no listing reminder (t's listing is due), no clean-up
    expect(await status('teacher_enquiries', e)).toBe('pending');
  });

  it('AC-72: the check takes no record or user id from the browser — refreshBell has no such parameter', () => {
    // The refresh path's only inputs are the database, the session's account id, the site base URL and the clock.
    expect(refreshBell.length).toBe(3);
    expect(userScopedExpiryCheck.length).toBe(2);
  });
});

describe('AC-73: concurrency and idempotency', () => {
  async function expiredOnce(
    x: { t: Awaited<ReturnType<typeof teacher>>; f: Awaited<ReturnType<typeof family>> },
    ids: {
      enquiry: string;
      rate: string;
      link?: string;
    },
  ) {
    expect(
      (await notesFor(sql, ids.enquiry)).filter((n) => n.type === 'enquiry_expired').map((n) => n.recipient_id),
    ).toEqual([x.f.parent]);
    expect(
      (await notesFor(sql, ids.rate))
        .filter((n) => n.type === 'rate_proposal_expired')
        .map((n) => n.recipient_id)
        .sort(),
    ).toEqual([x.t.id, x.f.parent].sort());
    const [a] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM audit_events WHERE event_type = 'RATE_EXPIRED' AND details ->> 'negotiation' = ${ids.rate}`;
    expect(a!.n).toBe(1);
    const mails = [...(await emailsTo(sql, x.t.email)), ...(await emailsTo(sql, x.f.parentEmail))].filter((m) =>
      m.dedupe_key.startsWith(`rate_expired:${ids.rate}`),
    );
    expect(mails).toHaveLength(2);
    if (ids.link) {
      expect((await notesFor(sql, ids.link)).filter((n) => n.type === 'link_request_expired')).toHaveLength(1);
      const [la] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM audit_events WHERE event_type = 'LINK_REQUEST_EXPIRED' AND details ->> 'request' = ${ids.link}`;
      expect(la!.n).toBe(1);
    }
  }

  async function setup(day: number) {
    const t = await teacher(sql, at(day));
    const f = await family(sql);
    return {
      t,
      f,
      enquiry: await enquire(sql, t, f, at(day)),
      link: await requestLink(sql, t, f, at(day)),
      rate: await propose(sql, t, f, at(day)),
    };
  }

  it('AC-73 (a): two concurrent refreshes of the same user — one transition, one notification per recipient', async () => {
    const x = await setup(200);
    await holdSweep(sql);
    await pools([
      (db) => refreshBell(db, x.f.parent, BASE, at(215)),
      (db) => refreshBell(db, x.f.parent, BASE, at(215)),
    ]);
    await expiredOnce(x, x);
  });

  it('AC-73 (b): teacher and parent refreshing at the same moment for the same expired records', async () => {
    const x = await setup(300);
    await holdSweep(sql);
    await pools([(db) => refreshBell(db, x.t.id, BASE, at(315)), (db) => refreshBell(db, x.f.parent, BASE, at(315))]);
    await expiredOnce(x, x);
  });

  it('AC-73 (c): a user-scoped check racing the shared sweep', async () => {
    const x = await setup(400);
    await resetSweep(sql);
    await pools([
      (db) => runSharedSweep(db, BASE, at(415)),
      (db) => userScopedExpiryCheck(db, { id: x.t.id, role: 'teacher', standing: 'full' }, at(415)),
    ]);
    await expiredOnce(x, x);
  });

  it("AC-73 (d): a user-scoped check racing a business page's own expiry calls", async () => {
    const x = await setup(500);
    await holdSweep(sql);
    await pools<unknown>([
      (db) => refreshBell(db, x.t.id, BASE, at(515)),
      (db) => listTeacherEnquiries(db, x.t.id, at(515)),
      (db) => listParentNegotiations(db, x.f.parent, at(515)),
    ]);
    await expiredOnce(x, x);
  });

  it('AC-73: a failure after the UPDATE rolls back the transition, the email and the notifications; the next check completes it', async () => {
    const x = await setup(600);
    await holdSweep(sql);
    await injectFailure(sql, `rate_expired:${x.rate}:%`);
    await expect(refreshBell(sql, x.t.id, BASE, at(615))).rejects.toThrow(/injected failure/);
    expect(await status('rate_negotiations', x.rate)).toBe('pending');
    expect((await notesFor(sql, x.rate)).map((n) => n.type)).toEqual(['rate_proposal_received']);
    expect((await emailsTo(sql, x.t.email)).filter((m) => m.template === 'rate_proposal_expired')).toEqual([]);
    await clearFailure(sql);
    await refreshBell(sql, x.t.id, BASE, at(615));
    await expiredOnce(x, x);
  });
});

describe('AC-74: counts after the check', () => {
  it('AC-74: the response that ran the check already counts the new notification; badges are unchanged; the other party is right', async () => {
    const t = await teacher(sql, at(700));
    const f = await family(sql);
    const r = await propose(sql, t, f, at(700));
    await holdSweep(sql);
    const now = at(714);
    const tv = await loadViewer(sql, t.id);
    const before = { unread: await unreadCount(sql, t.id), badges: await menuBadges(sql, tv, now) };
    const parentBefore = await unreadCount(sql, f.parent);
    const after = await refreshBell(sql, t.id, BASE, now);
    expect(after.unread).toBe(before.unread + 1);
    expect(after.badges).toEqual(before.badges);
    // The other party: correct at their next refresh, with no sweep of their own.
    expect((await refreshBell(sql, f.parent, BASE, now)).unread).toBe(parentBefore + 1);
    const label = (await listNotifications(sql, t.id, { view: 'page' }, now)).items.find(
      (i) => i.type === 'rate_proposal_received',
    );
    expect(label?.label).toBe('No longer needed');
    expect((await notesFor(sql, r)).filter((n) => n.type === 'rate_proposal_expired')).toHaveLength(2);
    // Nothing expired: counts unchanged and no row written.
    const quiet = await counts();
    const again = await refreshBell(sql, t.id, BASE, now);
    expect(again.unread).toBe(after.unread);
    expect(await counts()).toEqual(quiet);
    expect(await notesOf(sql, t.id)).toHaveLength(after.unread);
  });
});

describe('AC-75: efficiency', () => {
  it("AC-75: each user-scoped statement can use an index on the viewer's own column (EXPLAIN), and writes nothing when nothing expired", async () => {
    await sql`ANALYZE teacher_enquiries`;
    await sql`ANALYZE teacher_student_links`;
    await sql`ANALYZE rate_negotiations`;
    const id = '00000000-0000-4000-8000-000000000000';
    const now = new Date();
    const plans: Record<string, string> = {};
    await sql
      .begin(async (tx) => {
        // Tiny test tables are cheaper to scan in full; discourage that to show the index is usable.
        await tx`SET LOCAL enable_seqscan = off`;
        const explain = async (name: string, q: string) => {
          const rows = await tx.unsafe<{ 'QUERY PLAN': string }[]>(`EXPLAIN ${q}`, [id, now]);
          plans[name] = rows.map((r) => r['QUERY PLAN']).join('\n');
        };
        await explain(
          'enquiry teacher',
          `UPDATE teacher_enquiries SET status = 'expired' WHERE status = 'pending' AND expires_at <= $2 AND teacher_id = $1`,
        );
        await explain(
          'enquiry parent',
          `UPDATE teacher_enquiries SET status = 'expired' WHERE status = 'pending' AND expires_at <= $2 AND parent_id = $1`,
        );
        await explain(
          'link teacher',
          `UPDATE teacher_student_links l SET status = 'removed', removed_at = expires_at, ended_as = 'expired' WHERE status = 'requested' AND expires_at <= $2 AND l.teacher_id = $1`,
        );
        await explain(
          'link parent',
          `UPDATE teacher_student_links l SET status = 'removed', removed_at = expires_at, ended_as = 'expired' WHERE status = 'requested' AND expires_at <= $2 AND l.created_by_parent_id = $1`,
        );
        await explain(
          'rate teacher',
          `UPDATE rate_negotiations SET status = 'expired', turn = NULL, ended_at = expires_at WHERE status IN ('pending', 'countered') AND expires_at <= $2 AND teacher_id = $1`,
        );
        await explain(
          'rate parent',
          `UPDATE rate_negotiations SET status = 'expired', turn = NULL, ended_at = expires_at WHERE status IN ('pending', 'countered') AND expires_at <= $2 AND parent_id = $1`,
        );
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
    for (const p of Object.values(plans)) expect(p).toMatch(/Index Scan using|Bitmap Index Scan on/);
    // Each statement's owner column leads an index on its table (the parent side of link requests
    // is the index added by migration 0026).
    const leading = await sql<{ t: string; c: string }[]>`
      SELECT tc.relname AS t, a.attname AS c
      FROM pg_index i JOIN pg_class tc ON tc.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE tc.relname IN ('teacher_enquiries', 'teacher_student_links', 'rate_negotiations')`;
    const has = (t: string, c: string) => leading.some((r) => r.t === t && r.c === c);
    expect([
      has('teacher_enquiries', 'teacher_id'),
      has('teacher_enquiries', 'parent_id'),
      has('teacher_student_links', 'teacher_id'),
      has('teacher_student_links', 'created_by_parent_id'),
      has('rate_negotiations', 'teacher_id'),
      has('rate_negotiations', 'parent_id'),
    ]).toEqual([true, true, true, true, true, true]);
    for (const p of Object.values(plans)) expect(p).not.toMatch(/Seq Scan/);
    // No new table or stored throttle row for the check.
    const [t] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notification_throttles`;
    expect(t!.n).toBe(2);
    // With nothing expired, a check writes nothing.
    const before = await counts();
    const v = await loadViewer(sql, (await teacher(sql, at(900))).id);
    const quiet = await counts();
    expect(await userScopedExpiryCheck(sql, v, at(901))).toEqual({ enquiries: 0, linkRequests: 0, rateProposals: 0 });
    expect(await counts()).toEqual(quiet);
    expect(quiet.n).toBe(before.n);
  });
});
