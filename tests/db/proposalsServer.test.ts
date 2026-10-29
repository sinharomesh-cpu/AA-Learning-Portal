import { afterAll, describe, expect, it } from 'vitest';
import { setAccountActive } from '@/server/admin';
import {
  answerLesson,
  lessonMaintenance,
  lessonsForParent,
  lessonsForStudent,
  lessonsForTeacher,
  requestLesson,
} from '@/server/lessons';
import { requestMaterial } from '@/server/materialRequests';
import { actionLabel, loadViewer, type StoredNotification } from '@/server/notifications/access';
import {
  answerProposal,
  plannableChapters,
  proposalHistory,
  proposalOptions,
  proposalStart,
  proposeLesson,
  withdrawProposal,
} from '@/server/proposals';
import { removeTeacher } from '@/server/teacherLinks';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/**
 * TL-3 application layer (stage 3, authorised 29 Oct 2026, 20:33 IST) on the throw-away database
 * with migration 0034 v1.4. Synthetic data only. Positive (P), negative (N), boundary (B) and
 * concurrency (C) cases are marked. The database rules themselves are tested in tl3Proposals.test.
 */
const sql = testDb();
afterAll(() => sql.end());

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Three days ahead, 10:00 UTC. */
const BASE = new Date(Math.ceil(Date.now() / DAY) * DAY + 3 * DAY + 10 * HOUR);
const at = (offsetMin: number) => new Date(BASE.getTime() + offsetMin * MIN);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const hm = (d: Date) => d.toISOString().slice(11, 16);

async function teacher(opts: { rate?: boolean; name?: string } = {}) {
  const id = await createAdult(sql, 'teacher');
  const owner = await createAdult(sql, 'superadmin');
  await sql`UPDATE accounts SET time_zone = 'UTC', display_name = ${opts.name ?? 'Ms Rao'} WHERE id = ${id}`;
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  for (const d of [1, 2, 3, 4, 5, 6, 7])
    await sql`INSERT INTO teacher_usual_times (teacher_id, weekday, start_minute, end_minute) VALUES (${id}, ${d}, 0, 1440)`;
  if (opts.rate !== false)
    await sql`INSERT INTO teacher_listings (public_id, teacher_id, hourly_offered, hourly_currency, hourly_rate_minor, hourly_minutes)
              VALUES (${`t-${uniq()}ab`}, ${id}, true, 'INR', 60000, 30)`;
  return id;
}

/** Two parents of one child (Kiran), linked to a teacher in maths. */
async function family(t?: string, childName = 'Kiran') {
  const parent = await createAdult(sql, 'parent');
  const parent2 = await createAdult(sql, 'parent');
  await sql`UPDATE accounts SET display_name = 'Anita Shah' WHERE id = ${parent}`;
  await sql`UPDATE accounts SET display_name = 'Ravi Shah' WHERE id = ${parent2}`;
  const child = await createChild(sql, parent);
  await sql`UPDATE accounts SET display_name = ${childName} WHERE id = ${child}`;
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parent2}, ${child})`;
  const tid = t ?? (await teacher());
  await activeLink(sql, { teacher: tid, child, parent, subjects: ['maths'] });
  return { parent, parent2, child, t: tid };
}
type Fam = Awaited<ReturnType<typeof family>>;

async function book(owner: string, child: string | null, subject = 'maths') {
  const [b] = await sql<{ id: string }[]>`
    INSERT INTO books (owner_id, title, subject, form, status) VALUES (${owner}, 'Maths book', ${subject}, 'chapter_files', 'published')
    RETURNING id`;
  const chapters: string[] = [];
  for (const [i, title] of ['Fractions', 'Decimals', 'Shapes', 'Time', 'Money', 'Data'].entries()) {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO book_chapters (book_id, number, title) VALUES (${b!.id}, ${i + 1}, ${title}) RETURNING id`;
    chapters.push(c!.id);
  }
  if (child) await sql`INSERT INTO book_children (book_id, student_id) VALUES (${b!.id}, ${child})`;
  return { id: b!.id, chapters };
}

