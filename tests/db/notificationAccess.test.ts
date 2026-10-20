import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decideProfileChange, decideTeacher, setAccountActive } from '@/server/admin';
import { loadViewer } from '@/server/notifications/access';
import { menuBadges } from '@/server/notifications/badges';
import { enquiryReceived } from '@/server/notifications/events';
import {
  bellCounts,
  listNotifications,
  markRead,
  NO_LONGER_AVAILABLE,
  openNotification,
  REDACTED_TITLE,
  unreadCount,
} from '@/server/notifications/queries';
import { acceptLinkRequest, removeTeacher, teacherMaySee } from '@/server/teacherLinks';
import { answerEnquiry } from '@/server/teacherEnquiries';
import { setArchived, unshareResource } from '@/server/teacherResources';
import { createAdult, testDb, uniq } from './helpers';
import {
  BASE,
  DAY,
  enquire,
  family,
  type Family,
  link,
  notesFor,
  notesOf,
  propose,
  requestLink,
  seedNote,
  shareWorksheet,
  teacher,
  type Teacher,
} from './notificationFixtures';

/**
 * CR-16 §8 / §8.1 (D-8, Q-4): access is re-checked on the server every time a list is shown and
 * every time a notification is opened. Rows the user may no longer see are redacted; opening one
 * shows only the neutral message and marks it read. AC-27, AC-46, AC-49, AC-59, AC-67, AC-68.
 */
const sql = testDb();
const T0 = new Date('2026-12-10T04:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);

beforeAll(async () => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
});
afterAll(() => sql.end());

async function badges(id: string, now = at(2)) {
  return menuBadges(sql, await loadViewer(sql, id), now);
}

/** Lists, then opens, a notification whose access has ended; checks every AC-27 / AC-67 point. */
async function expectEnded(recipient: string, noteId: string, secrets: string[], now = at(2)) {
  const list = await listNotifications(sql, recipient, { view: 'page' }, now);
  const item = list.items.find((i) => i.id === noteId)!;
  // AC-67: redacted in place — title only, no message, label, link, type or record id.
  expect(item).toEqual({
    id: noteId,
    createdAt: expect.any(Date),
    unread: true,
    redacted: true,
    kind: null,
    type: null,
    title: REDACTED_TITLE,
    body: null,
    href: null,
    label: null,
  });
  const text = JSON.stringify(list);
  for (const s of secrets) expect(text).not.toContain(s);
  // An unread redacted row still counts in the bell.
  const before = await unreadCount(sql, recipient);
  const badgesBefore = await badges(recipient, now);
  const opened = await openNotification(sql, recipient, noteId, now);
  expect(opened).toEqual({ ok: false, reason: 'unavailable', message: NO_LONGER_AVAILABLE });
  for (const s of secrets) expect(JSON.stringify(opened)).not.toContain(s);
  const [row] = await sql<{ read_at: Date | null }[]>`SELECT read_at FROM notifications WHERE id = ${noteId}`;
  expect(row!.read_at?.toISOString()).toBe(now.toISOString());
  expect(await unreadCount(sql, recipient)).toBe(before - 1);
  expect(await badges(recipient, now)).toEqual(badgesBefore);
  // Already read: the same message, read_at unchanged; the row is still stored.
  expect(await openNotification(sql, recipient, noteId, at(3))).toEqual(opened);
  const [again] = await sql<{ read_at: Date }[]>`SELECT read_at FROM notifications WHERE id = ${noteId}`;
  expect(again!.read_at.toISOString()).toBe(now.toISOString());
}

const noteFor = async (recipient: string, entityId: string) =>
  (await notesFor(sql, entityId)).find((n) => n.recipient_id === recipient)!;

