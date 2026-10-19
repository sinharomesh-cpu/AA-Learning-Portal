import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { snapshotKey } from '@/lib/listing';
import { VERIFIED_EXPLANATION } from '@/lib/verification';
import { createAdmin } from '@/server/admin';
import { toCardsWithOffers } from '@/server/listingCards';
import { getPublicListing } from '@/server/publicListings';
import { type ListingInput, previewListing, saveListing } from '@/server/teacherListings';
import {
  decideVerification,
  getOwnVerification,
  isPubliclyVerified,
  listVerificationCases,
  requestVerification,
  revokeVerification,
  verifiedPublicIds,
  verifiedTeacherIds,
} from '@/server/teacherVerification';
import { createAdult, testDb, uniq } from './helpers';

/** CR-15 §5.1 "AA Pro Verified" (owner decision OC-106 (2); FR-045). Synthetic people only. */
const sql = testDb();
const T0 = new Date('2026-10-20T06:00:00Z');
const MIN = 60 * 1000;
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);
/** 12 calendar months after T0, in UTC. */
const EXPIRY = new Date('2027-10-20T06:00:00Z');
const CHECKS = { profileReviewed: true, identityChecked: true };

let owner = '';
beforeAll(async () => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  owner = await createAdult(sql, 'superadmin');
});
afterAll(() => sql.end());

async function teacher(opts: { emailConfirmed?: boolean; approval?: string; status?: string } = {}) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, email_verified_at)
    VALUES ('teacher', ${opts.status ?? 'active'}, ${`vf-${uniq()}@example.com`}, ${`Teacher Vf ${uniq()}`}, 'x',
            ${opts.emailConfirmed === false ? null : T0})
    RETURNING id`;
  const approval = opts.approval ?? 'approved';
  const decided = approval === 'approved';
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at,
                                  submitted_at, curricula, experience_years)
    VALUES (${row!.id}, 'self_registered', ${approval}, ${['maths']}, ${[4, 5]}, 'A short bio.',
            ${decided ? owner : null}, ${decided ? T0 : null}, ${T0}, ${['CBSE']}, 5)`;
  return row!.id;
}

async function publish(id: string) {
  const input: ListingInput = {
    subjects: ['maths'],
    grades: [4, 5],
    curricula: ['CBSE'],
    experienceYears: 5,
    prices: [{ model: 'hourly', currency: 'INR', amountMinor: 50000, sessions: null, minutes: 40 }],
  };
  const snap = await previewListing(sql, id, input);
  const r = await saveListing(
    sql,
    id,
    {
      ...input,
      previewKey: snapshotKey({ ...snap!, curricula: input.curricula, experienceYears: input.experienceYears }),
    },
    'publish',
    true,
    T0,
  );
  expect(r).toEqual({ ok: true, outcome: 'published' });
  const [l] = await sql<Array<{ public_id: string }>>`SELECT public_id FROM teacher_listings WHERE teacher_id = ${id}`;
  return l!.public_id;
}

const state = async (id: string, now: Date) => (await getOwnVerification(sql, id, now))?.state;

/** A teacher verified at `minutes` after T0. */
async function verified(minutes = 0) {
  const id = await teacher();
  expect(await requestVerification(sql, id, at(minutes))).toEqual({ ok: true });
  expect(
    await decideVerification(sql, owner, id, { outcome: 'verified', ...CHECKS, note: 'Video call done' }, at(minutes)),
  ).toEqual({ ok: true, outcome: 'verified' });
  return id;
}