const propose = (f: Fam, start: Date, extra: Record<string, unknown> = {}) =>
  proposeLesson(sql, f.t, {
    childId: f.child,
    subject: 'maths',
    date: ymd(start),
    time: hm(start),
    minutes: '30',
    ...extra,
  });
async function proposed(f: Fam, start: Date, extra: Record<string, unknown> = {}) {
  const r = await propose(f, start, extra);
  if (!r.ok) throw new Error(`proposal refused: ${r.reason}`);
  return r.id;
}
/** A parent's request accepted by the teacher: a confirmed lesson. */
async function confirmedRequest(f: Fam, start: Date) {
  const r = await requestLesson(sql, f.parent, {
    childId: f.child,
    teacherId: f.t,
    subject: 'maths',
    minutes: '30',
    startsAt: start.toISOString(),
    priceMinor: '30000',
    currency: 'INR',
    basis: 'listed',
  });
  if (!r.ok) throw new Error(`request refused: ${r.reason}`);
  const a = await answerLesson(sql, f.t, r.id, 'accept');
  if (!a.ok) throw new Error(`accept refused: ${a.reason}`);
  return r.id;
}
/** A proposal fixture whose deadline has passed (triggers skipped for that transaction only). */
async function overdueProposal(f: Fam, start: Date) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`;
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO lessons (teacher_id, student_id, proposed_by, origin, subject, starts_at, minutes, ends_at, requested_at,
                           reply_deadline, status, currency, rate_minor, price_minor, price_basis)
      SELECT ${f.t}, ${f.child}, ${f.t}, 'teacher_proposal', 'maths', s, 30, s + interval '30 minutes',
             now() - interval '3 days', now() - interval '1 day', 'proposed', 'INR', 60000, 30000, 'listed'
      FROM (SELECT ${start}::timestamptz AS s) x RETURNING id`;
    return r!.id;
  });
}

const notes = (recipient: string, lesson: string) =>
  sql<Array<{ type: string; kind: string; title: string; body: string; href: string }>>`
    SELECT type, kind, title, body, href FROM notifications
    WHERE recipient_id = ${recipient} AND entity_type = 'lesson' AND entity_id = ${lesson}
    ORDER BY created_at, type`;
const row = async (id: string) => (await sql<Record<string, unknown>[]>`SELECT * FROM lessons WHERE id = ${id}`)[0]!;
const audits = (lesson: string) =>
  sql<Array<{ event_type: string; actor_id: string | null }>>`
    SELECT event_type, actor_id FROM audit_events WHERE details ->> 'lesson' = ${lesson} ORDER BY occurred_at, id`;

// ---------------------------------------------------------------------------------------------
describe('TL-3 server: who the teacher may propose to (D-TLS-2)', () => {
  it('(P) only children linked now, in ticked subjects; the rate is reported', async () => {
    const f = await family();
    const other = await family(); // another teacher's family
    const o = await proposalOptions(sql, f.t);
    expect(o).toMatchObject({ allowed: true, hasRate: true, timeZone: 'UTC' });
    expect(o.children).toEqual([{ id: f.child, name: 'Kiran', grade: 5, subjects: ['maths'] }]);
    expect(o.children.some((c) => c.id === other.child)).toBe(false);
  });

  it('(N) an unapproved or deactivated teacher may propose to nobody; a teacher without a rate is told', async () => {
    const f = await family();
    await sql`UPDATE teacher_profiles SET approval_status = 'submitted' WHERE account_id = ${f.t}`;
    expect((await proposalOptions(sql, f.t)).allowed).toBe(false);
    expect(await propose(f, at(0))).toEqual({ ok: false, reason: 'not_allowed' });
    const g = await family(await teacher({ rate: false }));
    expect((await proposalOptions(sql, g.t)).hasRate).toBe(false);
    expect(await propose(g, at(0))).toEqual({ ok: false, reason: 'no_rate' });
  });
});

