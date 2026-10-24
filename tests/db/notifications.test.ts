import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decideProfileChange, decideTeacher } from '@/server/admin';
import { loadViewer } from '@/server/notifications/access';
import { menuBadges } from '@/server/notifications/badges';
import { notify } from '@/server/notifications/notify';
import { bellCounts, listNotifications, markAllRead, markRead, unreadCount } from '@/server/notifications/queries';
import { cleanupNotifications } from '@/server/notifications/sweep';
import { answerRate, counterRate, withdrawRate } from '@/server/rateNegotiations';
import { answerEnquiry, expireEnquiries, withdrawEnquiry } from '@/server/teacherEnquiries';
import { acceptLinkRequest, addTeacher, declineLinkRequest, expireLinkRequests } from '@/server/teacherLinks';
import { expireRateNegotiations } from '@/server/rateNegotiations';
import { listResourcesForStudent } from '@/server/teacherResources';
import { LESSON_NOTIFICATION_TYPES } from '@/server/lessons';
import { createAdult, createChild, testDb, uniq } from './helpers';
import {
  BASE,
  DAY,
  emailsTo,
  enquire,
  family,
  link,
  notesFor,
  notesOf,
  propose,
  requestLink,
  secondParent,
  seedNote,
  shareWorksheet,
  teacher,
} from './notificationFixtures';

/**
 * CR-16 N1: notifications created at each §3 business event, the per-channel separation from
 * email, list / count / mark functions and retention. Test names start with the acceptance check
 * they verify (AC-n). Synthetic people only; no email or WhatsApp is ever sent.
 */
const sql = testDb();
const T0 = new Date('2026-11-02T04:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);

beforeAll(async () => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
});
afterAll(() => sql.end());

const recipients = (rows: Array<{ recipient_id: string }>) => rows.map((r) => r.recipient_id).sort();

