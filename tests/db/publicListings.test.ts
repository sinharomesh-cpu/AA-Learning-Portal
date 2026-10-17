import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { snapshotKey } from '@/lib/listing';
import { createAdmin } from '@/server/admin';
import {
  cleanPublicFilters,
  getPublicListing,
  NO_FILTERS,
  readPublicPhoto,
  searchPublicListings,
} from '@/server/publicListings';
import { type ListingInput, previewListing, saveListing, setListingStatus } from '@/server/teacherListings';
import { decidePhoto, removeTeacherPhoto, uploadTeacherPhoto } from '@/server/teacherPhotos';
import { createAdult, testDb, uniq } from './helpers';

/** PR-D3: public listings (boards D8, D9, D10; OC-79 C, OC-84, L-4). */
const sql = testDb();
const T0 = new Date('2026-10-17T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const after = (days: number) => new Date(T0.getTime() + days * DAY);
// A word only this test file uses, so other tests' listings don't affect the counts.
const TAG = `Zq${uniq()}`;

beforeAll(() => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
});
afterAll(() => sql.end());

async function teacher(
  name: string,
  opts: { subjects?: string[]; grades?: number[]; curricula?: string[]; years?: number | null } = {},
) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone)
    VALUES ('teacher', 'active', ${`pub-${uniq()}@example.com`}, ${`${name} ${TAG}`}, 'x', 'Asia/Kolkata')
    RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at,
                                  submitted_at, curricula, experience_years)
    VALUES (${row!.id}, 'self_registered', 'approved', ${opts.subjects ?? ['maths']}, ${opts.grades ?? [4, 5]},
            'A short bio.', ${owner}, ${T0}, ${T0}, ${opts.curricula ?? ['CBSE']}, ${opts.years === undefined ? 5 : opts.years})`;
  return row!.id;
}

async function publish(id: string, inp: Partial<ListingInput> = {}, now = T0) {
  const [p] = await sql<
    Array<{ subjects: string[]; grades: number[]; curricula: string[]; experience_years: number | null }>
  >`
    SELECT subjects, grades, curricula, experience_years FROM teacher_profiles WHERE account_id = ${id}`;
  const input: ListingInput = {
    subjects: p!.subjects,
    grades: p!.grades.map(Number),
    curricula: p!.curricula,
    experienceYears: p!.experience_years === null ? null : Number(p!.experience_years),
    prices: [{ model: 'hourly', currency: 'INR', amountMinor: 50000, sessions: null, minutes: 40 }],
    ...inp,
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
    now,
  );
  expect(r).toEqual({ ok: true, outcome: 'published' });
  const [l] = await sql<Array<{ public_id: string }>>`SELECT public_id FROM teacher_listings WHERE teacher_id = ${id}`;
  return l!.public_id;
}

const mine = (filters = NO_FILTERS, now = T0) =>
  searchPublicListings(sql, { ...filters, name: filters.name || TAG }, now, 50).then((r) => r.listings);

describe('only live listings of approved, active teachers are public (L-4)', () => {
  it('drafts, paused, withdrawn, ended listings and deactivated teachers never appear', async () => {
    const live = await publish(await teacher('Teacher Live'));
    const pausedId = await teacher('Teacher Paused');
    const paused = await publish(pausedId);
    await setListingStatus(sql, pausedId, 'pause', T0);
    const withdrawnId = await teacher('Teacher Withdrawn');
    const withdrawn = await publish(withdrawnId);
    await setListingStatus(sql, withdrawnId, 'withdraw', T0);
    const goneId = await teacher('Teacher Deactivated');
    const gone = await publish(goneId);
    await sql`UPDATE accounts SET status = 'deactivated' WHERE id = ${goneId}`;
    const oldId = await teacher('Teacher Old');
    const old = await publish(oldId, {}, after(-61));
    const draftId = await teacher('Teacher Draft');
    await saveListing(
      sql,
      draftId,
      { subjects: ['maths'], grades: [4], curricula: [], experienceYears: null, prices: [] },
      'draft',
      false,
      T0,
    );

    const ids = (await mine()).map((l) => l.publicId);
    expect(ids).toContain(live);
    for (const hidden of [paused, withdrawn, gone, old]) {
      expect(ids).not.toContain(hidden);
      expect(await getPublicListing(sql, hidden, T0)).toBeNull();
    }
    expect(await getPublicListing(sql, live, T0)).toMatchObject({ publicId: live, name: `Teacher Live ${TAG}` });
  });

  it('returns only the agreed public copy: no account ids, emails or anything else', async () => {
    const id = await teacher('Teacher Private');
    const pub = await publish(id);
    const listing = await getPublicListing(sql, pub, T0);
    const text = JSON.stringify(listing);
    expect(text).not.toContain(id);
    expect(text).not.toMatch(/@|example\.com|password/);
    expect(Object.keys(listing!).sort()).toEqual(
      [
        'bio',
        'curricula',
        'experienceYears',
        'grades',
        'name',
        'photoId',
        'prices',
        'publicId',
        'subjects',
        'timeZone',
        'usualTimes',
      ].sort(),
    );
  });
});

describe('search and filters work on the published data', () => {
  it('filters by subject, grade, curriculum, experience and name; sorts by experience', async () => {
    await publish(
      await teacher('Teacher Alpha', { subjects: ['science'], grades: [9, 10], curricula: ['ICSE'], years: 12 }),
    );
    await publish(
      await teacher('Teacher Beta', { subjects: ['science', 'it'], grades: [6], curricula: ['IB'], years: 3 }),
    );
    await publish(await teacher('Teacher Gamma', { subjects: ['hindi'], grades: [2], curricula: [], years: null }));
    const names = (ls: Array<{ name: string }>) => ls.map((l) => l.name.replace(` ${TAG}`, ''));

    expect(names(await mine({ ...NO_FILTERS, subject: 'science' })).sort()).toEqual(['Teacher Alpha', 'Teacher Beta']);
    expect(names(await mine({ ...NO_FILTERS, grade: 10 }))).toEqual(['Teacher Alpha']);
    expect(names(await mine({ ...NO_FILTERS, curriculum: 'IB' }))).toEqual(['Teacher Beta']);
    expect(names(await mine({ ...NO_FILTERS, minExperience: 10 }))).toEqual(['Teacher Alpha']);
    expect(names(await mine({ ...NO_FILTERS, subject: 'it', grade: 10 }))).toEqual([]);
    expect(names(await mine({ ...NO_FILTERS, name: `Gamma ${TAG}` }))).toEqual(['Teacher Gamma']);
    const sorted = names(await mine({ ...NO_FILTERS, subject: 'science', sort: 'experience' }));
    expect(sorted).toEqual(['Teacher Alpha', 'Teacher Beta']);
    // "%" and "_" in a name search are plain characters.
    expect(await mine({ ...NO_FILTERS, name: `%${TAG}` })).toEqual([]);
  });

  it('cleans address-bar values and ignores anything unknown', () => {
    expect(
      cleanPublicFilters({
        subject: 'maths',
        grade: '5',
        curriculum: 'CBSE',
        experience: '5',
        sort: 'experience',
        page: '2',
        name: '  Rao  ',
      }),
    ).toEqual({
      name: 'Rao',
      subject: 'maths',
      grade: 5,
      curriculum: 'CBSE',
      minExperience: 5,
      sort: 'experience',
      page: 2,
    });
    expect(
      cleanPublicFilters({
        subject: 'magic',
        grade: '13',
        curriculum: 'X',
        experience: '7',
        sort: 'rating',
        page: '999',
      }),
    ).toEqual(NO_FILTERS);
  });
});

describe('photos on public listings (OC-85)', () => {
  it('shown only while approved, agreed to on the listing, and the listing is live', async () => {
    const id = await teacher('Teacher Photo');
    const owner = await createAdult(sql, 'superadmin');
    const made = await createAdmin(
      sql,
      owner,
      {
        name: 'Approver',
        email: `approver-${uniq()}@example.com`,
        permissions: ['teacher_approvals'],
        baseUrl: 'http://aa.test',
      },
      T0,
    );
    if (!made.ok) throw new Error(made.reason);
    await sql`UPDATE accounts SET status = 'active' WHERE id = ${made.adminId}`;
    const img = await sharp({ create: { width: 500, height: 500, channels: 3, background: '#2a8fa6' } })
      .jpeg()
      .toBuffer();
    await uploadTeacherPhoto(sql, id, new Uint8Array(img), T0);
    const [p] = await sql<Array<{ id: string }>>`SELECT id FROM teacher_photos WHERE teacher_id = ${id}`;
    // Not approved yet: not public, even on a published listing.
    const pub = await publish(id);
    expect(await readPublicPhoto(sql, p!.id, T0)).toBeNull();
    await decidePhoto(sql, made.adminId, p!.id, 'approve', '', T0);
    // Approved but not on the agreed copy until the teacher publishes again.
    expect(await readPublicPhoto(sql, p!.id, T0)).toBeNull();
    await publish(id);
    expect(await readPublicPhoto(sql, p!.id, T0)).toBeInstanceOf(Buffer);
    expect((await getPublicListing(sql, pub, T0))?.photoId).toBe(p!.id);
    // Paused: hidden again.
    await setListingStatus(sql, id, 'pause', T0);
    expect(await readPublicPhoto(sql, p!.id, T0)).toBeNull();
    await publish(id);
    // The teacher removes the photo: gone at once, the listing shows the initial.
    await removeTeacherPhoto(sql, id, T0);
    expect(await readPublicPhoto(sql, p!.id, T0)).toBeNull();
    expect((await getPublicListing(sql, pub, T0))?.photoId).toBeNull();
  });
});
