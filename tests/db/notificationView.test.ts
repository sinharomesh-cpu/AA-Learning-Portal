import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { createAdult, createChild, testDb } from './helpers';
import { BASE, DAY, enquire, family, seedNote, teacher } from './notificationFixtures';

/**
 * CR-16 N2: the server side the bell, panel, sheet and pages use — the shell counts and the
 * Server Actions (refresh, list, mark read, mark all, open). The session is replaced by a test
 * double; everything else runs against the real (throwaway) database. Identity always comes
 * from the session: ids from the browser can only name a notification, never a user.
 */

const session = vi.hoisted(() => ({
  current: null as null | { accountId: string; role: string; timeZone: string },
}));
vi.mock('@/server/session', () => ({
  getRealSession: async () =>
    session.current ? { token: 't', session: { ...session.current, displayName: 'X', status: 'active' } } : null,
  getViewer: async () => (session.current ? { id: session.current.accountId, role: session.current.role } : null),
}));
vi.mock('@/server/requestInfo', () => ({ siteBaseUrl: async () => BASE, clientIp: async () => undefined }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const sql = testDb();
const as = (accountId: string, role: string, timeZone = 'Asia/Kolkata') => {
  session.current = { accountId, role, timeZone };
};

let actions: typeof import('@/app/notifications/actions');
let view: typeof import('@/server/notifications/view');

beforeAll(async () => {
  process.env.DATABASE_URL = inject('databaseUrl');
  actions = await import('@/app/notifications/actions');
  view = await import('@/server/notifications/view');
  await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
});
afterAll(async () => {
  const { closeDb } = await import('@/server/db/client');
  await closeDb();
  await sql.end();
});
beforeEach(() => {
  session.current = null;
});

describe('shell counts (§4, §6, D-5, D-6, Q-2)', () => {
  it('a parent gets the bell number, their badges and "See all"', async () => {
    const now = new Date();
    const t = await teacher(sql, now);
    const f = await family(sql);
    await enquire(sql, t, f, now);
    await seedNote(sql, f.parent, new Date(), { title: 'One' });
    as(f.parent, 'parent');
    const s = await view.shellNotifications();
    expect(s).toMatchObject({ role: 'parent', unread: 1, badges: { '/parent/enquiries': 0 }, seeAll: true });
    as(t.id, 'teacher');
    expect(await view.shellNotifications()).toMatchObject({
      role: 'teacher',
      badges: { '/teacher/enquiries': 1, '/teacher/students': 0, '/teacher/listing': 0 },
      seeAll: true,
    });
  });

  it('a teacher awaiting approval: bell without "See all" or badges; not approved, admins and signed out: none', async () => {
    const waiting = await createAdult(sql, 'teacher', 'pending_approval');
    await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status) VALUES (${waiting}, 'self_registered', 'submitted')`;
    as(waiting, 'teacher');
    expect(await view.shellNotifications()).toMatchObject({ role: 'teacher', badges: {}, seeAll: false, unread: 0 });

    const owner = await createAdult(sql, 'superadmin');
    const rejected = await createAdult(sql, 'teacher', 'pending_approval');
    await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, decided_by, decided_at)
              VALUES (${rejected}, 'self_registered', 'rejected', ${owner}, now())`;
    as(rejected, 'teacher');
    expect(await view.shellNotifications()).toBeNull();
    as(owner, 'superadmin');
    expect(await view.shellNotifications()).toBeNull();
    session.current = null;
    expect(await view.shellNotifications()).toBeNull();
  });

  it('a student gets the bell, no badges and no "See all"', async () => {
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    as(child, 'student');
    expect(await view.shellNotifications()).toMatchObject({ role: 'student', badges: {}, seeAll: false, unread: 0 });
  });
});

describe('Server Actions', () => {
  it('signed-out requests go to sign-in', async () => {
    await expect(actions.refreshBellAction()).rejects.toThrow('REDIRECT /sign-in');
    await expect(actions.loadNotificationsAction({})).rejects.toThrow('REDIRECT /sign-in');
    await expect(actions.markAllReadAction()).rejects.toThrow('REDIRECT /sign-in');
    await expect(actions.openNotificationAction('x')).rejects.toThrow('REDIRECT /sign-in');
  });

  it('AC-74: the refresh runs the user-scoped check and counts in the same response (no ids from the browser)', async () => {
    const now = new Date();
    const t = await teacher(sql, now);
    const f = await family(sql);
    const id = await enquire(sql, t, f, new Date(now.getTime() - 15 * DAY));
    // Hold the shared sweep: only the user-scoped check can expire it.
    await sql`UPDATE notification_throttles SET last_run_at = now() WHERE name = 'shared_sweep'`;
    as(f.parent, 'parent');
    const r = await actions.refreshBellAction();
    expect(r).toEqual({ ok: true, unread: 1, badges: { '/parent/enquiries': 0 } });
    const [e] = await sql<{ status: string }[]>`SELECT status FROM teacher_enquiries WHERE id = ${id}`;
    expect(e!.status).toBe('expired');
  });

  it('lists send only what the screen shows: no link, record type or record id; times in the account time zone', async () => {
    const f = await family(sql);
    await sql`UPDATE accounts SET time_zone = 'Asia/Singapore' WHERE id = ${f.parent}`;
    const created = new Date('2026-10-20T08:35:00Z');
    const nid = await seedNote(sql, f.parent, created, { title: 'Hello' });
    as(f.parent, 'parent', 'Asia/Singapore');
    const r = await actions.loadNotificationsAction({ view: 'page', filter: 'all' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const item = r.items.find((i) => i.id === nid)!;
    expect(Object.keys(item).sort()).toEqual(
      ['body', 'createdAt', 'id', 'kind', 'label', 'redacted', 'title', 'unread', 'when'].sort(),
    );
    expect(item.when).toBe('20 Oct 2026, 4:35 pm');
    expect(JSON.stringify(r)).not.toContain('/parent/');
    // A malformed paging position gives nothing, not an error.
    expect(await actions.loadNotificationsAction({ view: 'page', before: "1' OR 1=1" })).toEqual({
      ok: true,
      items: [],
      nextCursor: null,
    });
    // Anything but "page" is the panel (10, no "Show older").
    const panel = await actions.loadNotificationsAction({ view: 'everything' });
    expect(panel.ok && panel.nextCursor).toBe(null);
  });

  it('AC-25, AC-59: another account’s id is "not found" and changes nothing; Mark all touches only the user’s rows', async () => {
    const a = await family(sql);
    const b = await family(sql);
    const mine = await seedNote(sql, a.parent, new Date(), { title: 'Mine' });
    const theirs = await seedNote(sql, b.parent, new Date(), { title: 'Theirs' });
    as(a.parent, 'parent');
    expect(await actions.markReadAction(theirs)).toEqual({ ok: false });
    expect(await actions.openNotificationAction(theirs)).toEqual({ ok: false });
    expect(await actions.markReadAction('not-an-id')).toEqual({ ok: false });
    expect(await actions.markReadAction({ id: theirs })).toEqual({ ok: false });
    const [t1] = await sql<{ read_at: Date | null }[]>`SELECT read_at FROM notifications WHERE id = ${theirs}`;
    expect(t1!.read_at).toBeNull();
    expect(await actions.markReadAction(mine)).toEqual({ ok: true, unread: 0 });
    await seedNote(sql, a.parent, new Date(), { title: 'Mine too' });
    expect(await actions.markAllReadAction()).toEqual({ ok: true, unread: 0 });
    const [t2] = await sql<{ read_at: Date | null }[]>`SELECT read_at FROM notifications WHERE id = ${theirs}`;
    expect(t2!.read_at).toBeNull();
  });

  it('AC-5, AC-27: the open step returns the internal page, or the fixed "no longer available" page; both mark read', async () => {
    const now = new Date();
    const t = await teacher(sql, now);
    const f = await family(sql);
    const enquiry = await enquire(sql, t, f, now);
    const ok = await seedNote(sql, f.parent, new Date(), {
      title: 'About the enquiry',
      href: '/parent/enquiries',
      entityType: 'enquiry',
      entityId: enquiry,
    });
    as(f.parent, 'parent');
    expect(await actions.openNotificationAction(ok)).toEqual({ ok: true, href: '/parent/enquiries', unread: 0 });

    // Access ended: a link request about a child the parent no longer looks after.
    const [l] = await sql<{ id: string }[]>`
      INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects,
                                         requested_at, expires_at)
      VALUES (${t.id}, ${f.child}, ${f.parent}, 'parent_added', 'requested', ${['maths']}, now(),
              now() + interval '14 days') RETURNING id`;
    const gone = await seedNote(sql, f.parent, new Date(), {
      title: `Request for ${f.childName}`,
      href: '/parent/teachers',
      entityType: 'link_request',
      entityId: l!.id,
    });
    await sql`UPDATE guardian_links SET status = 'revoked', revoked_at = now() WHERE student_id = ${f.child}`;
    const r = await actions.openNotificationAction(gone);
    expect(r).toEqual({ ok: true, href: '/parent/notifications/unavailable', unread: 0 });
    expect(JSON.stringify(r)).not.toContain(f.childName);
    const [n] = await sql<{ read_at: Date | null }[]>`SELECT read_at FROM notifications WHERE id = ${gone}`;
    expect(n!.read_at).not.toBeNull();
  });

  it('admins get nothing from the actions (D-6)', async () => {
    const owner = await createAdult(sql, 'superadmin');
    as(owner, 'superadmin');
    expect(await actions.refreshBellAction()).toEqual({ ok: false });
    expect(await actions.loadNotificationsAction({})).toEqual({ ok: false });
  });
});