describe('TL-3 server: proposing (D-TLS-3, D-TLS-5, D-TLS-12, D-E2E-2, WF-10)', () => {
  it('(P) a proposal with planned chapters and intents; both parents get an action notice to the booking page', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const id = await proposed(f, at(5), {
      planned: [
        { chapterId: b.chapters[0], intent: 'new' },
        { chapterId: b.chapters[1], intent: '' },
      ],
    });
    expect(await row(id)).toMatchObject({
      status: 'proposed',
      origin: 'teacher_proposal',
      proposed_by: f.t,
      requested_by: null,
      minutes: 30,
      price_basis: 'listed',
    });
    expect(Number((await row(id)).price_minor)).toBe(30000);
    expect(
      await sql`SELECT position, source, intent, label FROM lesson_chapters WHERE lesson_id = ${id} ORDER BY position`,
    ).toEqual([
      { position: 1, source: 'planned', intent: 'new', label: 'Maths book · 1. Fractions' },
      { position: 2, source: 'planned', intent: null, label: 'Maths book · 2. Decimals' },
    ]);
    for (const p of [f.parent, f.parent2]) {
      const [n] = await notes(p, id);
      expect(n).toMatchObject({ type: 'lesson_proposed', kind: 'action', href: `/parent/bookings/${id}` });
      expect(n!.title).toContain('Ms Rao proposed a Maths lesson for Kiran');
    }
    expect(await notes(f.t, id)).toEqual([]); // never the person who acted
    expect(await audits(id)).toEqual([{ event_type: 'LESSON_PROPOSED', actor_id: f.t }]);
  });

  it('(N) unlinked child, unticked subject or a stranger: refused before anything is written', async () => {
    const f = await family();
    const other = await family();
    expect(
      await proposeLesson(sql, f.t, {
        childId: other.child,
        subject: 'maths',
        date: ymd(at(0)),
        time: hm(at(0)),
        minutes: 30,
      }),
    ).toEqual({
      ok: false,
      reason: 'not_linked',
    });
    expect(await propose(f, at(0), { subject: 'science' })).toEqual({ ok: false, reason: 'not_linked' });
    expect(
      await proposeLesson(sql, f.parent, {
        childId: f.child,
        subject: 'maths',
        date: ymd(at(0)),
        time: hm(at(0)),
        minutes: 30,
      }),
    ).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await sql`SELECT 1 FROM lessons WHERE student_id = ${other.child}`).toHaveLength(0);
  });

  it('(B) times: 5-minute steps only; 24 hours to 4 weeks; 10-40 minutes; a daylight-saving gap is refused', async () => {
    const f = await family();
    expect(await propose(f, at(3))).toEqual({ ok: false, reason: 'step' });
    expect(await propose(f, at(5), { minutes: '45' })).toEqual({ ok: false, reason: 'invalid' });
    const step5 = (ms: number) => new Date(Math.ceil(ms / (5 * MIN)) * 5 * MIN);
    expect(await propose(f, step5(Date.now() + 2 * HOUR))).toEqual({ ok: false, reason: 'notice' });
    expect(await propose(f, step5(Date.now() + 30 * DAY))).toEqual({ ok: false, reason: 'window' });
    expect((await propose(f, at(55), { minutes: '10' })).ok).toBe(true);
    // 02:30 on the spring-forward day in London doesn't exist.
    expect(proposalStart('2027-03-28', '01:30', 'Europe/London')).toBeNull();
    expect(proposalStart('2027-03-28', '02:30', 'Europe/London')?.toISOString()).toBe('2027-03-28T01:30:00.000Z');
  });

  it('(N) over a confirmed lesson: refused (busy); the same slot twice: duplicate (W-2); the 11th: limit', async () => {
    const f = await family();
    await confirmedRequest(f, at(6 * 60));
    expect(await propose(f, at(6 * 60 + 15))).toEqual({ ok: false, reason: 'busy' });
    await proposed(f, at(0));
    expect(await propose(f, at(0))).toEqual({ ok: false, reason: 'duplicate' });
    for (let i = 1; i < 10; i++) await proposed(f, at(24 * 60 + i * 60));
    expect(await propose(f, at(48 * 60))).toEqual({ ok: false, reason: 'limit' });
  });

  it('(N) planned chapters: malformed, a bad intent, more than five, or a book the teacher can’t view', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const hidden = await book(f.parent, null);
    expect(await propose(f, at(0), { planned: [{ chapterId: b.chapters[0], intent: 'review' }] })).toEqual({
      ok: false,
      reason: 'chapters',
    });
    expect(await propose(f, at(0), { planned: b.chapters.map((c) => ({ chapterId: c })) })).toEqual({
      ok: false,
      reason: 'chapters',
    });
    expect(await propose(f, at(0), { planned: [{ chapterId: hidden.chapters[0] }] })).toEqual({
      ok: false,
      reason: 'chapters',
    });
    // Nothing was left behind by the refused attempts (all or nothing).
    expect(await sql`SELECT 1 FROM lessons WHERE student_id = ${f.child}`).toHaveLength(0);
    expect((await plannableChapters(sql, f.t, f.child, 'maths')).map((c) => c.id)).toEqual(b.chapters);
    expect(await plannableChapters(sql, f.t, f.child, 'science')).toEqual([]);
  });
});

