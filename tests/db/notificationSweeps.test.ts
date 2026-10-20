import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadViewer } from '@/server/notifications/access';
import { menuBadges } from '@/server/notifications/badges';
import { listNotifications, refreshBell, unreadCount } from '@/server/notifications/queries';
import { claimSharedSweep, runSharedSweep, userScopedExpiryCheck } from '@/server/notifications/sweep';
import { listParentNegotiations } from '@/server/rateNegotiations';
import { listParentEnquiries, listTeacherEnquiries } from '@/server/teacherEnquiries';
import { listMyTeachers } from '@/server/teacherLinks';
import { queueListingReminders, renewListing, setListingStatus } from '@/server/teacherListings';
import { testDb } from './helpers';
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
  teacher,
} from './notificationFixtures';

/**
 * CR-16 §7.3 and §7.5: the shared once-a-minute sweep (expiry and listing reminders), its
 * catch-up and concurrency, and the existing unthrottled calls. AC-30, AC-33, AC-44, AC-45,
 * AC-57, AC-58, AC-71. Concurrency uses separate real connections.
 */
const sql = testDb();
// Far from the other test files' clocks, so global sweeps here only find this file's records.
const T0 = new Date('2034-03-01T04:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);

beforeAll(async () => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
  // Retention is tested in notifications.test.ts; keep it from running at this file's far clock.
  await sql`UPDATE notification_throttles SET last_run_at = 'infinity' WHERE name = 'cleanup'`;
});
afterAll(async () => {
  await clearFailure(sql);
  await resetSweep(sql);
  await sql`UPDATE notification_throttles SET last_run_at = '-infinity' WHERE name = 'cleanup'`;
  await sql.end();
});

async function pools<T>(n: number, fn: (db: ReturnType<typeof testDb>, i: number) => Promise<T>): Promise<T[]> {
  const dbs = Array.from({ length: n }, () => testDb());
  try {
    return await Promise.all(dbs.map((d, i) => fn(d, i)));
  } finally {
    await Promise.all(dbs.map((d) => d.end()));
  }
}

/** One open enquiry, link request and rate proposal for a new family with this teacher. */
async function openItems(now: Date) {
  const t = await teacher(sql, now);
  const f = await family(sql);
  return {
    t,
    f,
    enquiry: await enquire(sql, t, f, now),
    link: await requestLink(sql, t, f, now),
    rate: await propose(sql, t, f, now),
  };
}