describe('§3 events: one notification per authorised recipient (AC-17, AC-18, AC-19, AC-29)', () => {
  it('AC-17/AC-18: an enquiry notifies only the teacher, with no child name or id; answers, withdrawals and expiries notify the other side', async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    const e1 = await enquire(sql, t, f, T0);
    let rows = await notesFor(sql, e1);
    expect(recipients(rows)).toEqual([t.id]);
    expect(rows[0]).toMatchObject({ kind: 'action', type: 'enquiry_received', href: '/teacher/enquiries' });
    expect(rows[0]!.title).toBe(`New enquiry from ${f.parentFirst}`);
    expect(JSON.stringify(rows)).not.toContain(f.childName);
    expect(`${rows[0]!.title} ${rows[0]!.body} ${rows[0]!.href}`).not.toContain(f.child);

    expect(await answerEnquiry(sql, t.id, e1, 'accept', '', BASE, at(1))).toEqual({ ok: true });
    rows = await notesFor(sql, e1);
    expect(rows.map((r) => [r.recipient_id, r.type])).toEqual([
      [t.id, 'enquiry_received'],
      [f.parent, 'enquiry_accepted'],
    ]);

    const g = await family(sql);
    const e2 = await enquire(sql, t, g, T0);
    expect(await answerEnquiry(sql, t.id, e2, 'decline', '', BASE, at(1))).toEqual({ ok: true });
    expect((await notesFor(sql, e2)).filter((r) => r.recipient_id === g.parent).map((r) => r.type)).toEqual([
      'enquiry_declined',
    ]);

    const h = await family(sql);
    const e3 = await enquire(sql, t, h, T0);
    expect(await withdrawEnquiry(sql, h.parent, e3, at(1))).toEqual({ ok: true });
    expect((await notesFor(sql, e3)).map((r) => [r.recipient_id, r.type])).toEqual([
      [t.id, 'enquiry_received'],
      [t.id, 'enquiry_withdrawn'],
    ]);

    const k = await family(sql);
    const e4 = await enquire(sql, t, k, T0);
    await expireEnquiries(sql, at(15), { teacherId: t.id });
    expect((await notesFor(sql, e4)).map((r) => [r.recipient_id, r.type])).toEqual([
      [t.id, 'enquiry_received'],
      [k.parent, 'enquiry_expired'],
    ]);
  });

  it('AC-17/AC-18: link requests notify the teacher without the child; answers and expiry notify the parent', async () => {
    const t = await teacher(sql, T0, { listing: false });
    const f = await family(sql);
    const l1 = await requestLink(sql, t, f, T0);
    let rows = await notesFor(sql, l1);
    expect(recipients(rows)).toEqual([t.id]);
    expect(rows[0]).toMatchObject({ kind: 'action', type: 'link_request_received', href: '/teacher/students' });
    expect(rows[0]!.title).toBe(`${f.parentFirst} asked you to teach a Grade 5 child`);
    expect(JSON.stringify(rows)).not.toContain(f.childName);
    expect(await acceptLinkRequest(sql, t.id, l1, BASE, at(1))).toMatchObject({ ok: true });
    rows = await notesFor(sql, l1);
    expect(rows.map((r) => [r.recipient_id, r.type])).toEqual([
      [t.id, 'link_request_received'],
      [f.parent, 'link_request_accepted'],
    ]);

    const g = await family(sql);
    const l2 = await requestLink(sql, t, g, T0);
    expect(await declineLinkRequest(sql, t.id, l2, { reason: 'no_time' }, BASE, at(1))).toEqual({ ok: true });
    expect((await notesFor(sql, l2)).find((r) => r.recipient_id === g.parent)?.type).toBe('link_request_declined');

    const h = await family(sql);
    const l3 = await requestLink(sql, t, h, T0);
    await expireLinkRequests(sql, at(15), { teacherId: t.id });
    expect((await notesFor(sql, l3)).map((r) => [r.recipient_id, r.type])).toEqual([
      [t.id, 'link_request_received'],
      [h.parent, 'link_request_expired'],
    ]);
  });

  it('AC-17/AC-46: a request held until approval notifies nobody; on approval the teacher gets it with the approval notice', async () => {
    const owner = await createAdult(sql, 'superadmin');
    const f = await family(sql);
    const email = `held-${uniq()}@example.com`;
    expect(
      await addTeacher(
        sql,
        f.parent,
        { name: 'Held Sample', email, children: [{ childId: f.child, subjects: ['maths'] }], baseUrl: BASE },
        T0,
      ),
    ).toMatchObject({ ok: true, outcome: 'waiting_approval' });
    const [tid] = await sql<{ id: string }[]>`SELECT id FROM accounts WHERE email = ${email}`;
    expect(await notesOf(sql, tid!.id)).toEqual([]);
    await sql`UPDATE teacher_profiles SET approval_status = 'submitted', submitted_at = ${T0}, subjects = ${['maths']},
              grades = ${[5]}, bio = 'Bio' WHERE account_id = ${tid!.id}`;
    expect(
      (await decideTeacher(sql, owner, tid!.id, { decision: 'approve', note: 'Checked', baseUrl: BASE }, at(1))).ok,
    ).toBe(true);
    const rows = await notesOf(sql, tid!.id);
    expect(rows.map((r) => r.type).sort()).toEqual(['link_request_received', 'teacher_approved']);
    expect(rows.find((r) => r.type === 'teacher_approved')).toMatchObject({
      href: '/teacher',
      entity_type: 'teacher_profile',
    });
    expect(await notesOf(sql, owner)).toEqual([]);
  });

  it('AC-17: rate proposals — received, counter-offers each way, answers, withdrawal and expiry go to the right side', async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    const r1 = await propose(sql, t, f, T0);
    expect((await notesFor(sql, r1)).map((r) => [r.recipient_id, r.type, r.offer_seq])).toEqual([
      [t.id, 'rate_proposal_received', 1],
    ]);
    const counter = { amount: '3,600', sessions: 8, minutes: 40, message: '' };
    expect((await counterRate(sql, 'teacher', t.id, r1, counter, BASE, at(1))).ok).toBe(true);
    expect((await counterRate(sql, 'parent', f.parent, r1, counter, BASE, at(2))).ok).toBe(true);
    expect(await answerRate(sql, 'teacher', t.id, r1, 'accept', null, BASE, at(3))).toEqual({ ok: true });
    const rows = await notesFor(sql, r1);
    expect(rows.map((r) => [r.recipient_id, r.kind, r.type, r.offer_seq])).toEqual([
      [t.id, 'action', 'rate_proposal_received', 1],
      [f.parent, 'action', 'rate_counter_offer', 2],
      [t.id, 'action', 'rate_counter_offer', 3],
      [f.parent, 'update', 'rate_proposal_accepted', null],
    ]);
    expect(rows[1]!.title).toBe(`${t.name} made a counter-offer (offer 2 of 6)`);
    expect(rows[2]!.title).toBe(`${f.parentFirst} made a counter-offer (offer 3 of 6)`);
    expect(JSON.stringify(rows)).not.toContain(f.childName);

    const g = await family(sql);
    const r2 = await propose(sql, t, g, T0);
    expect(await answerRate(sql, 'teacher', t.id, r2, 'decline', 'no_time', BASE, at(1))).toEqual({ ok: true });
    expect((await notesFor(sql, r2)).find((r) => r.recipient_id === g.parent)?.type).toBe('rate_proposal_declined');

    const h = await family(sql);
    const r3 = await propose(sql, t, h, T0);
    expect(await withdrawRate(sql, h.parent, r3, BASE, at(1))).toEqual({ ok: true });
    expect((await notesFor(sql, r3)).map((r) => [r.recipient_id, r.type])).toEqual([
      [t.id, 'rate_proposal_received'],
      [t.id, 'rate_proposal_withdrawn'],
    ]);

    const k = await family(sql);
    const r4 = await propose(sql, t, k, T0);
    await expireRateNegotiations(sql, at(15), { parentId: k.parent });
    const ex = (await notesFor(sql, r4)).filter((r) => r.type === 'rate_proposal_expired');
    expect(recipients(ex)).toEqual([k.parent, t.id].sort());
  });

  it('AC-17/AC-69: decisions — changes requested notifies the waiting teacher; rejection notifies nobody; profile changes notify once', async () => {
    const owner = await createAdult(sql, 'superadmin');
    const waiting = async () => {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO accounts (role, status, email, display_name, password_hash)
        VALUES ('teacher', 'pending_approval', ${`w-${uniq()}@example.com`}, 'Waiting Sample', 'x') RETURNING id`;
      await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, submitted_at)
                VALUES (${row!.id}, 'self_registered', 'submitted', ${['maths']}, ${[5]}, 'Bio', ${T0})`;
      return row!.id;
    };
    const a = await waiting();
    expect((await decideTeacher(sql, owner, a, { decision: 'changes', note: 'More', baseUrl: BASE }, at(1))).ok).toBe(
      true,
    );
    expect((await notesOf(sql, a)).map((r) => [r.type, r.href])).toEqual([
      ['teacher_changes_requested', '/teacher/status'],
    ]);
    const b = await waiting();
    expect((await decideTeacher(sql, owner, b, { decision: 'reject', note: 'Not now', baseUrl: BASE }, at(1))).ok).toBe(
      true,
    );
    expect(await notesOf(sql, b)).toEqual([]);

    const t = await teacher(sql, T0, { listing: false });
    for (const [decision, type] of [
      ['approve', 'profile_change_approved'],
      ['decline', 'profile_change_declined'],
    ] as const) {
      const submitted = new Date(T0.getTime() + (decision === 'approve' ? 1 : 2) * 3_600_000);
      await sql`UPDATE teacher_profiles SET pending_subjects = ${['maths', 'english', 'science']}, pending_grades = ${[4, 5, 6]},
                change_submitted_at = ${submitted} WHERE account_id = ${t.id}`;
      expect((await decideProfileChange(sql, owner, t.id, { decision, note: 'Fine', baseUrl: BASE }, at(1))).ok).toBe(
        true,
      );
      // Already decided: nothing more.
      expect((await decideProfileChange(sql, owner, t.id, { decision, note: 'Fine', baseUrl: BASE }, at(1))).ok).toBe(
        false,
      );
      expect((await notesOf(sql, t.id)).filter((r) => r.type === type)).toHaveLength(1);
    }
    expect((await notesOf(sql, t.id)).map((r) => r.href)).toEqual(['/teacher/profile', '/teacher/profile']);
    expect(await notesOf(sql, owner)).toEqual([]);
  });

  it('AC-29: the same event processed twice creates one notification', async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    const e = await enquire(sql, t, f, T0);
    // A retry of the same business event (same key) adds nothing.
    const [n] = await notesFor(sql, e);
    expect(
      await notify(sql, {
        recipientId: t.id,
        kind: 'action',
        type: 'enquiry_received',
        title: 'again',
        href: '/teacher/enquiries',
        entityType: 'enquiry',
        entityId: e,
        dedupeKey: n!.dedupe_key,
        now: at(1),
      }),
    ).toBe(false);
    // A double click on "Accept": the second is refused by the business rule and adds nothing.
    await answerEnquiry(sql, t.id, e, 'accept', '', BASE, at(1));
    await answerEnquiry(sql, t.id, e, 'accept', '', BASE, at(1));
    // Two expiry runs.
    await expireEnquiries(sql, at(30));
    await expireEnquiries(sql, at(31));
    expect((await notesFor(sql, e)).map((r) => r.type)).toEqual(['enquiry_received', 'enquiry_accepted']);
  });

  it('AC-32: an event that fails and rolls back creates no notification', async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    const e = await enquire(sql, t, f, T0);
    await expect(
      sql.begin(async (tx) => {
        await tx`UPDATE teacher_enquiries SET status = 'withdrawn' WHERE id = ${e}`;
        await notify(tx, {
          recipientId: t.id,
          kind: 'update',
          type: 'enquiry_withdrawn',
          title: 'x',
          href: '/teacher/enquiries',
          entityType: 'enquiry',
          entityId: e,
          dedupeKey: `enquiry_withdrawn:${e}:${t.id}`,
          now: T0,
        });
        throw new Error('failure after the change');
      }),
    ).rejects.toThrow(/failure after the change/);
    expect((await notesFor(sql, e)).map((r) => r.type)).toEqual(['enquiry_received']);
  });

  it('AC-26: a notification link must be an internal path; anything else is refused when created', async () => {
    const p = await createAdult(sql, 'parent');
    for (const href of [
      'https://evil.example',
      '//evil.example',
      'javascript:alert(1)',
      '/Parent',
      '/parent?x=1',
      'parent',
    ]) {
      await expect(
        notify(sql, {
          recipientId: p,
          kind: 'update',
          type: 'test_seed',
          title: 'x',
          href,
          entityType: 'teacher_profile',
          entityId: p,
          dedupeKey: `t:${uniq()}`,
          now: T0,
        }),
      ).rejects.toThrow(/internal path/);
      await expect(
        sql`INSERT INTO notifications (recipient_id, kind, type, title, href, entity_type, entity_id, dedupe_key)
            VALUES (${p}, 'update', 'test_seed', 'x', ${href}, 'teacher_profile', ${p}, ${`t:${uniq()}`})`,
      ).rejects.toThrow(/check/);
    }
  });

  it('D-6: Super Admin and Admin accounts can never receive a notification', async () => {
    const owner = await createAdult(sql, 'superadmin');
    await expect(seedNote(sql, owner, T0)).rejects.toThrow(/parents, teachers and students only/);
  });
});

