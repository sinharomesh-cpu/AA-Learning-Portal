import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadViewer } from '@/server/notifications/access';
import { menuBadges } from '@/server/notifications/badges';
import { bellCounts, markAllRead } from '@/server/notifications/queries';
import { withdrawPackage } from '@/server/pricingModel';
import { answerRate, counterRate, withdrawRate } from '@/server/rateNegotiations';
import { answerEnquiry, withdrawEnquiry } from '@/server/teacherEnquiries';
import { acceptLinkRequest, declineLinkRequest, withdrawLinkRequest } from '@/server/teacherLinks';
import { renewListing } from '@/server/teacherListings';
import { createAdult, createChild, testDb, uniq } from './helpers';
import {
  BASE,
  DAY,
  enquire,
  family,
  notesOf,
  propose,
  requestLink,
  teacher,
  type Teacher,
} from './notificationFixtures';

/**
 * CR-16 §4.1 menu badges: counted from business records only (N-2). AC-10 to AC-16 and AC-64.
 */
const sql = testDb();
const T0 = new Date('2026-11-20T04:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const counter = { amount: '3,600', sessions: 8, minutes: 40, message: '' };

beforeAll(async () => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
});
afterAll(async () => {
  await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
  await sql.end();
});

async function badges(id: string, now: Date) {
  return menuBadges(sql, await loadViewer(sql, id), now);
}

describe('teacher badges (AC-10, AC-11, AC-12, AC-15, AC-16)', () => {
  it('AC-10: Students rises with a link request and falls on accept, decline, parent withdrawal and expiry', async () => {
    const t = await teacher(sql, T0, { listing: false });
    const students = async (now = at(1)) => (await badges(t.id, now))['/teacher/students'];
    expect(await students()).toBe(0);
    const fams = [await family(sql), await family(sql), await family(sql), await family(sql)];
    const ids = [];
    for (const f of fams) ids.push(await requestLink(sql, t, f, T0));
    expect(await students()).toBe(4);
    await acceptLinkRequest(sql, t.id, ids[0]!, BASE, at(1));
    expect(await students()).toBe(3);
    await declineLinkRequest(sql, t.id, ids[1]!, { reason: 'no_time' }, BASE, at(1));
    expect(await students()).toBe(2);
    expect(await withdrawLinkRequest(sql, fams[2]!.parent, ids[2]!, at(1))).toEqual({ ok: true });
    expect(await students()).toBe(1);
    // Expiry by time: gone from the badge at the expiry instant, before any sweep (AC-16).
    expect(await students(at(14))).toBe(0);
    const [row] = await sql`SELECT status FROM teacher_student_links WHERE id = ${ids[3]!}`;
    expect(row!.status).toBe('requested');
  });

  it("AC-11: Enquiries counts waiting enquiries plus rate proposals on the teacher's turn, each once", async () => {
    const t = await teacher(sql, T0);
    const enq = async (now = at(1)) => (await badges(t.id, now))['/teacher/enquiries'];
    const a = await family(sql);
    const b = await family(sql);
    const c = await family(sql);
    const e1 = await enquire(sql, t, a, T0);
    const e2 = await enquire(sql, t, b, T0);
    await enquire(sql, t, c, T0);
    expect(await enq()).toBe(3);
    await answerEnquiry(sql, t.id, e1, 'accept', '', BASE, at(1));
    expect(await enq()).toBe(2);
    await withdrawEnquiry(sql, b.parent, e2, at(1));
    expect(await enq()).toBe(1);
    expect(await enq(at(14))).toBe(0); // expired by time
    const r = await propose(sql, t, a, at(2));
    expect(await enq(at(2))).toBe(2); // one enquiry still waiting at day 2 + the proposal
    await counterRate(sql, 'teacher', t.id, r, counter, BASE, at(3));
    expect(await enq(at(3))).toBe(1); // turn passed to the parent
    await counterRate(sql, 'parent', a.parent, r, counter, BASE, at(4));
    expect(await enq(at(4))).toBe(2); // turn back to the teacher
    await answerRate(sql, 'teacher', t.id, r, 'decline', null, BASE, at(5));
    expect(await enq(at(5))).toBe(1);
  });

  it('AC-12: Looking for students shows renewal due (also once ended) and a package needing details, 0 to 2', async () => {
    const t = await teacher(sql, T0);
    const listing = async (now: Date) => (await badges(t.id, now))['/teacher/listing'];
    expect(await listing(at(52))).toBe(0);
    expect(await listing(at(53))).toBe(1); // 7 days before the end
    expect(await listing(at(70))).toBe(1); // ended, still due for renewal
    await sql`UPDATE teacher_listings SET status = 'paused' WHERE teacher_id = ${t.id}`;
    expect(await listing(at(55))).toBe(1);
    await sql`UPDATE teacher_listings SET status = 'published' WHERE teacher_id = ${t.id}`;
    await sql`INSERT INTO learning_packages (teacher_id, status, review_issues) VALUES (${t.id}, 'needs_review', ${['classes']})`;
    expect(await listing(at(55))).toBe(1); // pricing model v2 is off: the package does not count
    await sql`INSERT INTO platform_settings (key, value) VALUES ('pricing_model_v2', 1)
              ON CONFLICT (key) DO UPDATE SET value = 1`;
    expect(await listing(at(55))).toBe(2);
    expect(await renewListing(sql, t.id, { times: true, prices: true, subjects: true }, at(55))).toEqual({ ok: true });
    expect(await listing(at(55))).toBe(1);
    expect(await withdrawPackage(sql, t.id, at(55))).toEqual({ ok: true });
    expect(await listing(at(55))).toBe(0);
    await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
  });

  it('AC-15: completing the action clears the badge without the notification being read', async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    const e = await enquire(sql, t, f, T0);
    expect((await badges(t.id, at(1)))['/teacher/enquiries']).toBe(1);
    await answerEnquiry(sql, t.id, e, 'decline', '', BASE, at(1));
    expect((await badges(t.id, at(1)))['/teacher/enquiries']).toBe(0);
    expect((await notesOf(sql, t.id)).every((n) => n.read_at === null)).toBe(true);
  });
});