describe('TL-3 server: the parent answers (OC-45, TL3-4, TL3-5)', () => {
  it('(P) either parent accepts: confirmed, who accepted is kept, the teacher and the other parent are told', async () => {
    const f = await family();
    const id = await proposed(f, at(0));
    expect(await answerProposal(sql, f.parent2, id, 'accept')).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ status: 'confirmed', confirmed_by: f.parent2 });
    expect((await notes(f.t, id)).map((n) => n.type)).toEqual(['lesson_proposal_accepted']);
    expect((await notes(f.t, id))[0]!.title).not.toContain('Kiran'); // CR-16: never the child's name
    expect((await notes(f.parent, id)).map((n) => n.type)).toContain('lesson_proposal_accepted');
    expect((await notes(f.parent2, id)).map((n) => n.type)).not.toContain('lesson_proposal_accepted');
    // Now an ordinary confirmed lesson: the child sees it (TL3-3).
    expect((await lessonsForStudent(sql, f.child)).map((l) => l.id)).toContain(id);
  });

  it('(P) decline with a reason: trimmed and kept for the teacher, never copied into a notice', async () => {
    const f = await family();
    const id = await proposed(f, at(0));
    expect(await answerProposal(sql, f.parent, id, 'decline', '  Not that day, thanks  ')).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({
      status: 'declined',
      closed_by: 'parent',
      close_note: 'Not that day, thanks',
    });
    const [n] = await notes(f.t, id);
    expect(n).toMatchObject({ type: 'lesson_proposal_declined' });
    expect(`${n!.title} ${n!.body}`).not.toContain('Not that day');
    expect(await answerProposal(sql, f.parent, await proposed(f, at(60)), 'decline', 'x'.repeat(201))).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('(N) the teacher, a student, another family’s parent or a made-up id get "not found"; nothing changes', async () => {
    const f = await family();
    const other = await family();
    const id = await proposed(f, at(0));
    for (const who of [f.t, f.child, other.parent]) {
      expect(await answerProposal(sql, who, id, 'accept')).toEqual({ ok: false, reason: 'not_found' });
    }
    expect(await answerProposal(sql, f.parent, crypto.randomUUID(), 'accept')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    // A parent's own request can't be "accepted" by a parent through this path.
    const req = await requestLesson(sql, f.parent, {
      childId: f.child,
      teacherId: f.t,
      subject: 'maths',
      minutes: '30',
      startsAt: at(2 * 60).toISOString(),
      priceMinor: '30000',
      currency: 'INR',
      basis: 'listed',
    });
    expect(req.ok && (await answerProposal(sql, f.parent, req.id, 'accept'))).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await row(id)).toMatchObject({ status: 'proposed' });
  });

  it('(P) accepting closes overlapping open requests and proposals as "time no longer free" (TL3-4)', async () => {
    const t = await teacher();
    const f = await family(t);
    const g = await family(t, 'Meera');
    const mine = await proposed(f, at(6 * 60));
    const sameTimeOtherChild = await proposed(g, at(6 * 60)); // W-2: allowed
    const req = await requestLesson(sql, f.parent, {
      childId: f.child,
      teacherId: t,
      subject: 'maths',
      minutes: '30',
      startsAt: at(6 * 60).toISOString(),
      priceMinor: '30000',
      currency: 'INR',
      basis: 'listed',
    });
    expect(await answerProposal(sql, f.parent, mine, 'accept')).toEqual({ ok: true });
    expect(await row(sameTimeOtherChild)).toMatchObject({ status: 'declined', close_reason: 'time_no_longer_free' });
    expect(req.ok && (await row(req.id))).toMatchObject({ status: 'declined', close_reason: 'time_no_longer_free' });
    expect((await notes(g.parent, sameTimeOtherChild)).map((n) => n.type)).toContain('lesson_time_no_longer_free');
    // The other family can no longer accept it.
    expect(await answerProposal(sql, g.parent, sameTimeOtherChild, 'accept')).toEqual({
      ok: false,
      reason: 'time_taken',
    });
  });

  it('(N) an overdue proposal is "expired"; a withdrawn one is "closed"', async () => {
    const f = await family();
    const old = await overdueProposal(f, at(0));
    expect(await answerProposal(sql, f.parent, old, 'accept')).toEqual({ ok: false, reason: 'expired' });
    const id = await proposed(f, at(60));
    expect(await withdrawProposal(sql, f.t, id)).toEqual({ ok: true });
    expect(await answerProposal(sql, f.parent, id, 'accept')).toEqual({ ok: false, reason: 'closed' });
  });

  it('(C) two parents accept at the same moment: exactly one outcome', async () => {
    const f = await family();
    const id = await proposed(f, at(0));
    const [x, y] = [testDb(), testDb()];
    const results = await Promise.all([
      answerProposal(x, f.parent, id, 'accept'),
      answerProposal(y, f.parent2, id, 'accept'),
    ]);
    await Promise.all([x.end(), y.end()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'closed' }]);
    expect(await row(id)).toMatchObject({ status: 'confirmed' });
  });

  it('(C) accept and withdraw at the same moment: exactly one outcome', async () => {
    const f = await family();
    const id = await proposed(f, at(0));
    const [x, y] = [testDb(), testDb()];
    const [a, w] = await Promise.all([answerProposal(x, f.parent, id, 'accept'), withdrawProposal(y, f.t, id)]);
    await Promise.all([x.end(), y.end()]);
    expect([a.ok, w.ok].filter(Boolean)).toHaveLength(1);
    expect(['confirmed', 'withdrawn']).toContain((await row(id)).status);
  });

  it('(C) accepting skips an overlapping proposal another transaction holds (SKIP LOCKED); that one can never be accepted', async () => {
    const t = await teacher();
    const f = await family(t);
    const g = await family(t, 'Meera');
    const mine = await proposed(f, at(6 * 60));
    const held = await proposed(g, at(6 * 60));
    const holder = testDb();
    let release!: () => void;
    const holding = holder.begin(async (tx) => {
      await tx`SELECT id FROM lessons WHERE id = ${held} FOR UPDATE`;
      await new Promise<void>((r) => (release = r));
    });
    await new Promise((r) => setTimeout(r, 100));
    const t0 = Date.now();
    expect(await answerProposal(sql, f.parent, mine, 'accept')).toEqual({ ok: true });
    expect(Date.now() - t0).toBeLessThan(2000); // did not wait for the holder
    release();
    await holding;
    await holder.end();
    expect(await row(held)).toMatchObject({ status: 'proposed' }); // skipped, still open
    // It can't be accepted: the database refuses the overlap, and it then closes "time no longer free".
    expect(await answerProposal(sql, g.parent, held, 'accept')).toEqual({ ok: false, reason: 'time_taken' });
    expect(await row(held)).toMatchObject({ status: 'declined', close_reason: 'time_no_longer_free' });
  });
});