async function auditCount(type: string, key: string, id: string) {
  const [r] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM audit_events WHERE event_type = ${type} AND details ->> ${key} = ${id}`;
  return r!.n;
}

describe('AC-71: the shared sweep runs at most once a minute across all users and instances', () => {
  it('AC-71 (a)(b)(c): many concurrent triggers run it once; 60 s later it runs again; inside the minute it does not', async () => {
    await resetSweep(sql);
    const results = await pools(6, (db) => runSharedSweep(db, BASE, T0));
    expect(results.filter((r) => r.ran)).toHaveLength(1);
    expect((await runSharedSweep(sql, BASE, T0)).ran).toBe(false);
    await sql`UPDATE notification_throttles SET last_run_at = now() - interval '30 seconds' WHERE name = 'shared_sweep'`;
    expect(await claimSharedSweep(sql)).toBe(false);
    await sql`UPDATE notification_throttles SET last_run_at = now() - interval '60 seconds' WHERE name = 'shared_sweep'`;
    expect((await runSharedSweep(sql, BASE, T0)).ran).toBe(true);
  });

  it('AC-71 (c): a request that does not claim the run returns at once, even while a claimed sweep is still working', async () => {
    const x = await openItems(at(100));
    await resetSweep(sql);
    const blocker = testDb();
    const runner = testDb();
    try {
      // Hold a lock on the due enquiry so the claimed sweep has to wait inside its work.
      let release!: () => void;
      const held = new Promise<void>((r) => (release = r));
      const locking = blocker.begin(async (tx) => {
        await tx`SELECT id FROM teacher_enquiries WHERE id = ${x.enquiry} FOR UPDATE`;
        await held;
      });
      await new Promise((r) => setTimeout(r, 50));
      const sweeping = runSharedSweep(runner, BASE, at(115));
      await new Promise((r) => setTimeout(r, 100));
      const started = Date.now();
      const bystander = await family(sql);
      const other = await refreshBell(sql, bystander.parent, BASE, at(115));
      expect(Date.now() - started).toBeLessThan(2000);
      expect(other.badges).toEqual({ '/parent/enquiries': 0 });
      release();
      await locking;
      expect((await sweeping).ran).toBe(true);
    } finally {
      await blocker.end();
      await runner.end();
    }
    expect((await notesFor(sql, x.enquiry)).filter((n) => n.type === 'enquiry_expired')).toHaveLength(1);
  });

  it('AC-71 (d): a claimed run that fails is caught up by the next run; nothing due is skipped', async () => {
    const x = await openItems(at(200));
    await injectFailure(sql, `enquiry_expired:${x.enquiry}:%`);
    await resetSweep(sql);
    const failed = await runSharedSweep(sql, BASE, at(215));
    expect(failed).toMatchObject({ ran: true, failed: 1 });
    // The enquiry part rolled back as a whole: still pending, no notification, no audit.
    const [e] = await sql`SELECT status FROM teacher_enquiries WHERE id = ${x.enquiry}`;
    expect(e!.status).toBe('pending');
    expect((await notesFor(sql, x.enquiry)).map((n) => n.type)).toEqual(['enquiry_received']);
    // The other parts ran.
    expect((await notesFor(sql, x.rate)).filter((n) => n.type === 'rate_proposal_expired')).toHaveLength(2);
    await clearFailure(sql);
    // A minute with no traffic later, the next run takes everything still due.
    await resetSweep(sql);
    expect((await runSharedSweep(sql, BASE, at(230))).ran).toBe(true);
    const [after] = await sql`SELECT status FROM teacher_enquiries WHERE id = ${x.enquiry}`;
    expect(after!.status).toBe('expired');
    expect((await notesFor(sql, x.enquiry)).map((n) => n.type)).toEqual(['enquiry_received', 'enquiry_expired']);
  });

  it("AC-71 (e) / AC-30: the shared sweep overlapping the business pages' own expiry calls changes each record once", async () => {
    const x = await openItems(at(300));
    const now = at(315);
    await resetSweep(sql);
    await pools<unknown>(4, (db, i) =>
      i === 0
        ? runSharedSweep(db, BASE, now)
        : i === 1
          ? listParentEnquiries(db, x.f.parent, now)
          : i === 2
            ? listMyTeachers(db, x.f.parent, now)
            : listParentNegotiations(db, x.f.parent, now),
    );
    expect((await notesFor(sql, x.enquiry)).map((n) => [n.recipient_id, n.type])).toEqual([
      [x.t.id, 'enquiry_received'],
      [x.f.parent, 'enquiry_expired'],
    ]);
    expect((await notesFor(sql, x.link)).map((n) => [n.recipient_id, n.type])).toEqual([
      [x.t.id, 'link_request_received'],
      [x.f.parent, 'link_request_expired'],
    ]);
    const rateExpired = (await notesFor(sql, x.rate)).filter((n) => n.type === 'rate_proposal_expired');
    expect(rateExpired.map((n) => n.recipient_id).sort()).toEqual([x.t.id, x.f.parent].sort());
    expect(await auditCount('LINK_REQUEST_EXPIRED', 'request', x.link)).toBe(1);
    expect(await auditCount('RATE_EXPIRED', 'negotiation', x.rate)).toBe(1);
    expect((await emailsTo(sql, x.f.parentEmail)).filter((m) => m.template.endsWith('_expired'))).toHaveLength(2);
    expect((await emailsTo(sql, x.t.email)).filter((m) => m.template === 'rate_proposal_expired')).toHaveLength(1);
  });

  it('AC-30: two shared sweeps forced past the throttle at the same moment expire each record once', async () => {
    const x = await openItems(at(400));
    const now = at(415);
    await pools(2, async (db) => {
      await db`UPDATE notification_throttles SET last_run_at = '-infinity' WHERE name = 'shared_sweep'`;
      return runSharedSweep(db, BASE, now);
    });
    // Whichever runs, a second forced run finds nothing more.
    await resetSweep(sql);
    await runSharedSweep(sql, BASE, now);
    for (const id of [x.enquiry, x.link]) {
      expect((await notesFor(sql, id)).filter((n) => n.type.endsWith('_expired'))).toHaveLength(1);
    }
    expect((await notesFor(sql, x.rate)).filter((n) => n.type.endsWith('_expired'))).toHaveLength(2);
  });

  it("AC-71 (f): the business pages' own expiry calls and the /teacher/listing reminder call are not throttled", async () => {
    const x = await openItems(at(500));
    await holdSweep(sql);
    const held = await lastSweep(sql);
    await listTeacherEnquiries(sql, x.t.id, at(515));
    const [e] = await sql`SELECT status FROM teacher_enquiries WHERE id = ${x.enquiry}`;
    expect(e!.status).toBe('expired');
    expect(await queueListingReminders(sql, BASE, at(555))).toBeGreaterThanOrEqual(1);
    expect((await lastSweep(sql)).getTime()).toBe(held.getTime());
  });

  it('AC-71 (g) / AC-16: badges and labels are right while no sweep has run', async () => {
    const x = await openItems(at(600));
    await holdSweep(sql);
    const v = await loadViewer(sql, x.t.id);
    expect(await menuBadges(sql, v, at(601))).toMatchObject({ '/teacher/students': 1, '/teacher/enquiries': 2 });
    expect(await menuBadges(sql, v, at(615))).toMatchObject({ '/teacher/students': 0, '/teacher/enquiries': 0 });
    const list = await listNotifications(sql, x.t.id, { view: 'page' }, at(615));
    expect(list.items.map((i) => i.label)).toEqual(['No longer needed', 'No longer needed', 'No longer needed']);
    const [e] = await sql`SELECT status FROM teacher_enquiries WHERE id = ${x.enquiry}`;
    expect(e!.status).toBe('pending'); // not yet swept
  });

  it('AC-71 (h): user-scoped checks on many refreshes neither read nor move the stored time; the shared sweep still runs once', async () => {
    const x = await openItems(at(700));
    await holdSweep(sql);
    const held = await lastSweep(sql);
    const v = await loadViewer(sql, x.t.id);
    for (let i = 0; i < 5; i += 1) await userScopedExpiryCheck(sql, v, at(715));
    expect((await lastSweep(sql)).getTime()).toBe(held.getTime());
    await resetSweep(sql);
    const runs = await pools(3, (db) => runSharedSweep(db, BASE, at(715)));
    expect(runs.filter((r) => r.ran)).toHaveLength(1);
  });
});

describe('AC-44: expiry notifications for an active user within about 60 seconds (user-scoped check)', () => {
  it('AC-44: with the shared sweep held inside its minute, the first refresh at or after the expiry puts it in the bell — parent and teacher', async () => {
    for (const who of ['parent', 'teacher'] as const) {
      const x = await openItems(at(800));
      const E = at(814); // expires_at of all three records
      const viewer = who === 'parent' ? x.f.parent : x.t.id;
      await holdSweep(sql);
      const held = await lastSweep(sql);
      const before = await unreadCount(sql, viewer);
      // A refresh just before E (worst case): nothing has expired yet.
      expect((await refreshBell(sql, viewer, BASE, new Date(E.getTime() - 1000))).unread).toBe(before);
      // The next refresh, 60 s later (at most 60 s after E): the notifications are in the bell.
      const counts = await refreshBell(sql, viewer, BASE, new Date(E.getTime() + 59_000));
      const expected = who === 'parent' ? 3 : 1; // parent: enquiry, link request, rate; teacher: rate
      expect(counts.unread).toBe(before + expected);
      expect((await lastSweep(sql)).getTime()).toBe(held.getTime()); // no shared sweep ran
    }
  });
});

describe('AC-45: expiry durations and rules are unchanged', () => {
  it('AC-45: enquiries, link requests and rate proposals still expire 14 days after they were sent', async () => {
    const x = await openItems(at(900));
    const [e] = await sql<
      { d: number }[]
    >`SELECT extract(epoch FROM expires_at - sent_at)::int AS d FROM teacher_enquiries WHERE id = ${x.enquiry}`;
    const [l] = await sql<
      { d: number }[]
    >`SELECT extract(epoch FROM expires_at - requested_at)::int AS d FROM teacher_student_links WHERE id = ${x.link}`;
    const [r] = await sql<
      { d: number }[]
    >`SELECT extract(epoch FROM expires_at - created_at)::int AS d FROM rate_negotiations WHERE id = ${x.rate}`;
    expect([e!.d, l!.d, r!.d]).toEqual([14 * 86400, 14 * 86400, 14 * 86400]);
    await resetSweep(sql);
    await runSharedSweep(sql, BASE, new Date(at(914).getTime() - 1));
    const [still] = await sql`SELECT status FROM teacher_enquiries WHERE id = ${x.enquiry}`;
    expect(still!.status).toBe('pending');
    await resetSweep(sql);
    await runSharedSweep(sql, BASE, at(914));
    const [e2] = await sql<{ s: string }[]>`SELECT status AS s FROM teacher_enquiries WHERE id = ${x.enquiry}`;
    const [l2] = await sql<{ s: string }[]>`SELECT ended_as AS s FROM teacher_student_links WHERE id = ${x.link}`;
    const [r2] = await sql<{ s: string }[]>`SELECT status AS s FROM rate_negotiations WHERE id = ${x.rate}`;
    const rows = [e2!, l2!, r2!];
    expect(rows.map((r) => r.s)).toEqual(['expired', 'expired', 'expired']);
  });
});

describe('listing reminders (AC-33, AC-57, AC-58)', () => {
  async function reminders(teacherId: string) {
    return (await notesOf(sql, teacherId)).filter((n) => n.type === 'listing_reminder');
  }

  it('AC-57/AC-33: one run creates the reminder and the unchanged email together; concurrent runs make one of each; renewal starts a new period', async () => {
    const R = at(1000);
    const t = await teacher(sql, R);
    const [l] = await sql<
      { id: string; expires_at: Date }[]
    >`SELECT id, expires_at FROM teacher_listings WHERE teacher_id = ${t.id}`;
    await pools(3, (db) => queueListingReminders(db, BASE, at(1054)));
    const rows = await reminders(t.id);
    expect(rows.map((r) => [r.kind, r.href, r.dedupe_key])).toEqual([
      ['reminder', '/teacher/listing', `listing_reminder:${l!.id}:${l!.expires_at.toISOString()}:${t.id}`],
    ]);
    expect(await emailsTo(sql, t.email)).toEqual([
      { template: 'listing_expiry_reminder', dedupe_key: `listing_reminder:${l!.id}:${l!.expires_at.toISOString()}` },
    ]);
    await resetSweep(sql);
    await runSharedSweep(sql, BASE, at(1055));
    expect(await reminders(t.id)).toHaveLength(1);
    expect(await renewListing(sql, t.id, { times: true, prices: true, subjects: true }, at(1055))).toEqual({
      ok: true,
    });
    await queueListingReminders(sql, BASE, at(1055 + 54));
    expect(await reminders(t.id)).toHaveLength(2);
    expect(await emailsTo(sql, t.email)).toHaveLength(2);
  });

  it('AC-57: none for a paused, withdrawn or ended listing, one more than 7 days away, or an inactive or unapproved teacher', async () => {
    const R = at(1200);
    const paused = await teacher(sql, R);
    await setListingStatus(sql, paused.id, 'pause', R);
    const withdrawn = await teacher(sql, R);
    await setListingStatus(sql, withdrawn.id, 'withdraw', R);
    const inactive = await teacher(sql, R);
    await sql`UPDATE accounts SET status = 'suspended' WHERE id = ${inactive.id}`;
    const far = await teacher(sql, R);
    const later = await teacher(sql, at(1210));
    for (const t of [paused, withdrawn, inactive]) {
      await queueListingReminders(sql, BASE, at(1255));
      expect(await reminders(t.id)).toEqual([]);
      expect(await emailsTo(sql, t.email)).toEqual([]);
    }
    // "far" was reminded by the run above (day 55); a listing more than 7 days away is not.
    expect(await reminders(later.id)).toEqual([]);
    expect(await reminders(far.id)).toHaveLength(1);
    // Ended: never afterwards (B-2).
    const ended = await teacher(sql, at(1300));
    await queueListingReminders(sql, BASE, at(1361));
    expect(await reminders(ended.id)).toEqual([]);
  });

  it('AC-57: a failure inside the transaction creates neither the reminder nor the email', async () => {
    const R = at(1400);
    const t = await teacher(sql, R);
    await injectFailure(sql, `listing_reminder:%:${t.id}`);
    await expect(queueListingReminders(sql, BASE, at(1454))).rejects.toThrow(/injected failure/);
    expect(await reminders(t.id)).toEqual([]);
    expect(await emailsTo(sql, t.email)).toEqual([]);
    await clearFailure(sql);
    await queueListingReminders(sql, BASE, at(1454));
    expect(await reminders(t.id)).toHaveLength(1);
    expect(await emailsTo(sql, t.email)).toHaveLength(1);
  });

  it("AC-58: the first sweep on day 6 of the window still creates it; it is in the bell at the teacher's next sign-in; never after the listing ended (B-2)", async () => {
    const R = at(1600);
    const t = await teacher(sql, R);
    const other = await family(sql);
    await resetSweep(sql);
    // Anyone's request (here a parent's refresh) triggers the shared sweep on day 59 (6 days into the window).
    await refreshBell(sql, other.parent, BASE, at(1659));
    expect(await reminders(t.id)).toHaveLength(1);
    expect(await unreadCount(sql, t.id)).toBe(1);
    // Ended with no sweep in the window: nothing, then or later; the badge still shows renewal due.
    const quiet = await teacher(sql, at(1700));
    await resetSweep(sql);
    await runSharedSweep(sql, BASE, at(1761));
    expect(await reminders(quiet.id)).toEqual([]);
    expect(await emailsTo(sql, quiet.email)).toEqual([]);
    expect(await menuBadges(sql, await loadViewer(sql, quiet.id), at(1761))).toMatchObject({ '/teacher/listing': 1 });
    // The user-scoped check never creates a reminder.
    const soon = await teacher(sql, at(1800));
    await holdSweep(sql);
    await refreshBell(sql, soon.id, BASE, at(1855));
    expect(await reminders(soon.id)).toEqual([]);
  });

  it('AC-58: with 101 due listings one run takes 100 (earliest ending first) and the next run takes the 101st', async () => {
    const R = at(2000);
    const ids: string[] = [];
    for (let i = 0; i < 101; i += 1) ids.push((await teacher(sql, new Date(R.getTime() + i * 60_000))).id);
    await resetSweep(sql);
    const first = await runSharedSweep(sql, BASE, at(2054));
    expect(first.reminders).toBe(100);
    expect(await reminders(ids[100]!)).toEqual([]);
    await resetSweep(sql);
    const second = await runSharedSweep(sql, BASE, at(2054));
    expect(second.reminders).toBe(1);
    expect(await reminders(ids[100]!)).toHaveLength(1);
  });
});
