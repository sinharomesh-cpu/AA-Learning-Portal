import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ActionLabel, actionLabel } from '@/server/notifications/access';
import { listNotifications, markAllRead, markRead } from '@/server/notifications/queries';
import { applyPricingMigration, rollbackPricingMigration } from '@/server/pricingMigration';
import { packageNeedsDetails, type PackageInput, savePackage, withdrawPackage } from '@/server/pricingModel';
import { answerRate, counterRate, expireRateNegotiations, withdrawRate } from '@/server/rateNegotiations';
import { answerEnquiry, expireEnquiries, withdrawEnquiry } from '@/server/teacherEnquiries';
import {
  acceptLinkRequest,
  declineLinkRequest,
  expireLinkRequests,
  removeTeacher,
  withdrawLinkRequest,
} from '@/server/teacherLinks';
import { saveUsualTimes } from '@/server/teacherUsualTimes';
import { createAdult, testDb } from './helpers';
import {
  BASE,
  DAY,
  enquire,
  family,
  type Family,
  notesFor,
  propose,
  requestLink,
  teacher,
  type Teacher,
} from './notificationFixtures';

/**
 * CR-16 §6.1 (D-1): the action label of every action notification follows its current business
 * record — one case per cell of the §6.1 table (AC-31) — and is the same read or unread (AC-43).
 */
const sql = testDb();
const T0 = new Date('2026-12-01T04:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const counter = { amount: '3,600', sessions: 8, minutes: 40, message: '' };

beforeAll(async () => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
});
afterAll(async () => {
  const owner = await createAdult(sql, 'superadmin');
  await rollbackPricingMigration(sql, owner, T0);
  await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
  await sql.end();
});

