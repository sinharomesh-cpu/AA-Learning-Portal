import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { snapshotKey } from '@/lib/listing';
import { getDirectoryTeacher } from '@/server/teacherDirectory';
import {
  answerEnquiry,
  connectForm,
  type EnquiryInput,
  listParentEnquiries,
  listTeacherEnquiries,
  rememberConnect,
  sendEnquiry,
  takeRememberedConnect,
  withdrawEnquiry,
} from '@/server/teacherEnquiries';
import { type ListingInput, previewListing, saveListing, setListingStatus } from '@/server/teacherListings';
import { saveUsualTimes } from '@/server/teacherUsualTimes';
import { createAdult, createChild, testDb, uniq } from './helpers';

/** PR-D4a: Connect with teacher and enquiries (boards D3, D4, D6, D11; OC-76, OC-77, OC-80). */
const sql = testDb();
const T0 = new Date('2026-10-17T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const after = (days: number) => new Date(T0.getTime() + days * DAY);
const BASE = 'http://aa.test';

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

async function teacherWithListing(subjects = ['maths', 'science'], status = 'active') {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone)
    VALUES ('teacher', 'active', ${`enq-${uniq()}@example.com`}, 'Teacher E. Sample', 'x', 'Asia/Kolkata')
    RETURNING id`;
  const id = row!.id;
  const owner = await createAdult(sql, 'superadmin');
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at,
                                  submitted_at, curricula, experience_years)
    VALUES (${id}, 'self_registered', 'approved', ${subjects}, ${[4, 5, 6]}, 'A short bio.', ${owner}, ${T0}, ${T0},
            ${['CBSE']}, ${5})`;
  await saveUsualTimes(
    sql,
    id,
    [
      { weekday: 1, start: 960, end: 1080 },
      { weekday: 6, start: 600, end: 720 },
    ],
    T0,
  );
  const input: ListingInput = {
    subjects,
    grades: [4, 5, 6],
    curricula: ['CBSE'],
    experienceYears: 5,
    prices: [{ model: 'monthly', currency: 'INR', amountMinor: 400000, sessions: 8, minutes: 40 }],
  };
  const snap = await previewListing(sql, id, input);
  const r = await saveListing(sql, id, { ...input, previewKey: snapshotKey(snap!) }, 'publish', true, T0);
  expect(r.ok).toBe(true);
  const [l] = await sql<Array<{ public_id: string }>>`SELECT public_id FROM teacher_listings WHERE teacher_id = ${id}`;
  if (status !== 'active') await sql`UPDATE accounts SET status = ${status} WHERE id = ${id}`;
  return { teacherId: id, publicId: l!.public_id };
}

async function parentWithChild(subjects = ['maths'], grade = 5) {
  const parentId = await createAdult(sql, 'parent');
  await sql`UPDATE accounts SET display_name = 'Priya Sample' WHERE id = ${parentId}`;
  const childId = await createChild(sql, parentId);
  await sql`UPDATE student_profiles SET subjects = ${subjects}, grade = ${grade}, curriculum = 'CBSE' WHERE account_id = ${childId}`;
  await sql`UPDATE accounts SET display_name = 'Kiran Sample' WHERE id = ${childId}`;
  return { parentId, childId };
}

const ask = (publicId: string, over: Partial<EnquiryInput> = {}): EnquiryInput => ({
  publicId,
  childId: null,
  grade: 5,
  curriculum: 'CBSE',
  subjects: ['maths'],
  times: [0],
  priceIndex: 0,
  message: 'Hello, looking for help with fractions.',
  ...over,
});

describe('remembering "Connect" across sign-up (D11)', () => {
  it('keeps the choice for 7 days, then forgets it; it is taken only once', async () => {
    const p = await createAdult(sql, 'parent');
    await rememberConnect(sql, p, 't-abcdefghij', T0);
    expect(await takeRememberedConnect(sql, p, after(6))).toBe('t-abcdefghij');
    expect(await takeRememberedConnect(sql, p, after(6))).toBeNull();
    await rememberConnect(sql, p, 't-abcdefghij', T0);
    expect(await takeRememberedConnect(sql, p, after(8))).toBeNull();
    await rememberConnect(sql, p, 'https://evil.example', T0);
    expect(await takeRememberedConnect(sql, p, T0)).toBeNull();
  });
});