describe('states and transitions', () => {
  it('not started → pending → verified, valid for 12 months; every step audited', async () => {
    const id = await teacher();
    expect(await getOwnVerification(sql, id, T0)).toMatchObject({
      state: 'not_started',
      canRequest: true,
      blocked: null,
    });
    expect(await requestVerification(sql, id, T0)).toEqual({ ok: true });
    expect(await getOwnVerification(sql, id, at(1))).toMatchObject({
      state: 'pending',
      requestedAt: T0,
      canRequest: false,
    });
    const queue = await listVerificationCases(sql, owner, at(1));
    const mine = queue!.pending.find((c) => c.teacherId === id);
    expect(mine).toMatchObject({ state: 'pending', emailConfirmed: true, eligible: true, history: [] });

    expect(
      await decideVerification(sql, owner, id, { outcome: 'verified', ...CHECKS, note: 'Checked on a call' }, at(2)),
    ).toEqual({ ok: true, outcome: 'verified' });
    const own = await getOwnVerification(sql, id, at(3));
    expect(own).toMatchObject({ state: 'verified', decidedAt: at(2), canRequest: false });
    expect(own!.expiresAt!.toISOString()).toBe(new Date(EXPIRY.getTime() + 2 * MIN).toISOString());

    const after = await listVerificationCases(sql, owner, at(3));
    expect(after!.pending.some((c) => c.teacherId === id)).toBe(false);
    const v = after!.verified.find((c) => c.teacherId === id)!;
    expect(v.history).toHaveLength(1);
    expect(v.history[0]).toMatchObject({
      outcome: 'verified',
      emailConfirmed: true,
      profileReviewed: true,
      identityChecked: true,
      note: 'Checked on a call',
      decidedBy: expect.stringMatching(/ \(Super Admin\)$/),
    });
    const events = await sql<Array<{ event_type: string; actor_id: string }>>`
      SELECT event_type, actor_id FROM audit_events WHERE subject_id = ${id} ORDER BY id`;
    expect(events.map((e) => e.event_type)).toEqual([
      'TEACHER_VERIFICATION_REQUESTED',
      'TEACHER_VERIFICATION_DECISION',
    ]);
    expect(events[1]!.actor_id).toBe(owner);
  });

  it('pending → not verified; the teacher may ask again and is checked again', async () => {
    const id = await teacher();
    await requestVerification(sql, id, T0);
    expect(
      await decideVerification(
        sql,
        owner,
        id,
        { outcome: 'not_verified', profileReviewed: true, identityChecked: false, note: 'Call did not connect' },
        at(1),
      ),
    ).toEqual({ ok: true, outcome: 'not_verified' });
    expect(await getOwnVerification(sql, id, at(2))).toMatchObject({ state: 'not_verified', canRequest: true });
    expect(await isPubliclyVerified(sql, id, at(2))).toBe(false);
    expect(await requestVerification(sql, id, at(3))).toEqual({ ok: true });
    expect(await state(id, at(3))).toBe('pending');
    await decideVerification(sql, owner, id, { outcome: 'verified', ...CHECKS, note: 'Second call fine' }, at(4));
    expect(await state(id, at(5))).toBe('verified');
    const cases = await listVerificationCases(sql, owner, at(5));
    expect(cases!.verified.find((c) => c.teacherId === id)!.history.map((h) => h.outcome)).toEqual([
      'verified',
      'not_verified',
    ]);
  });

  it('verified → revoked needs a reason; the tick goes at once; the teacher may ask again', async () => {
    const id = await verified();
    expect(await revokeVerification(sql, owner, id, { reason: '  ' }, at(10))).toEqual({
      ok: false,
      reason: 'reason_required',
    });
    expect(await isPubliclyVerified(sql, id, at(10))).toBe(true);
    expect(await revokeVerification(sql, owner, id, { reason: 'Asked by the teacher' }, at(10))).toEqual({ ok: true });
    expect(await getOwnVerification(sql, id, at(11))).toMatchObject({ state: 'revoked', canRequest: true });
    expect(await isPubliclyVerified(sql, id, at(11))).toBe(false);
    // Nothing left to remove.
    expect(await revokeVerification(sql, owner, id, { reason: 'Again' }, at(12))).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await requestVerification(sql, id, at(13))).toEqual({ ok: true });
    expect(await state(id, at(13))).toBe('pending');
    const [audit] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM audit_events WHERE subject_id = ${id} AND event_type = 'TEACHER_VERIFICATION_REVOKED'`;
    expect(audit!.n).toBe(1);
  });

  it('a verified teacher cannot ask again until expiry or removal; one open request at a time', async () => {
    const id = await verified();
    expect(await requestVerification(sql, id, at(1))).toEqual({ ok: false, reason: 'already_verified' });
    const other = await teacher();
    expect(await requestVerification(sql, other, T0)).toEqual({ ok: true });
    expect(await requestVerification(sql, other, at(1))).toEqual({ ok: false, reason: 'already_pending' });
    // The database refuses a second open request too.
    await expect(
      sql`INSERT INTO teacher_verification_requests (teacher_id, requested_at) VALUES (${other}, ${at(2)})`,
    ).rejects.toThrow(/teacher_verification_requests_open/);
  });

  it('decisions answer an open request only: no request, no decision', async () => {
    const id = await teacher();
    expect(
      await decideVerification(sql, owner, id, { outcome: 'verified', ...CHECKS, note: 'No request yet' }, T0),
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(await revokeVerification(sql, owner, id, { reason: 'Not verified' }, T0)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('the 12-month expiry boundary', () => {
  it('verified until just before 12 months; expired at and after; then may ask again', async () => {
    const id = await verified();
    const pub = await publish(id);
    const justBefore = new Date(EXPIRY.getTime() - 1);
    const after = new Date(EXPIRY.getTime() + 1);
    expect(await state(id, justBefore)).toBe('verified');
    expect(await isPubliclyVerified(sql, id, justBefore)).toBe(true);
    expect((await verifiedPublicIds(sql, [pub], justBefore)).has(pub)).toBe(true);
    expect(await state(id, EXPIRY)).toBe('expired');
    expect(await isPubliclyVerified(sql, id, EXPIRY)).toBe(false);
    expect((await verifiedPublicIds(sql, [pub], EXPIRY)).has(pub)).toBe(false);
    expect(await state(id, after)).toBe('expired');
    expect(await isPubliclyVerified(sql, id, after)).toBe(false);
    // Expired: not in the Super Admin's verified list, cannot be removed, may ask again.
    expect((await listVerificationCases(sql, owner, after))!.verified.some((c) => c.teacherId === id)).toBe(false);
    expect(await revokeVerification(sql, owner, id, { reason: 'Too late' }, after)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await requestVerification(sql, id, justBefore)).toEqual({ ok: false, reason: 'already_verified' });
    expect(await getOwnVerification(sql, id, after)).toMatchObject({
      state: 'expired',
      canRequest: true,
      expiresAt: EXPIRY,
    });
    expect(await requestVerification(sql, id, after)).toEqual({ ok: true });
    expect(await state(id, after)).toBe('pending');
  });

  it('the database sets the expiry itself, 12 calendar months later in UTC (29 Feb → 28 Feb)', async () => {
    const id = await teacher();
    const leap = new Date('2028-02-29T10:00:00Z');
    await requestVerification(sql, id, leap);
    await decideVerification(sql, owner, id, { outcome: 'verified', ...CHECKS, note: 'Leap day check' }, leap);
    const [row] = await sql<Array<{ expires_at: Date }>>`
      SELECT expires_at FROM teacher_verification_decisions WHERE teacher_id = ${id}`;
    expect(row!.expires_at.toISOString()).toBe('2029-02-28T10:00:00.000Z');
  });
});

describe('the three checks', () => {
  it('"Mark verified" needs the profile review and the video-call check', async () => {
    const id = await teacher();
    await requestVerification(sql, id, T0);
    for (const checks of [
      { profileReviewed: false, identityChecked: true },
      { profileReviewed: true, identityChecked: false },
      { profileReviewed: false, identityChecked: false },
    ]) {
      expect(await decideVerification(sql, owner, id, { outcome: 'verified', ...checks, note: 'Not all' }, T0)).toEqual(
        { ok: false, reason: 'checks_required' },
      );
    }
    expect(await state(id, T0)).toBe('pending');
    // The database refuses a verified record without all three as well.
    const [req] = await sql<Array<{ id: string }>>`
      SELECT id FROM teacher_verification_requests WHERE teacher_id = ${id} AND closed_at IS NULL`;
    await expect(sql`
      INSERT INTO teacher_verification_decisions
        (teacher_id, request_id, outcome, email_confirmed, profile_reviewed, identity_checked, note, decided_by, decided_at)
      VALUES (${id}, ${req!.id}, 'verified', true, true, false, 'Direct insert', ${owner}, ${T0})`).rejects.toThrow(
      /teacher_verification_all_checks/,
    );
  });

  it('the email check comes from the account: an unconfirmed email cannot request or be marked verified', async () => {
    const unconfirmed = await teacher({ emailConfirmed: false });
    expect(await getOwnVerification(sql, unconfirmed, T0)).toMatchObject({
      state: 'not_started',
      canRequest: false,
      blocked: 'email_unconfirmed',
    });
    expect(await requestVerification(sql, unconfirmed, T0)).toEqual({ ok: false, reason: 'email_unconfirmed' });

    // Confirmed when asking, no longer confirmed when decided (e.g. a changed address).
    const id = await teacher();
    await requestVerification(sql, id, T0);
    await sql`UPDATE accounts SET email_verified_at = NULL WHERE id = ${id}`;
    expect((await listVerificationCases(sql, owner, T0))!.pending.find((c) => c.teacherId === id)).toMatchObject({
      emailConfirmed: false,
    });
    expect(
      await decideVerification(sql, owner, id, { outcome: 'verified', ...CHECKS, note: 'Email not confirmed' }, at(1)),
    ).toEqual({ ok: false, reason: 'email_unconfirmed' });
    // The Super Admin cannot record the email check as done in the database either.
    const [req] = await sql<Array<{ id: string }>>`
      SELECT id FROM teacher_verification_requests WHERE teacher_id = ${id} AND closed_at IS NULL`;
    await expect(sql`
      INSERT INTO teacher_verification_decisions
        (teacher_id, request_id, outcome, email_confirmed, profile_reviewed, identity_checked, note, decided_by, decided_at)
      VALUES (${id}, ${req!.id}, 'verified', true, true, true, 'Direct insert', ${owner}, ${at(1)})`).rejects.toThrow(
      /email check must match the account/,
    );
    // "Not verified" is still possible and records the email as not confirmed.
    expect(
      await decideVerification(
        sql,
        owner,
        id,
        { outcome: 'not_verified', profileReviewed: true, identityChecked: true, note: 'Email not confirmed' },
        at(1),
      ),
    ).toEqual({ ok: true, outcome: 'not_verified' });
    const [row] = await sql<Array<{ email_confirmed: boolean }>>`
      SELECT email_confirmed FROM teacher_verification_decisions WHERE teacher_id = ${id}`;
    expect(row!.email_confirmed).toBe(false);
  });

  it('only approved, active teachers may ask or be marked verified', async () => {
    for (const opts of [{ approval: 'submitted', status: 'pending_approval' }, { status: 'deactivated' }]) {
      const id = await teacher(opts);
      expect(await requestVerification(sql, id, T0)).toEqual({ ok: false, reason: 'not_eligible' });
    }
    const id = await teacher();
    await requestVerification(sql, id, T0);
    await sql`UPDATE accounts SET status = 'suspended' WHERE id = ${id}`;
    expect(
      await decideVerification(sql, owner, id, { outcome: 'verified', ...CHECKS, note: 'Suspended now' }, at(1)),
    ).toEqual({ ok: false, reason: 'not_eligible' });
  });

  it('notes are required and never hold an ID number', async () => {
    const id = await teacher();
    await requestVerification(sql, id, T0);
    expect(await decideVerification(sql, owner, id, { outcome: 'verified', ...CHECKS, note: ' ' }, T0)).toEqual({
      ok: false,
      reason: 'note_required',
    });
    for (const note of ['ID 123456789012', 'Aadhaar 1234 5678 9012']) {
      expect(await decideVerification(sql, owner, id, { outcome: 'verified', ...CHECKS, note }, T0)).toEqual({
        ok: false,
        reason: 'note_has_number',
      });
    }
    expect(await state(id, T0)).toBe('pending');
    const v = await verified();
    expect(await revokeVerification(sql, owner, v, { reason: 'Number 1234 5678 9012' }, at(1))).toEqual({
      ok: false,
      reason: 'note_has_number',
    });
  });
});

describe('only the Super Admin', () => {
  it('Admins (even with every permission) and teachers are refused, in the app and in the database', async () => {
    const id = await teacher();
    await requestVerification(sql, id, T0);
    const made = await createAdmin(sql, owner, {
      name: 'Vf Admin',
      email: `vfadmin-${uniq()}@example.com`,
      permissions: ['accounts', 'teacher_approvals', 'audit_log'],
      baseUrl: 'http://aa.test',
    });
    if (!made.ok) throw new Error('admin not created');
    const other = await teacher();
    for (const actor of [made.adminId, id, other]) {
      expect(await listVerificationCases(sql, actor, T0)).toBeNull();
      expect(
        await decideVerification(sql, actor, id, { outcome: 'verified', ...CHECKS, note: 'Not mine to do' }, T0),
      ).toEqual({ ok: false, reason: 'denied' });
    }
    const v = await verified();
    expect(await revokeVerification(sql, made.adminId, v, { reason: 'Not mine to do' }, at(1))).toEqual({
      ok: false,
      reason: 'denied',
    });
    expect(await state(id, T0)).toBe('pending');
    const [req] = await sql<Array<{ id: string }>>`
      SELECT id FROM teacher_verification_requests WHERE teacher_id = ${id} AND closed_at IS NULL`;
    await expect(sql`
      INSERT INTO teacher_verification_decisions
        (teacher_id, request_id, outcome, email_confirmed, profile_reviewed, identity_checked, note, decided_by, decided_at)
      VALUES (${id}, ${req!.id}, 'verified', true, true, true, 'Admin insert', ${made.adminId}, ${T0})`).rejects.toThrow(
      /only the Super Admin/,
    );
  });
});

describe('an unchangeable record', () => {
  it('the database refuses to change or delete decisions, or to reopen or delete requests', async () => {
    const id = await verified();
    await expect(
      sql`UPDATE teacher_verification_decisions SET note = 'Changed' WHERE teacher_id = ${id}`,
    ).rejects.toThrow(/cannot be changed or deleted/);
    await expect(
      sql`UPDATE teacher_verification_decisions SET expires_at = ${at(1)} WHERE teacher_id = ${id}`,
    ).rejects.toThrow(/cannot be changed or deleted/);
    await expect(sql`DELETE FROM teacher_verification_decisions WHERE teacher_id = ${id}`).rejects.toThrow(
      /cannot be changed or deleted/,
    );
    await expect(sql`TRUNCATE teacher_verification_decisions CASCADE`).rejects.toThrow(/cannot be emptied/);
    await expect(
      sql`UPDATE teacher_verification_requests SET closed_at = NULL WHERE teacher_id = ${id}`,
    ).rejects.toThrow(/can only be closed, once/);
    await expect(sql`DELETE FROM teacher_verification_requests WHERE teacher_id = ${id}`).rejects.toThrow(
      /cannot be deleted/,
    );
    // A decision cannot be back-dated before the previous one.
    await expect(sql`
      INSERT INTO teacher_verification_decisions
        (teacher_id, outcome, email_confirmed, profile_reviewed, identity_checked, note, decided_by, decided_at)
      VALUES (${id}, 'revoked', true, false, false, 'Back-dated', ${owner}, ${at(-60)})`).rejects.toThrow(/time order/);
    const [n] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM teacher_verification_decisions WHERE teacher_id = ${id}`;
    expect(n!.n).toBe(1);
  });

  it('the records go only with the teacher’s account', async () => {
    // Written directly (no audit events, which would keep the account) to check the cascade.
    const id = await teacher();
    const [req] = await sql<Array<{ id: string }>>`
      INSERT INTO teacher_verification_requests (teacher_id, requested_at) VALUES (${id}, ${T0}) RETURNING id`;
    await sql`
      INSERT INTO teacher_verification_decisions
        (teacher_id, request_id, outcome, email_confirmed, profile_reviewed, identity_checked, note, decided_by, decided_at)
      VALUES (${id}, ${req!.id}, 'verified', true, true, true, 'Direct insert', ${owner}, ${T0})`;
    await sql`UPDATE teacher_verification_requests SET closed_at = ${T0} WHERE id = ${req!.id}`;
    await sql`DELETE FROM accounts WHERE id = ${id}`;
    const [n] = await sql<Array<{ n: number }>>`
      SELECT (SELECT count(*) FROM teacher_verification_decisions WHERE teacher_id = ${id})
           + (SELECT count(*) FROM teacher_verification_requests WHERE teacher_id = ${id}) AS n`;
    expect(Number(n!.n)).toBe(0);
  });
});