/** The label the recipient's list shows for the notification about this record (read and unread). */
async function labelOf(recipient: string, entityId: string, now: Date, seq?: number): Promise<ActionLabel | null> {
  const list = await listNotifications(sql, recipient, { view: 'page' }, now);
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM notifications WHERE recipient_id = ${recipient} AND entity_id = ${entityId} AND kind = 'action'
      ${seq ? sql`AND offer_seq = ${seq}` : sql``}`;
  const unread = list.items.find((i) => i.id === row!.id)!;
  expect(unread.redacted).toBe(false);
  // Reading changes neither the label nor the record (AC-43).
  await markRead(sql, recipient, row!.id, now);
  const read = (await listNotifications(sql, recipient, { view: 'page' }, now)).items.find((i) => i.id === row!.id)!;
  expect(read.label).toBe(unread.label);
  return unread.label;
}

describe('AC-31: enquiry received (teacher)', () => {
  it('AC-31: pending → Needs your reply; accepted / declined → Done; withdrawn / expired / past expiry → No longer needed', async () => {
    const t = await teacher(sql, T0);
    const cases: Array<[string, (f: Family, id: string) => Promise<unknown>, Date, ActionLabel]> = [
      ['pending', async () => {}, at(1), 'Needs your reply'],
      ['accepted', (_f, id) => answerEnquiry(sql, t.id, id, 'accept', '', BASE, at(1)), at(1), 'Done'],
      ['declined', (_f, id) => answerEnquiry(sql, t.id, id, 'decline', '', BASE, at(1)), at(1), 'Done'],
      ['withdrawn', (f, id) => withdrawEnquiry(sql, f.parent, id, at(1)), at(1), 'No longer needed'],
      ['expired', () => expireEnquiries(sql, at(15), { teacherId: t.id }), at(15), 'No longer needed'],
      ['pending past expiry', async () => {}, at(14), 'No longer needed'],
    ];
    for (const [name, act, now, expected] of cases) {
      const f = await family(sql);
      const id = await enquire(sql, t, f, T0);
      await act(f, id);
      expect([name, await labelOf(t.id, id, now)]).toEqual([name, expected]);
    }
    // The parent's update notifications carry no label.
    const f = await family(sql);
    const id = await enquire(sql, t, f, T0);
    await answerEnquiry(sql, t.id, id, 'accept', '', BASE, at(1));
    const parentList = await listNotifications(sql, f.parent, { view: 'page' }, at(1));
    expect(parentList.items.map((i) => i.label)).toEqual([null]);
  });
});

describe('AC-31: link request received (teacher)', () => {
  it('AC-31: requested → Needs your reply; accepted / declined → Done; withdrawn / expired / past expiry → No longer needed', async () => {
    const t = await teacher(sql, T0, { listing: false });
    const cases: Array<[string, (f: Family, id: string) => Promise<unknown>, Date, ActionLabel]> = [
      ['requested', async () => {}, at(1), 'Needs your reply'],
      ['accepted', (_f, id) => acceptLinkRequest(sql, t.id, id, BASE, at(1)), at(1), 'Done'],
      ['declined', (_f, id) => declineLinkRequest(sql, t.id, id, { reason: 'no_time' }, BASE, at(1)), at(1), 'Done'],
      ['withdrawn', (f, id) => withdrawLinkRequest(sql, f.parent, id, at(1)), at(1), 'No longer needed'],
      ['expired', () => expireLinkRequests(sql, at(15), { teacherId: t.id }), at(15), 'No longer needed'],
      ['requested past expiry', async () => {}, at(14), 'No longer needed'],
    ];
    for (const [name, act, now, expected] of cases) {
      const f = await family(sql);
      const id = await requestLink(sql, t, f, T0);
      await act(f, id);
      expect([name, await labelOf(t.id, id, now)]).toEqual([name, expected]);
    }
  });

  it('AC-31: accepted, then the teacher–child link ended → still "Done" (the row itself is redacted, §8.1)', async () => {
    const t = await teacher(sql, T0, { listing: false });
    const f = await family(sql);
    const id = await requestLink(sql, t, f, T0);
    await acceptLinkRequest(sql, t.id, id, BASE, at(1));
    expect(await removeTeacher(sql, f.parent, t.id, at(2))).toEqual({ ok: true });
    const [n] = await notesFor(sql, id);
    expect(
      await actionLabel(
        sql,
        { id: t.id, role: 'teacher' },
        { ...n!, kind: 'action', entity_type: 'link_request' },
        at(2),
      ),
    ).toBe('Done');
    const item = (await listNotifications(sql, t.id, { view: 'page' }, at(2))).items.find((i) => i.id === n!.id)!;
    expect(item).toMatchObject({ redacted: true, label: null });
  });
});

describe('AC-31: rate proposal offers, for each side', () => {
  it("AC-31: the teacher's offer 1 — awaiting / accepted / declined / countered / withdrawn / expired / past expiry", async () => {
    const t = await teacher(sql, T0);
    const cases: Array<[string, (f: Family, id: string) => Promise<unknown>, Date, ActionLabel]> = [
      ['awaiting the teacher', async () => {}, at(1), 'Needs your reply'],
      [
        'teacher accepted',
        (_f, id) => answerRate(sql, 'teacher', t.id, id, 'accept', null, BASE, at(1)),
        at(1),
        'Done',
      ],
      [
        'teacher declined',
        (_f, id) => answerRate(sql, 'teacher', t.id, id, 'decline', null, BASE, at(1)),
        at(1),
        'Done',
      ],
      ['teacher countered', (_f, id) => counterRate(sql, 'teacher', t.id, id, counter, BASE, at(1)), at(1), 'Done'],
      ['withdrawn', (f, id) => withdrawRate(sql, f.parent, id, BASE, at(1)), at(1), 'No longer needed'],
      ['expired', () => expireRateNegotiations(sql, at(15), { teacherId: t.id }), at(15), 'No longer needed'],
      ['open past expiry', async () => {}, at(14), 'No longer needed'],
    ];
    for (const [name, act, now, expected] of cases) {
      const f = await family(sql);
      const id = await propose(sql, t, f, T0);
      await act(f, id);
      expect([name, await labelOf(t.id, id, now, 1)]).toEqual([name, expected]);
    }
  });

  it("AC-31: the parent's offer 2 — awaiting / accepted / declined / countered / withdrawn / expired / past expiry", async () => {
    const t = await teacher(sql, T0);
    const cases: Array<[string, (f: Family, id: string) => Promise<unknown>, Date, ActionLabel]> = [
      ['awaiting the parent', async () => {}, at(2), 'Needs your reply'],
      [
        'parent accepted',
        (f, id) => answerRate(sql, 'parent', f.parent, id, 'accept', null, BASE, at(2)),
        at(2),
        'Done',
      ],
      [
        'parent declined',
        (f, id) => answerRate(sql, 'parent', f.parent, id, 'decline', null, BASE, at(2)),
        at(2),
        'Done',
      ],
      ['parent countered', (f, id) => counterRate(sql, 'parent', f.parent, id, counter, BASE, at(2)), at(2), 'Done'],
      ['withdrawn', (f, id) => withdrawRate(sql, f.parent, id, BASE, at(2)), at(2), 'No longer needed'],
      ['expired', (f) => expireRateNegotiations(sql, at(16), { parentId: f.parent }), at(16), 'No longer needed'],
      ['open past expiry', async () => {}, at(15), 'No longer needed'],
    ];
    for (const [name, act, now, expected] of cases) {
      const f = await family(sql);
      const id = await propose(sql, t, f, T0);
      await counterRate(sql, 'teacher', t.id, id, counter, BASE, at(1));
      await act(f, id);
      expect([name, await labelOf(f.parent, id, now, 2)]).toEqual([name, expected]);
    }
  });

  it('AC-31: an earlier offer shows "Done" once a later offer exists, while the current one needs a reply', async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    const id = await propose(sql, t, f, T0);
    await counterRate(sql, 'teacher', t.id, id, counter, BASE, at(1));
    await counterRate(sql, 'parent', f.parent, id, counter, BASE, at(2));
    expect(await labelOf(t.id, id, at(3), 1)).toBe('Done');
    expect(await labelOf(t.id, id, at(3), 3)).toBe('Needs your reply');
  });
});

describe('AC-43: reading and resolving are independent', () => {
  it('AC-43: resolving an action does not mark its notification read; reading never changes the record', async () => {
    const t = await teacher(sql, T0);
    const f = await family(sql);
    const id = await enquire(sql, t, f, T0);
    const [before] = await sql`SELECT * FROM teacher_enquiries WHERE id = ${id}`;
    await markAllRead(sql, t.id, at(1));
    expect((await sql`SELECT * FROM teacher_enquiries WHERE id = ${id}`)[0]).toEqual(before);
    const g = await family(sql);
    const id2 = await enquire(sql, t, g, T0);
    await answerEnquiry(sql, t.id, id2, 'accept', '', BASE, at(1));
    const [n] = (await notesFor(sql, id2)).filter((r) => r.recipient_id === t.id);
    expect(n!.read_at).toBeNull();
  });
});

/**
 * The package cells need a real CR-15 conversion, which converts every eligible listing in the
 * shared test database; it is rolled back after this file (as tests/db/pricingMigration.test.ts does).
 */
describe('AC-31 / AC-17 / AC-54: learning package needing details (teacher)', () => {
  const WEEK = [
    { weekday: 1, start: 1020, end: 1080 },
    { weekday: 3, start: 1020, end: 1080 },
  ];
  const GOOD: PackageInput = {
    offer: true,
    currency: 'INR',
    priceMinor: 850000,
    classes: 22,
    perWeek: 2,
    minutes: 40,
    weeks: 11,
    times: [
      { weekday: 1, start: 1020 },
      { weekday: 3, start: 1020 },
    ],
    termsNote: '',
  };

  it('AC-17/AC-31/AC-54: conversion notifies the teacher once; the label and the banner follow the package, not the read status', async () => {
    const owner = await createAdult(sql, 'superadmin');
    const teachers: Teacher[] = [];
    for (let i = 0; i < 4; i += 1) {
      const t = await teacher(sql, T0);
      expect((await saveUsualTimes(sql, t.id, WEEK, T0)).ok).toBe(true);
      teachers.push(t);
    }
    expect((await applyPricingMigration(sql, owner, T0)).ok).toBe(true);
    // Running it again converts nothing more and notifies nobody again.
    await applyPricingMigration(sql, owner, T0);
    const pkg: string[] = [];
    for (const t of teachers) {
      const [p] = await sql<{ id: string }[]>`SELECT id FROM learning_packages WHERE teacher_id = ${t.id}`;
      pkg.push(p!.id);
      const rows = await notesFor(sql, p!.id);
      expect(rows.map((r) => [r.recipient_id, r.kind, r.type, r.href])).toEqual([
        [t.id, 'action', 'package_needs_details', '/teacher/listing'],
      ]);
    }
    await sql`INSERT INTO platform_settings (key, value) VALUES ('pricing_model_v2', 1)
              ON CONFLICT (key) DO UPDATE SET value = 1`;
    const [a, b, c, d] = teachers as [Teacher, Teacher, Teacher, Teacher];
    // AC-54: the banner shows while details are needed, read or not.
    expect(await packageNeedsDetails(sql, a.id)).toBe(true);
    expect(await labelOf(a.id, pkg[0]!, T0)).toBe('Needs your reply');
    expect(await packageNeedsDetails(sql, a.id)).toBe(true);
    expect(await savePackage(sql, b.id, GOOD, T0)).toEqual({ ok: true, status: 'offered' });
    expect(await labelOf(b.id, pkg[1]!, T0)).toBe('Done');
    expect(await packageNeedsDetails(sql, b.id)).toBe(false);
    expect(await withdrawPackage(sql, c.id, T0)).toEqual({ ok: true });
    expect(await labelOf(c.id, pkg[2]!, T0)).toBe('No longer needed');
    expect(await packageNeedsDetails(sql, c.id)).toBe(false);
    await sql`DELETE FROM platform_settings WHERE key = 'pricing_model_v2'`;
    expect(await labelOf(d.id, pkg[3]!, T0)).toBe('No longer needed');
  });
});