describe('sending (E-1, E-6)', () => {
  it('a parent sends for their own child; the teacher sees no child name, id or data', async () => {
    const { teacherId, publicId } = await teacherWithListing();
    const { parentId, childId } = await parentWithChild(['maths', 'english']);
    const form = await connectForm(sql, parentId, publicId, T0);
    expect(form?.children).toEqual([
      { id: childId, name: 'Kiran Sample', grade: 5, curriculum: 'CBSE', subjects: ['maths'] },
    ]);
    const r = await sendEnquiry(sql, parentId, ask(publicId, { childId, grade: null, curriculum: null }), BASE, T0);
    expect(r.ok).toBe(true);
    const seen = await listTeacherEnquiries(sql, teacherId, T0);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      status: 'pending',
      parentFirstName: 'Priya',
      grade: 5,
      curriculum: 'CBSE',
      subjects: ['maths'],
      times: ['Mon 4:00–6:00 pm'],
      askingPrice: '₹4,000 a month · 8 sessions × 40 min',
    });
    const text = JSON.stringify(seen);
    expect(text).not.toContain('Kiran');
    expect(text).not.toContain(childId);
    expect(text).not.toContain(parentId);
    // Queued, not sent; the email to the teacher holds the parent's first name only.
    const [mail] = await sql<Array<{ payload: Record<string, string> }>>`
      SELECT o.payload FROM email_outbox o JOIN accounts a ON a.email = o.to_address
      WHERE a.id = ${teacherId} AND o.template = 'enquiry_received'`;
    expect(mail?.payload).toMatchObject({ parentFirstName: 'Priya', subjects: 'Maths', grade: 'Grade 5' });
    expect(JSON.stringify(mail)).not.toContain('Kiran');
  });

  it('refuses subjects the child does not study or the teacher does not list, and other families’ children', async () => {
    const { publicId } = await teacherWithListing(['maths']);
    const { parentId, childId } = await parentWithChild(['maths']);
    const other = await parentWithChild(['maths']);
    expect(await sendEnquiry(sql, parentId, ask(publicId, { subjects: ['science'] }), BASE, T0)).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['subjects'],
    });
    expect(await sendEnquiry(sql, parentId, ask(publicId, { childId: other.childId }), BASE, T0)).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['child'],
    });
    expect(
      await sendEnquiry(
        sql,
        parentId,
        ask(publicId, { childId, times: [5], priceIndex: 3, message: 'x'.repeat(501) }),
        BASE,
        T0,
      ),
    ).toEqual({ ok: false, reason: 'invalid', problems: ['times', 'price', 'message'] });
    expect(await sendEnquiry(sql, parentId, ask(publicId, { grade: 13, curriculum: 'Made up' }), BASE, T0)).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['grade', 'curriculum'],
    });
  });

  it('only active parents, and only to a listing that is public now', async () => {
    const { teacherId, publicId } = await teacherWithListing();
    const { parentId } = await parentWithChild();
    expect(await sendEnquiry(sql, teacherId, ask(publicId), BASE, T0)).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await sendEnquiry(sql, parentId, ask('t-0000000000'), BASE, T0)).toEqual({ ok: false, reason: 'gone' });
    await setListingStatus(sql, teacherId, 'pause', T0);
    expect(await sendEnquiry(sql, parentId, ask(publicId), BASE, T0)).toEqual({ ok: false, reason: 'gone' });
    const deactivated = await teacherWithListing(['maths'], 'deactivated');
    expect(await sendEnquiry(sql, parentId, ask(deactivated.publicId), BASE, T0)).toEqual({
      ok: false,
      reason: 'gone',
    });
    expect(await sendEnquiry(sql, parentId, ask(publicId), BASE, after(61))).toEqual({ ok: false, reason: 'gone' });
  });
});

describe('limits (E-2, E-3, E-5)', () => {
  it('one active enquiry per teacher and child; a fallback with the same grade and curriculum counts as the same', async () => {
    const { publicId } = await teacherWithListing();
    const { parentId, childId } = await parentWithChild();
    const first = await sendEnquiry(sql, parentId, ask(publicId, { childId }), BASE, T0);
    expect(first.ok).toBe(true);
    const again = await sendEnquiry(sql, parentId, ask(publicId, { childId }), BASE, T0);
    expect(again).toMatchObject({ ok: false, reason: 'duplicate' });
    // Same grade and curriculum without the child account: the same combination (OC-80 C-2).
    expect(await sendEnquiry(sql, parentId, ask(publicId), BASE, T0)).toMatchObject({ reason: 'duplicate' });
    // Another grade is a different child.
    expect((await sendEnquiry(sql, parentId, ask(publicId, { grade: 6 }), BASE, T0)).ok).toBe(true);
    // After withdrawing, a new one is allowed.
    if (!first.ok) throw new Error('first');
    expect(await withdrawEnquiry(sql, parentId, first.id, T0)).toEqual({ ok: true });
    expect((await sendEnquiry(sql, parentId, ask(publicId, { childId }), BASE, T0)).ok).toBe(true);
  });

  it('at most 5 waiting per parent and 10 new a day', async () => {
    const { parentId } = await parentWithChild();
    const listings = [];
    for (let i = 0; i < 6; i += 1) listings.push((await teacherWithListing(['maths'])).publicId);
    for (let i = 0; i < 5; i += 1)
      expect((await sendEnquiry(sql, parentId, ask(listings[i]!), BASE, T0)).ok).toBe(true);
    expect(await sendEnquiry(sql, parentId, ask(listings[5]!), BASE, T0)).toEqual({
      ok: false,
      reason: 'limit_pending',
    });

    const busy = await parentWithChild();
    for (let i = 0; i < 10; i += 1) {
      const pub = (await teacherWithListing(['maths'])).publicId;
      const r = await sendEnquiry(sql, busy.parentId, ask(pub), BASE, T0);
      expect(r.ok).toBe(true);
      if (r.ok) await withdrawEnquiry(sql, busy.parentId, r.id, T0);
    }
    const pub = (await teacherWithListing(['maths'])).publicId;
    expect(await sendEnquiry(sql, busy.parentId, ask(pub), BASE, T0)).toEqual({ ok: false, reason: 'limit_daily' });
    expect((await sendEnquiry(sql, busy.parentId, ask(pub), BASE, after(1.01))).ok).toBe(true);
  });
});