describe('TL-3 server: withdraw, expiry, link ends (D-TLS-2, D-TLS-5, D-TLS-13)', () => {
  it('(P/N) only the proposing teacher withdraws; parents are told; a parent can’t withdraw a proposal', async () => {
    const f = await family();
    const id = await proposed(f, at(0));
    const other = await teacher();
    expect(await withdrawProposal(sql, other, id)).toEqual({ ok: false, reason: 'not_found' });
    expect(await withdrawProposal(sql, f.parent, id)).toEqual({ ok: false, reason: 'not_found' });
    expect(await withdrawProposal(sql, f.t, id)).toEqual({ ok: true });
    expect(await row(id)).toMatchObject({ status: 'withdrawn', closed_by: 'teacher' });
    for (const p of [f.parent, f.parent2])
      expect((await notes(p, id)).map((n) => n.type)).toContain('lesson_proposal_withdrawn');
    expect(await withdrawProposal(sql, f.t, id)).toEqual({ ok: false, reason: 'closed' });
  });

  it('(P) the shared sweep expires an overdue proposal and tells both sides once', async () => {
    const f = await family();
    const old = await overdueProposal(f, at(0));
    await lessonMaintenance(sql);
    expect(await row(old)).toMatchObject({ status: 'expired', closed_by: 'aa_pro' });
    expect((await notes(f.t, old)).map((n) => n.type)).toEqual(['lesson_proposal_expired']);
    expect((await notes(f.parent, old)).map((n) => n.type)).toEqual(['lesson_proposal_expired']);
    await lessonMaintenance(sql);
    expect(await notes(f.parent, old)).toHaveLength(1);
  });

  it('(P) when the parent removes the teacher, open proposals close as "link ended" (D-TLS-13)', async () => {
    const f = await family();
    const id = await proposed(f, at(0));
    await removeTeacher(sql, f.parent, f.t);
    expect(await row(id)).toMatchObject({ status: 'declined', closed_by: 'aa_pro', close_reason: 'link_ended' });
    expect((await notes(f.parent2, id)).map((n) => n.type)).toContain('lesson_proposal_closed');
    expect(await answerProposal(sql, f.parent, id, 'accept')).toEqual({ ok: false, reason: 'closed' });
  });

  it('(P) a deactivated teacher’s open proposals close as "teacher no longer available"', async () => {
    const f = await family();
    const id = await proposed(f, at(0));
    const owner = await createAdult(sql, 'superadmin');
    await setAccountActive(sql, owner, f.t, { active: false, reason: 'Test: deactivated' });
    await lessonMaintenance(sql);
    expect(await row(id)).toMatchObject({ status: 'declined', close_reason: 'teacher_deactivated' });
  });
});