describe('AC-27 / AC-67: access ended — each of the five causes', () => {
  it("AC-27 (1) guardian relationship ended: the parent's link notification is redacted; their own enquiry still opens", async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    const l = await requestLink(sql, t, f, T0);
    await acceptLinkRequest(sql, t.id, l, BASE, at(1));
    const e = await enquire(sql, t, f, T0);
    await answerEnquiry(sql, t.id, e, 'accept', '', BASE, at(1));
    const linkNote = await noteFor(f.parent, l);
    const enqNote = await noteFor(f.parent, e);
    // Before: listed normally and opens.
    expect(
      (await listNotifications(sql, f.parent, { view: 'page' }, at(1))).items.find((i) => i.id === linkNote.id),
    ).toMatchObject({ redacted: false, title: linkNote.title, href: '/parent/teachers' });
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = ${at(2)} WHERE parent_id = ${f.parent}`;
    await expectEnded(f.parent, linkNote.id, [linkNote.title, f.childName, l]);
    // The existing enquiry rules keep the parent's own enquiry visible: no false redaction.
    expect(await openNotification(sql, f.parent, enqNote.id, at(2))).toEqual({ ok: true, href: '/parent/enquiries' });
  });

  it("AC-27 (2) teacher–child link removed: the teacher's link notification is redacted", async () => {
    const t = await teacher(sql, T0, { listing: false });
    const f = await family(sql);
    const l = await requestLink(sql, t, f, T0);
    await acceptLinkRequest(sql, t.id, l, BASE, at(1));
    const n = await noteFor(t.id, l);
    expect(await openNotification(sql, t.id, n.id, at(1))).toEqual({ ok: true, href: '/teacher/students' });
    // A second accepted request gives an unread notification for the removal case.
    const g = await family(sql);
    const l2 = await requestLink(sql, t, g, T0);
    await acceptLinkRequest(sql, t.id, l2, BASE, at(1));
    const n2 = await noteFor(t.id, l2);
    expect(await removeTeacher(sql, g.parent, t.id, at(2))).toEqual({ ok: true });
    expect(await teacherMaySee(sql, t.id, g.child)).toBe(false);
    await expectEnded(t.id, n2.id, [n2.title, g.childName, g.child, l2]);
  });

  it("AC-27 (3) resource unshared, and AC-67 access restored: the student's and parent's rows follow the share", async () => {
    const t = await teacher(sql, T0, { listing: false });
    const f = await family(sql);
    await link(sql, t, f);
    const resourceId = await shareWorksheet(sql, t, [f.child], T0, `Fractions ${uniq()}`);
    const [share] = await sql<{ id: string }[]>`SELECT id FROM resource_shares WHERE resource_id = ${resourceId}`;
    const studentNote = await noteFor(f.child, share!.id);
    const parentNote = await noteFor(f.parent, share!.id);
    // Archived (hidden) → redacted; restored → shown normally again; the row was kept throughout.
    await setArchived(sql, t.id, resourceId, true, at(1));
    let item = (await listNotifications(sql, f.child, {}, at(1))).items.find((i) => i.id === studentNote.id)!;
    expect(item.redacted).toBe(true);
    await setArchived(sql, t.id, resourceId, false, at(1));
    item = (await listNotifications(sql, f.child, {}, at(1))).items.find((i) => i.id === studentNote.id)!;
    expect(item).toMatchObject({ redacted: false, title: studentNote.title, href: '/student/homework' });
    expect(await unshareResource(sql, t.id, resourceId, f.child, at(2))).toEqual({ ok: true });
    await expectEnded(f.child, studentNote.id, [studentNote.title, t.name, resourceId, share!.id]);
    await expectEnded(f.parent, parentNote.id, [parentNote.title, f.childName, share!.id]);
  });

  it("AC-27 (4) account deactivated: a deactivated parent cannot sign in, and their request leaves the teacher's view", async () => {
    const owner = await createAdult(sql, 'superadmin');
    const t = await teacher(sql, T0, { listing: false });
    const f = await family(sql);
    const l = await requestLink(sql, t, f, T0);
    const n = await noteFor(t.id, l);
    expect(await setAccountActive(sql, owner, f.parent, { active: false, reason: 'Test closure' }, at(2))).toEqual({
      ok: true,
    });
    // The deactivated parent's own notifications are not available (they cannot sign in).
    expect(await listNotifications(sql, f.parent, {}, at(2))).toEqual({ items: [], nextCursor: null });
    // "Requests from parents" no longer shows a request from an inactive parent: redacted for the teacher.
    await expectEnded(t.id, n.id, [n.title, f.parentFirst, l]);
  });

  it("AC-27 (5) another permission revoked: an approved profile change ends the link; the teacher's row is redacted", async () => {
    const owner = await createAdult(sql, 'superadmin');
    const t = await teacher(sql, T0, { listing: false });
    const f = await family(sql);
    const l = await requestLink(sql, t, f, T0, ['maths']);
    await acceptLinkRequest(sql, t.id, l, BASE, at(1));
    const n = await noteFor(t.id, l);
    await sql`UPDATE teacher_profiles SET pending_subjects = ${['english']}, pending_grades = ${[5]},
              change_submitted_at = ${at(1)} WHERE account_id = ${t.id}`;
    expect(
      (await decideProfileChange(sql, owner, t.id, { decision: 'approve', note: 'Fine', baseUrl: BASE }, at(2))).ok,
    ).toBe(true);
    expect(await teacherMaySee(sql, t.id, f.child)).toBe(false);
    await expectEnded(t.id, n.id, [n.title, f.childName, l]);
  });

  it('AC-27: access removed after the list was shown is still caught when opening', async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    const l = await requestLink(sql, t, f, T0);
    await acceptLinkRequest(sql, t.id, l, BASE, at(1));
    const n = await noteFor(f.parent, l);
    const shown = await listNotifications(sql, f.parent, { view: 'page' }, at(1));
    expect(shown.items.find((i) => i.id === n.id)?.redacted).toBe(false);
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = ${at(1)} WHERE parent_id = ${f.parent}`;
    expect(await openNotification(sql, f.parent, n.id, at(1))).toEqual({
      ok: false,
      reason: 'unavailable',
      message: NO_LONGER_AVAILABLE,
    });
  });
});