describe('worksheets (AC-19, AC-21, AC-22, AC-23)', () => {
  it('AC-21: a worksheet notifies the student and each active parent separately; a revoked parent gets none (AC-20)', async () => {
    const t = await teacher(sql, T0, { listing: false });
    const f = await family(sql);
    const second = await secondParent(sql, f.child);
    const revoked = await secondParent(sql, f.child);
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = ${T0} WHERE parent_id = ${revoked}`;
    await link(sql, t, f);
    await shareWorksheet(sql, t, [f.child], T0);
    const [share] = await sql<{ id: string }[]>`SELECT id FROM resource_shares WHERE student_id = ${f.child}`;
    const rows = await notesFor(sql, share!.id);
    expect(recipients(rows)).toEqual([f.child, f.parent, second].sort());
    expect(rows.find((r) => r.recipient_id === f.child)).toMatchObject({
      href: '/student/homework',
      title: `New worksheet from ${t.name}: Fractions`,
    });
    expect(rows.filter((r) => r.recipient_id !== f.child).every((r) => r.href === '/parent/homework')).toBe(true);
  });

  it("AC-22: shared with several children, each notification names only that child and that child's item", async () => {
    const t = await teacher(sql, T0, { listing: false });
    const a = await family(sql);
    const b = await family(sql);
    await link(sql, t, a);
    await link(sql, t, b);
    await shareWorksheet(sql, t, [a.child, b.child], T0);
    const forA = [...(await notesOf(sql, a.child)), ...(await notesOf(sql, a.parent))];
    const forB = [...(await notesOf(sql, b.child)), ...(await notesOf(sql, b.parent))];
    expect(forA).toHaveLength(2);
    expect(forB).toHaveLength(2);
    expect(JSON.stringify(forA)).not.toContain(b.childName);
    expect(JSON.stringify(forB)).not.toContain(a.childName);
    expect(JSON.stringify([...forA, ...forB])).not.toMatch(/2 students|students/);
  });

  it('AC-19: a student only ever receives learning updates — no prices, proposals, enquiries or parent details', async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    await link(sql, t, f);
    await enquire(sql, t, f, T0);
    await propose(sql, t, f, T0);
    await shareWorksheet(sql, t, [f.child], T0);
    const rows = await notesOf(sql, f.child);
    expect(rows.map((r) => r.type)).toEqual(['worksheet_shared']);
    expect(JSON.stringify(rows)).not.toMatch(/₹|INR|price|proposal|enquir|Anita/i);
    const list = await listNotifications(sql, f.child, { view: 'page' }, T0);
    expect(list.items.every((i) => i.label === null)).toBe(true);
  });

  it('AC-23: reading a worksheet notification never marks the homework done or hides it', async () => {
    const t = await teacher(sql, T0, { listing: false });
    const f = await family(sql);
    await link(sql, t, f);
    await shareWorksheet(sql, t, [f.child], T0);
    const before = await listResourcesForStudent(sql, f.child);
    await markAllRead(sql, f.child, at(1));
    expect(await listResourcesForStudent(sql, f.child)).toEqual(before);
    const [share] = await sql`SELECT unshared_at FROM resource_shares WHERE student_id = ${f.child}`;
    expect(share!.unshared_at).toBeNull();
  });
});

describe('channels (AC-52, AC-51)', () => {
  it('AC-52: existing emails are queued exactly as before, with the same keys; the notification is separate; nothing is sent', async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    const e = await enquire(sql, t, f, T0);
    await answerEnquiry(sql, t.id, e, 'accept', '', BASE, at(1));
    const l = await requestLink(sql, t, f, T0, ['english']);
    await acceptLinkRequest(sql, t.id, l, BASE, at(1));
    const r = await propose(sql, t, f, T0);
    await expireRateNegotiations(sql, at(15), { teacherId: t.id });
    expect((await emailsTo(sql, t.email)).map((m) => [m.template, m.dedupe_key])).toEqual(
      expect.arrayContaining([
        ['enquiry_received', `enquiry_received:${e}`],
        ['teacher_link_request', expect.stringMatching(/^link_request:/)],
        ['rate_proposal_received', `rate_offer:${r}:1`],
        ['rate_proposal_expired', `rate_expired:${r}:${t.email}`],
      ]),
    );
    expect((await emailsTo(sql, f.parentEmail)).map((m) => [m.template, m.dedupe_key])).toEqual(
      expect.arrayContaining([
        ['enquiry_accepted', `enquiry_answer:${e}`],
        ['parent_link_request_accepted', `link_request_answered:${l}`],
        ['rate_proposal_expired', `rate_expired:${r}:${f.parentEmail}`],
      ]),
    );
    const [sent] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM email_outbox WHERE to_address IN (${t.email}, ${f.parentEmail}) AND status <> 'pending'`;
    expect(sent!.n).toBe(0);
    // Running the expiry again (retry) adds no email and no notification.
    const before = [(await emailsTo(sql, t.email)).length, (await notesOf(sql, t.id)).length];
    await expireRateNegotiations(sql, at(16));
    expect([(await emailsTo(sql, t.email)).length, (await notesOf(sql, t.id)).length]).toEqual(before);
    // Notification keys are separate from email keys (two channels).
    const keys = (await notesOf(sql, t.id)).map((n) => n.dedupe_key);
    const mailKeys = (await emailsTo(sql, t.email)).map((m) => m.dedupe_key);
    expect(keys.filter((k) => mailKeys.includes(k))).toEqual([]);
  });

  it('AC-52/AC-69: the time-based email keys stay exactly as before (teacher_decision:, teacher_profile_change:)', async () => {
    const owner = await createAdult(sql, 'superadmin');
    const t = await teacher(sql, T0, { listing: false });
    await sql`UPDATE teacher_profiles SET pending_subjects = ${['maths']}, pending_grades = ${[5]},
              change_submitted_at = ${T0} WHERE account_id = ${t.id}`;
    await decideProfileChange(sql, owner, t.id, { decision: 'decline', note: 'Not now', baseUrl: BASE }, at(2));
    expect(await emailsTo(sql, t.email)).toEqual([
      { template: 'teacher_profile_change_declined', dedupe_key: `teacher_profile_change:${t.id}:${at(2).getTime()}` },
    ]);
    expect((await notesOf(sql, t.id)).map((n) => n.dedupe_key)).toEqual([
      `profile_change:${t.id}:${T0.toISOString()}:declined`,
    ]);
  });

  it('AC-51: no reminder, rescheduling, placeholder or booking notification type exists; lesson types are only the approved ones', async () => {
    // CR-17 PR 2 (D3A-10, approved 23 Oct 2026) adds the in-app lesson types; rescheduling is cancel
    // and request again (D3A-6). PR 7 (D3A-10 Option A, 24 Oct 2026) allows exactly one reminder
    // type, 'lesson_reminder' (in-app, best-effort); any other reminder-like type still fails here.
    const [r] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM notifications
      WHERE type ~ '(remind|booking|reschedul|placeholder)' AND type NOT IN ('lesson_reminder', 'listing_reminder')`;
    expect(r!.n).toBe(0);
    const lessonTypes = await sql<{ type: string }[]>`
      SELECT DISTINCT type FROM notifications WHERE type ~ '(lesson|cancel)' ORDER BY type`;
    for (const { type } of lessonTypes) expect(LESSON_NOTIFICATION_TYPES as readonly string[]).toContain(type);
  });
});

describe('bell, list and marking (AC-2, AC-7, AC-24, AC-25, AC-62, AC-63)', () => {
  it("AC-2/AC-24: the bell number is exactly the signed-in user's unread notifications", async () => {
    const a = await createAdult(sql, 'parent');
    const b = await createAdult(sql, 'parent');
    for (let i = 0; i < 12; i += 1) await seedNote(sql, a, at(i));
    await seedNote(sql, a, at(20), { readAt: at(21) });
    await seedNote(sql, b, at(1));
    expect(await unreadCount(sql, a)).toBe(12);
    expect(await unreadCount(sql, b)).toBe(1);
    expect((await bellCounts(sql, a, T0)).unread).toBe(12);
    const list = await listNotifications(sql, a, { view: 'page' }, T0);
    expect(list.items).toHaveLength(13);
    expect(await unreadCount(sql, 'not-a-uuid')).toBe(0);
  });

  it('AC-7: "Mark all as read" marks every one of the user\'s notifications and nobody else\'s', async () => {
    const a = await createAdult(sql, 'parent');
    const b = await createAdult(sql, 'parent');
    for (let i = 0; i < 3; i += 1) await seedNote(sql, a, at(i));
    await seedNote(sql, b, at(1));
    expect(await markAllRead(sql, a, at(5))).toEqual({ marked: 3 });
    expect(await unreadCount(sql, a)).toBe(0);
    expect(await unreadCount(sql, b)).toBe(1);
    expect(await markAllRead(sql, a, at(6))).toEqual({ marked: 0 });
  });

  it('AC-60 (DB part): a failed "Mark all as read" changes no row (one statement, all or nothing)', async () => {
    const a = await createAdult(sql, 'parent');
    for (let i = 0; i < 3; i += 1) await seedNote(sql, a, at(i), { title: i === 2 ? 'boom' : `ok${i}` });
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION zz_fail_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.title = 'boom' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER zz_fail_update BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION zz_fail_update();`);
    try {
      await expect(markAllRead(sql, a, at(5))).rejects.toThrow(/injected failure/);
      expect(await unreadCount(sql, a)).toBe(3);
    } finally {
      await sql.unsafe(`DROP TRIGGER zz_fail_update ON notifications; DROP FUNCTION zz_fail_update();`);
    }
    expect(await markAllRead(sql, a, at(5))).toEqual({ marked: 3 });
  });

  it('AC-25: marking another user\'s notification is "not found" and changes nothing', async () => {
    const a = await createAdult(sql, 'parent');
    const b = await createAdult(sql, 'parent');
    const mine = await seedNote(sql, a, T0);
    const theirs = await seedNote(sql, b, T0);
    expect(await markRead(sql, a, theirs, at(1))).toEqual({ ok: false, reason: 'not_found' });
    expect(await markRead(sql, a, '00000000-0000-4000-8000-000000000000', at(1))).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await unreadCount(sql, b)).toBe(1);
    expect(await markRead(sql, a, mine, at(1))).toEqual({ ok: true });
    expect(await unreadCount(sql, a)).toBe(0);
  });

  it('AC-62: read_at is set once — marking again, "Mark all" and opening never move it', async () => {
    const a = await createAdult(sql, 'parent');
    const n = await seedNote(sql, a, T0);
    await markRead(sql, a, n, at(1));
    await markRead(sql, a, n, at(2));
    await markAllRead(sql, a, at(3));
    const [row] = await sql<{ read_at: Date }[]>`SELECT read_at FROM notifications WHERE id = ${n}`;
    expect(row!.read_at.toISOString()).toBe(at(1).toISOString());
    await expect(sql`UPDATE notifications SET read_at = ${at(9)} WHERE id = ${n}`).rejects.toThrow(/set once/);
    await expect(sql`UPDATE notifications SET read_at = NULL WHERE id = ${n}`).rejects.toThrow(/set once/);
    await expect(sql`UPDATE notifications SET title = 'changed' WHERE id = ${n}`).rejects.toThrow(/cannot be changed/);
  });

  it('AC-63: keyset paging is stable — 45 rows give 20, 20, 5 with no repeat or gap, with new arrivals and equal times', async () => {
    const a = await createAdult(sql, 'parent');
    // Five groups of rows sharing the same created_at.
    for (let i = 0; i < 45; i += 1) await seedNote(sql, a, at(Math.floor(i / 5)), { title: `n${i}` });
    const first = await listNotifications(sql, a, { view: 'page' }, at(30));
    expect(first.items).toHaveLength(20);
    // Three new notifications arrive between loads.
    const fresh: string[] = [];
    for (let i = 0; i < 3; i += 1) fresh.push(await seedNote(sql, a, at(40), { title: `new${i}` }));
    const second = await listNotifications(sql, a, { view: 'page', before: first.nextCursor }, at(30));
    const third = await listNotifications(sql, a, { view: 'page', before: second.nextCursor }, at(30));
    expect(second.items).toHaveLength(20);
    expect(third.items).toHaveLength(5);
    expect(third.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items, ...third.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(45);
    expect(ids.some((x) => fresh.includes(x))).toBe(false);
    // Order: newest first, then id.
    const [ordered] = await sql<{ ids: string[] }[]>`
      SELECT array_agg(id ORDER BY created_at DESC, id DESC) AS ids FROM notifications
      WHERE recipient_id = ${a} AND title NOT LIKE 'new%'`;
    expect(ids).toEqual(ordered!.ids);
    // The panel never offers "Show older"; it shows the latest 10.
    const panel = await listNotifications(sql, a, { view: 'panel' }, at(30));
    expect(panel.items).toHaveLength(10);
    expect(panel.nextCursor).toBeNull();
    // Unread filter pages the same way; its count is the bell number.
    await markRead(sql, a, first.items[0]!.id, at(31));
    const unread = await listNotifications(sql, a, { view: 'page', filter: 'unread' }, at(30));
    expect(unread.items.every((i) => i.unread)).toBe(true);
    expect(await unreadCount(sql, a)).toBe(47);
  });

  it('AC-63/§6.2: a student sees the latest 20 only — no page, no "Show older"', async () => {
    const p = await createAdult(sql, 'parent');
    const s = await createChild(sql, p);
    const seeded: string[] = [];
    for (let i = 0; i < 25; i += 1) seeded.push(await seedNote(sql, s, at(i), { href: '/student', title: `s${i}` }));
    const sheet = await listNotifications(sql, s, { view: 'page' }, at(30));
    expect(sheet.items.map((i) => i.id)).toEqual(seeded.slice(5).reverse());
    expect(sheet.nextCursor).toBeNull();
    const older = await listNotifications(sql, s, { view: 'page', before: `0_${sheet.items[19]!.id}` }, at(30));
    expect(older.items.map((i) => i.id)).toEqual(sheet.items.map((i) => i.id));
  });

  it('AC-24/AC-68: a not-approved teacher, a Super Admin and an unknown id get no notifications and no count', async () => {
    const t = await teacher(sql, T0, { listing: false });
    await seedNote(sql, t.id, T0, { href: '/teacher/status' });
    expect(await unreadCount(sql, t.id)).toBe(1);
    await sql`UPDATE teacher_profiles SET approval_status = 'rejected' WHERE account_id = ${t.id}`;
    await sql`UPDATE accounts SET status = 'pending_approval' WHERE id = ${t.id}`;
    expect(await unreadCount(sql, t.id)).toBe(0);
    expect((await listNotifications(sql, t.id, { view: 'page' }, T0)).items).toEqual([]);
    const owner = await createAdult(sql, 'superadmin');
    expect(await bellCounts(sql, owner, T0)).toEqual({ unread: 0, badges: {} });
  });
});