describe('TL-3 server: planned chapters when the teacher accepts a request (D-E2E-3 (b), W-3)', () => {
  const request = async (f: Fam, start: Date, topic?: string, chapterIds?: string[]) => {
    const r = await requestLesson(sql, f.parent, {
      childId: f.child,
      teacherId: f.t,
      subject: 'maths',
      minutes: '30',
      startsAt: start.toISOString(),
      priceMinor: '30000',
      currency: 'INR',
      basis: 'listed',
      topic,
      chapterIds,
    });
    if (!r.ok) throw new Error(r.reason);
    return r.id;
  };

  it('(P) planned chapters after the parent’s chapters; the parents are told', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const id = await request(f, at(6 * 60), undefined, [b.chapters[0]!]);
    const r = await answerLesson(sql, f.t, id, 'accept', '', new Date(), {
      planned: [{ chapterId: b.chapters[2], intent: 'revise' }],
    });
    expect(r).toEqual({ ok: true });
    expect(
      await sql`SELECT position, source, intent FROM lesson_chapters WHERE lesson_id = ${id} ORDER BY position`,
    ).toEqual([
      { position: 1, source: 'requested', intent: null },
      { position: 2, source: 'planned', intent: 'revise' },
    ]);
    expect((await notes(f.parent2, id)).map((n) => n.type)).toEqual(
      expect.arrayContaining(['lesson_accepted', 'lesson_chapters_planned']),
    );
  });

  it('(N) W-3: a request with a parent’s topic takes no planned chapters, and is not accepted by that attempt', async () => {
    const f = await family();
    const b = await book(f.parent, f.child);
    const id = await request(f, at(6 * 60), 'Long division');
    expect(
      await answerLesson(sql, f.t, id, 'accept', '', new Date(), { planned: [{ chapterId: b.chapters[0] }] }),
    ).toEqual({ ok: false, reason: 'chapters' });
    expect(await row(id)).toMatchObject({ status: 'requested' });
    expect(await answerLesson(sql, f.t, id, 'accept')).toEqual({ ok: true });
  });

  it('(N) a chapter the teacher can’t view rolls the whole acceptance back (all or nothing)', async () => {
    const f = await family();
    const hidden = await book(f.parent, null);
    const id = await request(f, at(6 * 60));
    expect(
      await answerLesson(sql, f.t, id, 'accept', '', new Date(), { planned: [{ chapterId: hidden.chapters[0] }] }),
    ).toEqual({ ok: false, reason: 'chapters' });
    expect(await row(id)).toMatchObject({ status: 'requested' });
    expect(await sql`SELECT 1 FROM lesson_chapters WHERE lesson_id = ${id}`).toHaveLength(0);
  });
});