describe('answering, expiry and what each side sees (E-4, D4, D6)', () => {
  it('the teacher accepts with a note; the parent sees it with next steps; nothing is linked', async () => {
    const { teacherId, publicId } = await teacherWithListing();
    const { parentId, childId } = await parentWithChild();
    const r = await sendEnquiry(sql, parentId, ask(publicId, { childId }), BASE, T0);
    if (!r.ok) throw new Error('send');
    // Another teacher or the parent cannot answer it.
    const other = await teacherWithListing();
    expect(await answerEnquiry(sql, other.teacherId, r.id, 'accept', '', BASE, T0)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await answerEnquiry(sql, parentId, r.id, 'accept', '', BASE, T0)).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await answerEnquiry(sql, teacherId, r.id, 'accept', 'Happy to help. Mondays work best.', BASE, T0)).toEqual({
      ok: true,
    });
    expect(await answerEnquiry(sql, teacherId, r.id, 'decline', '', BASE, T0)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    const mine = await listParentEnquiries(sql, parentId, T0);
    expect(mine[0]).toMatchObject({
      status: 'accepted',
      teacherNote: 'Happy to help. Mondays work best.',
      childName: 'Kiran Sample',
      teacherId,
    });
    const links = await sql`SELECT 1 FROM teacher_student_links WHERE teacher_id = ${teacherId}`;
    expect(links).toHaveLength(0);
    // Accepting opens the existing "Add teacher" page even if the teacher hides from search.
    await sql`UPDATE teacher_profiles SET hidden_from_search = true WHERE account_id = ${teacherId}`;
    expect(await getDirectoryTeacher(sql, parentId, teacherId)).not.toBeNull();
    const stranger = await parentWithChild();
    expect(await getDirectoryTeacher(sql, stranger.parentId, teacherId)).toBeNull();
  });

  it('waiting enquiries expire after 14 days and can no longer be answered or withdrawn', async () => {
    const { teacherId, publicId } = await teacherWithListing();
    const { parentId } = await parentWithChild();
    const r = await sendEnquiry(sql, parentId, ask(publicId), BASE, T0);
    if (!r.ok) throw new Error('send');
    expect(await answerEnquiry(sql, teacherId, r.id, 'accept', '', BASE, after(14.01))).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await withdrawEnquiry(sql, parentId, r.id, after(14.01))).toEqual({ ok: false, reason: 'not_found' });
    expect((await listTeacherEnquiries(sql, teacherId, after(14.01)))[0]?.status).toBe('expired');
    // An expired enquiry no longer blocks a new one.
    expect((await sendEnquiry(sql, parentId, ask(publicId), BASE, after(14.02))).ok).toBe(true);
  });

  it('a deactivated teacher cannot answer', async () => {
    const { teacherId, publicId } = await teacherWithListing();
    const { parentId } = await parentWithChild();
    const r = await sendEnquiry(sql, parentId, ask(publicId), BASE, T0);
    if (!r.ok) throw new Error('send');
    await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${teacherId}`;
    expect(await answerEnquiry(sql, teacherId, r.id, 'accept', '', BASE, T0)).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  it('the database refuses an enquiry about another family’s child', async () => {
    const { teacherId } = await teacherWithListing();
    const { parentId } = await parentWithChild();
    const other = await parentWithChild();
    await expect(
      sql`INSERT INTO teacher_enquiries (parent_id, teacher_id, child_id, stated_grade, subjects, expires_at)
          VALUES (${parentId}, ${teacherId}, ${other.childId}, 5, ${['maths']}, now())`,
    ).rejects.toThrow(/not the parent's own/);
  });
});