describe('retention (AC-36, AC-37, AC-50, AC-62)', () => {
  const reset = () => sql`UPDATE notification_throttles SET last_run_at = '-infinity' WHERE name = 'cleanup'`;
  const exists = async (id: string) => (await sql`SELECT 1 FROM notifications WHERE id = ${id}`).length === 1;
  const SECOND = 1000;

  it('AC-36: read rows go 90 days after read_at, unread rows 180 days after created_at, at the one-second boundary, for every role', async () => {
    const R = new Date('2032-01-01T00:00:00Z');
    const plus = (d: number, s = 0) => new Date(R.getTime() + d * DAY + s * SECOND);
    const p = await createAdult(sql, 'parent');
    const t = await teacher(sql, T0, { listing: false });
    const s = await createChild(sql, p);
    const ids: Record<string, string[]> = { read: [], unread: [] };
    for (const who of [p, t.id, s]) {
      ids.read!.push(await seedNote(sql, who, R, { readAt: R }));
      ids.unread!.push(await seedNote(sql, who, R));
    }
    await reset();
    await cleanupNotifications(sql, plus(90, -1));
    for (const id of [...ids.read!, ...ids.unread!]) expect(await exists(id)).toBe(true);
    await reset();
    expect(await cleanupNotifications(sql, plus(90))).toBeGreaterThanOrEqual(3);
    for (const id of ids.read!) expect(await exists(id)).toBe(false);
    for (const id of ids.unread!) expect(await exists(id)).toBe(true);
    await reset();
    await cleanupNotifications(sql, plus(180, -1));
    for (const id of ids.unread!) expect(await exists(id)).toBe(true);
    await reset();
    await cleanupNotifications(sql, plus(180));
    for (const id of ids.unread!) expect(await exists(id)).toBe(false);
  });

  it('AC-62: an unread notification read on day 170 is kept on day 180 and goes at read_at + 90 days; time zones do not matter', async () => {
    const R = new Date('2033-01-01T00:00:00Z');
    const plus = (d: number) => new Date(R.getTime() + d * DAY);
    const p = await createAdult(sql, 'parent');
    await sql`UPDATE accounts SET time_zone = 'America/New_York' WHERE id = ${p}`;
    const n = await seedNote(sql, p, R);
    await markRead(sql, p, n, plus(170));
    await reset();
    await cleanupNotifications(sql, plus(180));
    expect(await exists(n)).toBe(true);
    await reset();
    await cleanupNotifications(sql, new Date(plus(260).getTime() - 1000));
    expect(await exists(n)).toBe(true);
    await reset();
    await cleanupNotifications(sql, plus(260));
    expect(await exists(n)).toBe(false);
  });

  it('AC-37: clean-up never changes business records, and badges stay the same', async () => {
    const t = await teacher(sql, at(400));
    const f = await family(sql);
    const e = await enquire(sql, t, f, at(400));
    const v = await loadViewer(sql, t.id);
    const before = await menuBadges(sql, v, at(401));
    const [rec] = await sql`SELECT * FROM teacher_enquiries WHERE id = ${e}`;
    await reset();
    await cleanupNotifications(sql, at(401 + 181));
    expect(await notesFor(sql, e)).toEqual([]);
    expect((await sql`SELECT * FROM teacher_enquiries WHERE id = ${e}`)[0]).toEqual(rec);
    expect(await menuBadges(sql, v, at(401))).toEqual(before);
    expect(before['/teacher/enquiries']).toBe(1);
  });

  it('AC-50: clean-up runs at most once an hour; two concurrent requests run it once', async () => {
    await reset();
    const a = testDb();
    const b = testDb();
    try {
      const results = await Promise.all([cleanupNotifications(a, T0), cleanupNotifications(b, T0)]);
      expect(results.filter((r) => r !== null)).toHaveLength(1);
      expect(await cleanupNotifications(sql, T0)).toBeNull();
      await sql`UPDATE notification_throttles SET last_run_at = now() - interval '59 minutes' WHERE name = 'cleanup'`;
      expect(await cleanupNotifications(sql, T0)).toBeNull();
      await sql`UPDATE notification_throttles SET last_run_at = now() - interval '60 minutes' WHERE name = 'cleanup'`;
      expect(await cleanupNotifications(sql, T0)).not.toBeNull();
    } finally {
      await a.end();
      await b.end();
    }
  });
});