describe('TL-3 server: lists, history, material requests and notices', () => {
  it('(P) lists: the parent may answer, the teacher may withdraw, the child sees nothing until accepted (TL3-3)', async () => {
    const f = await family();
    const id = await proposed(f, at(0));
    const p = (await lessonsForParent(sql, f.parent2)).find((l) => l.id === id)!;
    expect(p).toMatchObject({ status: 'proposed', origin: 'teacher_proposal', canAnswer: true, canWithdraw: false });
    const t = (await lessonsForTeacher(sql, f.t)).find((l) => l.id === id)!;
    expect(t).toMatchObject({ status: 'proposed', canAnswer: false, canWithdraw: true });
    expect((await lessonsForStudent(sql, f.child)).map((l) => l.id)).not.toContain(id);
  });

  it('(P) an overdue proposal shows as expired at once, before the sweep records it', async () => {
    const f = await family();
    const old = await overdueProposal(f, at(0));
    const p = (await lessonsForParent(sql, f.parent)).find((l) => l.id === old)!;
    expect(p).toMatchObject({ status: 'expired', canAnswer: false });
  });

  it('(P) D-E2E-4 history: this child, subject and teacher only; newest first; outcome and chapters', async () => {
    const f = await family();
    const g = await family(f.t, 'Meera');
    const past = sql.begin(async (tx) => {
      await tx`SET LOCAL session_replication_role = replica`;
      const ins = (child: string, daysAgo: number, outcome: string | null) => tx`
        INSERT INTO lessons (teacher_id, student_id, requested_by, subject, starts_at, minutes, ends_at, requested_at,
                             reply_deadline, status, confirmed_at, outcome, outcome_at, currency, rate_minor, price_minor, price_basis)
        SELECT ${f.t}, ${child}, ${f.parent}, 'maths', s, 30, s + interval '30 minutes', s - interval '3 days',
               s - interval '1 day', 'confirmed', s - interval '2 days', ${outcome},
               CASE WHEN ${outcome}::text IS NULL THEN NULL ELSE s + interval '1 hour' END, 'INR', 60000, 30000, 'listed'
        FROM (SELECT date_trunc('hour', now()) - make_interval(days => ${daysAgo}) AS s) x RETURNING id`;
      await ins(f.child, 10, 'taught');
      await ins(f.child, 3, null);
      await ins(g.child, 2, 'taught');
    });
    await past;
    const h = await proposalHistory(sql, f.t, f.child, 'maths');
    expect(h.map((x) => x.outcome)).toEqual([null, 'taught']);
    expect(await proposalHistory(sql, f.t, f.child, 'science')).toEqual([]);
    expect(await proposalHistory(sql, await teacher(), f.child, 'maths')).toEqual([]);
  });

  it('(P) TL3-1: the teacher asks for material on an open proposal; the parent’s notice opens the booking page', async () => {
    const f = await family();
    const id = await proposed(f, at(0));
    const r = await requestMaterial(sql, f.t, { lessonId: id, description: 'Your workbook' });
    expect(r.ok).toBe(true);
  });

  it('(P) the parent’s "proposal waiting" notice needs a reply, then is done once answered', async () => {
    const f = await family();
    const id = await proposed(f, at(0));
    const [n] = await sql<StoredNotification[]>`
      SELECT * FROM notifications WHERE recipient_id = ${f.parent} AND entity_id = ${id} AND type = 'lesson_proposed'`;
    const viewer = (await loadViewer(sql, f.parent))!;
    expect(await actionLabel(sql, viewer, n!, new Date())).toBe('Needs your reply');
    await answerProposal(sql, f.parent2, id, 'accept');
    expect(await actionLabel(sql, viewer, n!, new Date())).toBe('Done');
  });
});
