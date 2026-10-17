import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ListingPrice, snapshotKey } from '@/lib/listing';
import { createAdmin, decideProfileChange } from '@/server/admin';
import {
  getOwnListing,
  type ListingInput,
  previewListing,
  queueListingReminders,
  renewListing,
  saveListing,
  setListingStatus,
} from '@/server/teacherListings';
import { saveTeacherProfile } from '@/server/teacherProfile';
import { saveUsualTimes } from '@/server/teacherUsualTimes';
import { createAdult, testDb, uniq } from './helpers';

/** PR-D2: "Looking for students" listings (board D5; OC-77, OC-79 C, OC-80, OC-85). */
const sql = testDb();
const T0 = new Date('2026-10-17T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const after = (days: number) => new Date(T0.getTime() + days * DAY);
const BASE = 'http://aa.test';

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

async function teacher(approval: 'approved' | 'submitted' | 'rejected' = 'approved', status = 'active') {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone)
    VALUES ('teacher', ${status}, ${`listing-${uniq()}@example.com`}, 'Teacher L. Sample', 'x', 'Asia/Kolkata')
    RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  const decided = approval !== 'submitted';
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at,
                                  submitted_at, curricula, experience_years)
    VALUES (${row!.id}, 'self_registered', ${approval}, ${['maths', 'science']}, ${[4, 5, 6]},
            'Teaches maths and science to primary classes.', ${decided ? owner : null}, ${decided ? T0 : null}, ${T0},
            ${['CBSE']}, ${8})`;
  return row!.id;
}

const HOURLY: ListingPrice = { model: 'hourly', currency: 'INR', amountMinor: 60000, sessions: null, minutes: 40 };
const MONTHLY: ListingPrice = { model: 'monthly', currency: 'INR', amountMinor: 400000, sessions: 8, minutes: 40 };
const input = (over: Partial<ListingInput> = {}): ListingInput => ({
  subjects: ['maths', 'science'],
  grades: [4, 5],
  curricula: ['CBSE', 'ICSE'],
  experienceYears: 8,
  prices: [HOURLY, MONTHLY],
  ...over,
});

/**
 * saveListing as the editor sends it: publishing carries the key of the preview the teacher saw.
 * The preview is built from the curricula and experience being saved, like the browser does.
 */
async function save(
  id: string,
  inp: ListingInput,
  intent: 'draft' | 'publish',
  consent: boolean,
  now: Date,
  previewKey?: string,
) {
  let key = previewKey;
  if (key === undefined && intent === 'publish') {
    const snap = await previewListing(sql, id, inp);
    key = snap
      ? snapshotKey({
          ...snap,
          curricula: ['CBSE', 'ICSE', 'State board', 'IB', 'Cambridge (IGCSE)', 'Other'].filter((c) =>
            inp.curricula.includes(c),
          ),
          experienceYears: inp.experienceYears,
        })
      : '';
  }
  return saveListing(sql, id, { ...inp, previewKey: key }, intent, consent, now);
}

async function listingRow(teacherId: string) {
  const [r] = await sql<Array<{ status: string; published: Record<string, unknown> | null; expires_at: Date | null }>>`
    SELECT status, published, expires_at FROM teacher_listings WHERE teacher_id = ${teacherId}`;
  return r;
}

async function auditTypes(subjectId: string) {
  const r = await sql<{ event_type: string }[]>`
    SELECT event_type FROM audit_events WHERE subject_id = ${subjectId} ORDER BY occurred_at, id`;
  return r.map((x) => x.event_type);
}

describe('who can list (L-1)', () => {
  it('waiting, rejected and deactivated teachers, parents and unknown ids cannot', async () => {
    for (const id of [
      await teacher('submitted', 'pending_approval'),
      await teacher('rejected', 'pending_approval'),
      await teacher('approved', 'deactivated'),
      await createAdult(sql, 'parent'),
      'not-an-id',
    ]) {
      expect(await getOwnListing(sql, id, T0)).toBeNull();
      expect(await save(id, input(), 'publish', true, T0)).toEqual({ ok: false, reason: 'not_allowed' });
    }
  });

  it('only approved subjects and grades; the database refuses them too', async () => {
    const id = await teacher();
    expect(await save(id, input({ subjects: ['maths', 'english'], grades: [5, 7] }), 'draft', false, T0)).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['subjects', 'grades'],
    });
    await save(id, input(), 'draft', false, T0);
    await expect(
      sql`UPDATE teacher_listings SET subjects = ${['maths', 'english']} WHERE teacher_id = ${id}`,
    ).rejects.toThrow(/outside the approved profile/);
  });
});

describe('publishing shows exactly what the teacher agreed to (OC-77(1), OC-80 C-6)', () => {
  it('a draft is private; publishing needs agreement and shows the preview for 60 days', async () => {
    const id = await teacher();
    await saveUsualTimes(sql, id, [{ weekday: 1, start: 960, end: 1080 }], T0);
    expect(await save(id, input(), 'draft', false, T0)).toEqual({ ok: true, outcome: 'draft_saved' });
    expect((await getOwnListing(sql, id, T0))?.status).toBe('draft');
    expect(await save(id, input(), 'publish', false, T0)).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['consent'],
    });
    expect(await save(id, input(), 'publish', true, T0)).toEqual({ ok: true, outcome: 'published' });
    const own = await getOwnListing(sql, id, T0);
    expect(own).toMatchObject({ status: 'published', changedSincePublish: false });
    expect(own?.publicId).toMatch(/^t-[a-z0-9]{10}$/);
    expect(own?.expiresAt?.getTime()).toBe(after(60).getTime());
    expect(own?.publicCopy).toEqual({
      name: 'Teacher L. Sample',
      subjects: ['maths', 'science'],
      grades: [4, 5],
      curricula: ['CBSE', 'ICSE'],
      experienceYears: 8,
      bio: 'Teaches maths and science to primary classes.',
      timeZone: 'Asia/Kolkata',
      usualTimes: [{ weekday: 1, start: 960, end: 1080 }],
      prices: [HOURLY, MONTHLY],
      photoId: null,
    });
    // Never any contact or account details in the public copy.
    expect(JSON.stringify(own?.publicCopy)).not.toMatch(/@|example\.com|password|teacher_id/);
    expect(await auditTypes(id)).toContain('LISTING_PUBLISHED');
  });

  it('later edits stay private until the teacher agrees again; same details need no new agreement', async () => {
    const id = await teacher();
    await save(id, input(), 'publish', true, T0);
    const firstExpiry = (await getOwnListing(sql, id, T0))!.expiresAt!;
    // A profile edit elsewhere (bio) does not change the public listing.
    await saveTeacherProfile(
      sql,
      id,
      {
        name: 'Teacher L. Sample',
        timeZone: 'Asia/Kolkata',
        subjects: ['maths', 'science'],
        grades: [4, 5, 6],
        bio: 'A new bio that is long enough to save.',
        curricula: ['CBSE', 'ICSE'],
        experienceYears: 8,
        acceptTerms: false,
      },
      'submit',
      after(1),
    );
    let own = await getOwnListing(sql, id, after(1));
    expect(own?.publicCopy?.bio).toBe('Teaches maths and science to primary classes.');
    expect(own?.changedSincePublish).toBe(true);
    // Saving a draft keeps the public copy.
    expect(await save(id, input({ grades: [4] }), 'draft', false, after(1))).toEqual({
      ok: true,
      outcome: 'draft_saved_public_unchanged',
    });
    expect((await getOwnListing(sql, id, after(1)))?.publicCopy?.grades).toEqual([4, 5]);
    expect(await save(id, input({ grades: [4] }), 'publish', false, after(1))).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['consent'],
    });
    expect(await save(id, input({ grades: [4] }), 'publish', true, after(1))).toEqual({
      ok: true,
      outcome: 'published',
    });
    own = await getOwnListing(sql, id, after(1));
    expect(own?.publicCopy).toMatchObject({ grades: [4], bio: 'A new bio that is long enough to save.' });
    // Republishing keeps the current 60-day period.
    expect(own?.expiresAt?.getTime()).toBe(firstExpiry.getTime());
    expect(await save(id, input({ grades: [4] }), 'publish', false, after(2))).toEqual({
      ok: true,
      outcome: 'unchanged',
    });
  });

  it('refuses bad prices: more than 3, sessions over 40 minutes, hourly with sessions, zero amounts', async () => {
    const id = await teacher();
    for (const [prices, problem] of [
      [[HOURLY, MONTHLY, HOURLY, MONTHLY], 'price_count'],
      [[{ ...HOURLY, minutes: 45 }], 'price_minutes'],
      [[{ ...HOURLY, sessions: 4 }], 'price_sessions'],
      [[{ ...MONTHLY, sessions: null }], 'price_sessions'],
      [[{ ...HOURLY, amountMinor: 0 }], 'price_amount'],
      [[{ ...HOURLY, currency: 'EUR' as 'INR' }], 'price_currency'],
    ] as Array<[ListingPrice[], string]>) {
      expect(await save(id, input({ prices }), 'draft', false, T0)).toEqual({
        ok: false,
        reason: 'invalid',
        problems: [problem],
      });
    }
  });

  it('publishing needs at least one subject and grade', async () => {
    const id = await teacher();
    expect(await save(id, input({ subjects: [], grades: [] }), 'publish', true, T0)).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['subjects_required', 'grades_required'],
    });
  });
});

describe('the agreement matches the preview', () => {
  it('refuses to publish when the details differ from the preview the teacher agreed to', async () => {
    const id = await teacher();
    expect(await save(id, input(), 'publish', true, T0, 'something else')).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['preview_changed'],
    });
    expect(await listingRow(id)).toMatchObject({ status: 'draft', published: null });
  });
});

describe('pause, withdraw, expiry and renewal (L-2, L-3)', () => {
  it('pause hides it; publishing the same details shows it again; withdraw closes it', async () => {
    const id = await teacher();
    await save(id, input(), 'publish', true, T0);
    expect(await setListingStatus(sql, id, 'pause', after(1))).toEqual({ ok: true });
    expect((await getOwnListing(sql, id, after(1)))?.status).toBe('paused');
    expect(await save(id, input(), 'publish', false, after(2))).toEqual({ ok: true, outcome: 'published' });
    expect(await setListingStatus(sql, id, 'withdraw', after(3))).toEqual({ ok: true });
    expect(await listingRow(id)).toMatchObject({ status: 'withdrawn', published: null, expires_at: null });
    // Publishing again starts a new period and needs agreement again.
    expect(await save(id, input(), 'publish', false, after(4))).toMatchObject({ reason: 'invalid' });
    await save(id, input(), 'publish', true, after(4));
    expect((await getOwnListing(sql, id, after(4)))?.expiresAt?.getTime()).toBe(after(64).getTime());
    expect(await auditTypes(id)).toEqual(
      expect.arrayContaining(['LISTING_PAUSED', 'LISTING_RESUMED', 'LISTING_WITHDRAWN']),
    );
  });

  it('expires after 60 days; renewal needs all three confirmations', async () => {
    const id = await teacher();
    await save(id, input(), 'publish', true, T0);
    expect(await getOwnListing(sql, id, after(53))).toMatchObject({ status: 'published', renewalDue: true });
    expect((await getOwnListing(sql, id, after(52)))?.renewalDue).toBe(false);
    const own = await getOwnListing(sql, id, after(61));
    expect(own).toMatchObject({ status: 'expired', renewalDue: true });
    expect(await save(id, input({ grades: [4] }), 'publish', true, after(61))).toEqual({
      ok: false,
      reason: 'invalid',
      problems: ['expired'],
    });
    expect(await renewListing(sql, id, { times: true, prices: true, subjects: false }, after(61))).toEqual({
      ok: false,
      reason: 'confirm',
    });
    expect(await renewListing(sql, id, { times: true, prices: true, subjects: true }, after(61))).toEqual({ ok: true });
    expect(await getOwnListing(sql, id, after(61))).toMatchObject({ status: 'published', renewalDue: false });
    expect((await getOwnListing(sql, id, after(61)))?.expiresAt?.getTime()).toBe(after(121).getTime());
  });

  it('queues one reminder 7 days before the end of each period (queued, not sent)', async () => {
    const id = await teacher();
    await save(id, input(), 'publish', true, T0);
    const count = async () => {
      const [r] = await sql<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM email_outbox o JOIN accounts a ON a.email = o.to_address
        WHERE a.id = ${id} AND o.template = 'listing_expiry_reminder'`;
      return r!.n;
    };
    await queueListingReminders(sql, BASE, after(50));
    expect(await count()).toBe(0);
    await queueListingReminders(sql, BASE, after(54));
    await queueListingReminders(sql, BASE, after(55));
    expect(await count()).toBe(1);
    await renewListing(sql, id, { times: true, prices: true, subjects: true }, after(55));
    await queueListingReminders(sql, BASE, after(55 + 54));
    expect(await count()).toBe(2);
  });

  it('limits saves to 10 a day (a setting)', async () => {
    const id = await teacher();
    for (let i = 0; i < 10; i += 1) {
      expect((await save(id, input(), 'draft', false, T0)).ok).toBe(true);
    }
    expect(await save(id, input(), 'draft', false, T0)).toEqual({ ok: false, reason: 'rate_limited' });
    expect((await save(id, input(), 'draft', false, after(1.01))).ok).toBe(true);
  });
});