describe('teachers awaiting approval and not approved (AC-46, AC-68)', () => {
  async function awaiting(): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name, password_hash)
      VALUES ('teacher', 'pending_approval', ${`aw-${uniq()}@example.com`}, 'Awaiting Sample', 'x') RETURNING id`;
    await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, submitted_at)
              VALUES (${row!.id}, 'self_registered', 'submitted', ${['maths']}, ${[5]}, 'Bio', ${T0})`;
    return row!.id;
  }

  it('AC-46: awaiting approval — only approval-status and profile notifications are created or listed; others are redacted', async () => {
    const owner = await createAdult(sql, 'superadmin');
    const id = await awaiting();
    expect(
      (await decideTeacher(sql, owner, id, { decision: 'changes', note: 'More detail', baseUrl: BASE }, at(1))).ok,
    ).toBe(true);
    // An enquiry event for a teacher who is not approved creates nothing.
    const t = await teacher(sql, T0);
    const f = await family(sql);
    const e = await enquire(sql, t, f, T0);
    await sql`UPDATE teacher_enquiries SET teacher_id = ${id} WHERE id = ${e}`;
    await sql.begin((tx) => enquiryReceived(tx, e, at(1)));
    expect((await notesOf(sql, id)).map((n) => n.type)).toEqual(['teacher_changes_requested']);
    // A marketplace row (seeded) is never shown to them; opening it re-checks status on the server.
    const seeded = await seedNote(sql, id, at(2), {
      entityType: 'enquiry',
      entityId: e,
      href: '/teacher/enquiries',
      title: 'Hidden',
    });
    const list = await listNotifications(sql, id, { view: 'page' }, at(2));
    expect(list.items.map((i) => [i.title, i.redacted])).toEqual([
      [REDACTED_TITLE, true],
      ['Please update your profile', false],
    ]);
    expect(await openNotification(sql, id, seeded, at(2))).toMatchObject({ ok: false, reason: 'unavailable' });
    const status = list.items[1]!;
    expect(await openNotification(sql, id, status.id, at(2))).toEqual({ ok: true, href: '/teacher/status' });
    expect((await bellCounts(sql, id, at(2))).badges).toEqual({});
  });

  it('AC-68: not approved — rejection creates no notification; an earlier one is never displayed or opened', async () => {
    const owner = await createAdult(sql, 'superadmin');
    const id = await awaiting();
    await decideTeacher(sql, owner, id, { decision: 'changes', note: 'More detail', baseUrl: BASE }, at(1));
    await sql`UPDATE teacher_profiles SET approval_status = 'submitted', submitted_at = ${at(2)} WHERE account_id = ${id}`;
    expect(
      (await decideTeacher(sql, owner, id, { decision: 'reject', note: 'Not a fit', baseUrl: BASE }, at(3))).ok,
    ).toBe(true);
    const stored = await notesOf(sql, id);
    expect(stored.map((n) => n.type)).toEqual(['teacher_changes_requested']); // kept until retention
    const [mail] = await sql<{ template: string }[]>`
      SELECT template FROM email_outbox o JOIN accounts a ON a.email = o.to_address
      WHERE a.id = ${id} AND template = 'teacher_not_approved'`;
    expect(mail?.template).toBe('teacher_not_approved');
    expect(await listNotifications(sql, id, { view: 'page' }, at(3))).toEqual({ items: [], nextCursor: null });
    expect(await bellCounts(sql, id, at(3))).toEqual({ unread: 0, badges: {} });
    expect(await openNotification(sql, id, stored[0]!.id, at(3))).toEqual({ ok: false, reason: 'not_found' });
    expect(await markRead(sql, id, stored[0]!.id, at(3))).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('no cross-account leakage (AC-59, AC-49, AC-18, AC-24)', () => {
  it("AC-59: five accounts — another user's id behaves exactly like a missing one, and no response names another family's child", async () => {
    const t: Teacher = await teacher(sql, T0);
    const unlinked: Teacher = await teacher(sql, T0);
    const a: Family = await family(sql);
    const b: Family = await family(sql);
    await link(sql, t, a);
    await requestLink(sql, unlinked, b, T0);
    await enquire(sql, unlinked, a, T0);
    await propose(sql, t, b, T0);
    await shareWorksheet(sql, t, [a.child], T0);
    const accounts = [a.parent, b.parent, t.id, unlinked.id, a.child];
    const missing = '00000000-0000-4000-8000-000000000000';
    for (const me of accounts) {
      const others = accounts.filter((x) => x !== me);
      const theirNotes = (
        await sql<{ id: string }[]>`SELECT id FROM notifications WHERE recipient_id IN ${sql(others)}`
      ).map((r) => r.id);
      expect(theirNotes.length).toBeGreaterThan(0);
      const unreadBefore = await unreadCount(sql, me);
      for (const id of theirNotes) {
        expect(await openNotification(sql, me, id, at(1))).toEqual(await openNotification(sql, me, missing, at(1)));
        expect(await markRead(sql, me, id, at(1))).toEqual(await markRead(sql, me, missing, at(1)));
      }
      const [stillUnread] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications WHERE id IN ${sql(theirNotes)} AND read_at IS NOT NULL`;
      expect(stillUnread!.n).toBe(0);
      expect(await unreadCount(sql, me)).toBe(unreadBefore);
      // A paging position cannot reach anyone else's rows.
      const list = await listNotifications(sql, me, { view: 'page' }, at(1));
      const paged = await listNotifications(
        sql,
        me,
        { view: 'page', before: `9999999999999999_${theirNotes[0]}` },
        at(1),
      );
      const mine = new Set(
        (await sql<{ id: string }[]>`SELECT id FROM notifications WHERE recipient_id = ${me}`).map((r) => r.id),
      );
      for (const i of [...list.items, ...paged.items]) expect(mine.has(i.id)).toBe(true);
      // No response names another family's child; teachers never get any child name (AC-18).
      const text = JSON.stringify([list, paged, await bellCounts(sql, me, at(1))]);
      if (me !== a.parent && me !== a.child) expect(text).not.toContain(a.childName);
      if (me !== b.parent) expect(text).not.toContain(b.childName);
      if (me === t.id || me === unlinked.id) {
        for (const c of [a.child, b.child]) expect(text).not.toContain(c);
      }
    }
  });

  it('AC-49: a notification never grants access — opening returns only a path, and only while the record is visible', async () => {
    const t = await teacher(sql, T0, { listing: false });
    const f = await family(sql);
    const l = await requestLink(sql, t, f, T0);
    const n = await noteFor(t.id, l);
    const opened = await openNotification(sql, t.id, n.id, at(1));
    expect(opened).toEqual({ ok: true, href: '/teacher/students' });
    // Opening did not give the teacher sight of the child (the request is not accepted).
    expect(await teacherMaySee(sql, t.id, f.child)).toBe(false);
  });
});