describe('concurrency', () => {
  it('two simultaneous requests: one opens, the other is told it is already waiting', async () => {
    const id = await teacher();
    const results = await Promise.all([requestVerification(sql, id, T0), requestVerification(sql, id, T0)]);
    expect(results).toEqual(expect.arrayContaining([{ ok: true }, { ok: false, reason: 'already_pending' }]));
    const [n] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM teacher_verification_requests WHERE teacher_id = ${id}`;
    expect(n!.n).toBe(1);
  });

  it('two simultaneous decisions on one request: one wins cleanly, nothing else changes', async () => {
    const id = await teacher();
    await requestVerification(sql, id, T0);
    const results = await Promise.all([
      decideVerification(sql, owner, id, { outcome: 'verified', ...CHECKS, note: 'First decision' }, at(1)),
      decideVerification(
        sql,
        owner,
        id,
        { outcome: 'not_verified', profileReviewed: false, identityChecked: false, note: 'Second decision' },
        at(1),
      ),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'not_found' }]);
    const rows = await sql<Array<{ outcome: string }>>`
      SELECT outcome FROM teacher_verification_decisions WHERE teacher_id = ${id}`;
    expect(rows).toHaveLength(1);
    const winner = results.find((r) => r.ok) as { ok: true; outcome: string };
    expect(rows[0]!.outcome).toBe(winner.outcome);
  });
});

describe('public visibility', () => {
  it('the tick is worked out live: verified and not expired, approved and active only', async () => {
    const id = await teacher();
    const pub = await publish(id);
    const card = async (now: Date) => {
      const listing = await getPublicListing(sql, pub, now);
      return (await toCardsWithOffers(sql, [listing!], now))[0]!;
    };
    expect((await card(T0)).verified).toBe(false);
    await requestVerification(sql, id, T0);
    expect((await verifiedPublicIds(sql, [pub], at(1))).size).toBe(0);
    await decideVerification(sql, owner, id, { outcome: 'verified', ...CHECKS, note: 'Public check' }, at(2));
    expect((await card(at(3))).verified).toBe(true);
    expect((await verifiedTeacherIds(sql, [id], at(3))).has(id)).toBe(true);
    // The stored public copy of the listing never carries the tick.
    const [l] = await sql<Array<{ published: Record<string, unknown> }>>`
      SELECT published FROM teacher_listings WHERE public_id = ${pub}`;
    expect(JSON.stringify(l!.published)).not.toMatch(/verif/i);
    // A deactivated teacher shows no tick (and no listing).
    await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${id}`;
    expect((await verifiedTeacherIds(sql, [id], at(4))).size).toBe(0);
    expect((await verifiedPublicIds(sql, [pub], at(4))).size).toBe(0);
    await sql`UPDATE accounts SET status = 'active' WHERE id = ${id}`;
    // Gone at expiry (the listing itself lasts 60 days, so checked by id here).
    expect((await verifiedPublicIds(sql, [pub], new Date(EXPIRY.getTime() + 2 * MIN))).size).toBe(0);
    expect((await verifiedPublicIds(sql, [pub], new Date(EXPIRY.getTime() + 2 * MIN - 1))).size).toBe(1);
    // Unknown or malformed ids are ignored.
    expect((await verifiedPublicIds(sql, ['nope', 't-0000000000'], at(4))).size).toBe(0);
    expect(VERIFIED_EXPLANATION).toBe(
      "AA Pro checked this teacher's email, reviewed their profile and confirmed their identity on a video call. This does not independently verify teaching qualifications, experience or background checks.",
    );
  });
});