describe('an approved change that removes subjects narrows the listing (L-5)', () => {
  it('keeps approved ones; with none left the listing returns to draft', async () => {
    const owner = await createAdult(sql, 'superadmin');
    const made = await createAdmin(
      sql,
      owner,
      { name: 'Approver', email: `approver-${uniq()}@example.com`, permissions: ['teacher_approvals'], baseUrl: BASE },
      T0,
    );
    if (!made.ok) throw new Error(made.reason);
    await sql`UPDATE accounts SET status = 'active' WHERE id = ${made.adminId}`;
    const change = async (id: string, subjects: string[]) => {
      await saveTeacherProfile(
        sql,
        id,
        {
          name: 'Teacher L. Sample',
          timeZone: 'Asia/Kolkata',
          subjects,
          grades: [4, 5, 6],
          bio: 'Teaches maths and science to primary classes.',
          curricula: ['CBSE'],
          experienceYears: 8,
          acceptTerms: false,
        },
        'submit',
        T0,
      );
      const r = await decideProfileChange(
        sql,
        made.adminId,
        id,
        { decision: 'approve', note: 'Checked', baseUrl: BASE },
        T0,
      );
      expect(r).toEqual({ ok: true });
    };
    const a = await teacher();
    await save(a, input(), 'publish', true, T0);
    await change(a, ['science', 'english']);
    expect(await listingRow(a)).toMatchObject({ status: 'published' });
    expect((await getOwnListing(sql, a, T0))?.publicCopy?.subjects).toEqual(['science']);
    expect(await auditTypes(a)).toContain('LISTING_NARROWED');

    const b = await teacher();
    await save(b, input({ subjects: ['maths'] }), 'publish', true, T0);
    await change(b, ['english']);
    expect(await listingRow(b)).toMatchObject({ status: 'draft', published: null });
  });
});