describe('parent badge (AC-13)', () => {
  it("AC-13: My enquiries rises on a teacher counter-offer and falls on the parent's answer, counter, withdrawal or expiry", async () => {
    const t = await teacher(sql, T0);
    const mine = async (p: string, now: Date) => (await badges(p, now))['/parent/enquiries'];
    const fams = [await family(sql), await family(sql), await family(sql), await family(sql)];
    const ids: string[] = [];
    for (const f of fams) {
      const r = await propose(sql, t, f, T0);
      ids.push(r);
      expect(await mine(f.parent, at(1))).toBe(0);
      await counterRate(sql, 'teacher', t.id, r, counter, BASE, at(1));
      expect(await mine(f.parent, at(1))).toBe(1);
    }
    await answerRate(sql, 'parent', fams[0]!.parent, ids[0]!, 'accept', null, BASE, at(2));
    await counterRate(sql, 'parent', fams[1]!.parent, ids[1]!, counter, BASE, at(2));
    await withdrawRate(sql, fams[2]!.parent, ids[2]!, BASE, at(2));
    for (const f of fams.slice(0, 3)) expect(await mine(f.parent, at(2))).toBe(0);
    expect(await mine(fams[3]!.parent, at(14))).toBe(1);
    expect(await mine(fams[3]!.parent, at(15))).toBe(0); // expiry by time (AC-16)
  });
});

describe('badges come from records only (AC-14, AC-16, AC-64)', () => {
  it('AC-14: reading every notification (one or all) leaves every badge unchanged', async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    await enquire(sql, t, f, T0);
    await requestLink(sql, t, f, T0);
    const r = await propose(sql, t, f, T0);
    await counterRate(sql, 'teacher', t.id, r, counter, BASE, at(1));
    const before = [await badges(t.id, at(1)), await badges(f.parent, at(1))];
    expect((await bellCounts(sql, t.id, at(1))).unread).toBeGreaterThan(0);
    await markAllRead(sql, t.id, at(1));
    await markAllRead(sql, f.parent, at(1));
    expect([await badges(t.id, at(1)), await badges(f.parent, at(1))]).toEqual(before);
    expect(before[0]).toEqual({ '/teacher/students': 1, '/teacher/enquiries': 1, '/teacher/listing': 0 });
    expect(before[1]).toEqual({ '/parent/enquiries': 1 });
  });

  it('AC-64: each badge equals its §4.1 definition for one user and not another; nobody else has badges', async () => {
    const t1 = await teacher(sql, T0);
    const t2 = await teacher(sql, T0);
    const seed = async (t: Teacher) => {
      const fams = Array.from({ length: 4 }, () => family(sql));
      const [a, b, c, d] = await Promise.all(fams);
      // Enquiries: one waiting, one past expiry not swept, one accepted.
      await enquire(sql, t, a!, T0);
      await enquire(sql, t, b!, T0);
      await sql`UPDATE teacher_enquiries SET expires_at = ${at(1)} WHERE parent_id = ${b!.parent}`;
      const acc = await enquire(sql, t, c!, T0);
      await answerEnquiry(sql, t.id, acc, 'accept', '', BASE, T0);
      // Link requests: one waiting, one held in "pending" (not counted), one accepted.
      await requestLink(sql, t, a!, T0);
      await sql`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
                VALUES (${t.id}, ${d!.child}, ${d!.parent}, 'parent_added', 'pending', ${['maths']})`;
      const l = await requestLink(sql, t, b!, T0, ['english']);
      await acceptLinkRequest(sql, t.id, l, BASE, T0);
      // Rate proposals: one on the teacher's turn, one on the parent's turn.
      await propose(sql, t, a!, T0);
      const r = await propose(sql, t, b!, T0);
      await counterRate(sql, 'teacher', t.id, r, counter, BASE, T0);
      return { a: a!, b: b! };
    };
    const one = await seed(t1);
    await seed(t2);
    const now = at(2);
    expect(await badges(t1.id, now)).toEqual({
      '/teacher/students': 1,
      '/teacher/enquiries': 2,
      '/teacher/listing': 0,
    });
    expect(await badges(t2.id, now)).toEqual({
      '/teacher/students': 1,
      '/teacher/enquiries': 2,
      '/teacher/listing': 0,
    });
    expect(await badges(one.a.parent, now)).toEqual({ '/parent/enquiries': 0 });
    expect(await badges(one.b.parent, now)).toEqual({ '/parent/enquiries': 1 });
    // Deleting every notification of these users changes no badge.
    await sql`DELETE FROM notifications WHERE recipient_id IN (${t1.id}, ${one.b.parent})`;
    expect(await badges(t1.id, now)).toEqual({
      '/teacher/students': 1,
      '/teacher/enquiries': 2,
      '/teacher/listing': 0,
    });
    expect(await badges(one.b.parent, now)).toEqual({ '/parent/enquiries': 1 });
    // "Looking for students" is never above 2 (checked in AC-12); nobody else has badges.
    const waiting = await createAdult(sql, 'teacher', 'pending_approval');
    await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status) VALUES (${waiting}, 'self_registered', 'submitted')`;
    const rejected = await createAdult(sql, 'teacher', 'pending_approval');
    const owner = await createAdult(sql, 'superadmin');
    await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, decided_by, decided_at)
              VALUES (${rejected}, 'self_registered', 'rejected', ${owner}, ${T0})`;
    const student = await createChild(sql, one.a.parent);
    const [admin] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name) VALUES ('admin', 'active', ${`adm-${uniq()}@example.com`}, 'Admin')
      RETURNING id`;
    for (const id of [waiting, rejected, student, owner, admin!.id]) {
      expect(await badges(id, now)).toEqual({});
      expect((await bellCounts(sql, id, now)).badges).toEqual({});
    }
  });
});
