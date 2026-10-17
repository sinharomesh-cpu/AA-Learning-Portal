import 'server-only';
import { SUBJECT_IDS } from '@/fixtures/subjects';
import type { ListingSnapshot } from '@/lib/listing';
import { CURRICULA } from './children';
import type { Db } from './db/client';

/**
 * Public teacher listings (PR-D3; boards D8, D9, D10; OC-79 C, OC-84). Anyone, signed in or not,
 * sees only published, unexpired listings of approved, active teachers, and only the copy the
 * teacher agreed to show. Never account ids, contact details or anything about children.
 * Draft, paused, withdrawn and expired listings, and listings of waiting, rejected or
 * deactivated teachers, are never returned (L-4).
 */

export const PAGE_SIZE = 12;
export const EXPERIENCE_STEPS = [2, 5, 10] as const;

export interface PublicFilters {
  name: string;
  subject: string | null;
  grade: number | null;
  curriculum: string | null;
  minExperience: number | null;
  sort: 'newest' | 'experience';
  page: number;
}

export const NO_FILTERS: PublicFilters = {
  name: '',
  subject: null,
  grade: null,
  curriculum: null,
  minExperience: null,
  sort: 'newest',
  page: 1,
};

/** Validates search parameters from the address bar; anything unknown is ignored. */
export function cleanPublicFilters(q: Record<string, string | string[] | undefined>): PublicFilters {
  const one = (k: string) => {
    const v = q[k];
    return typeof v === 'string' ? v : '';
  };
  const name = one('name').normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, 60);
  const subject = (SUBJECT_IDS as readonly string[]).includes(one('subject')) ? one('subject') : null;
  const g = Number(one('grade'));
  const grade = Number.isInteger(g) && g >= 1 && g <= 12 ? g : null;
  const curriculum = (CURRICULA as readonly string[]).includes(one('curriculum')) ? one('curriculum') : null;
  const e = Number(one('experience'));
  const minExperience = (EXPERIENCE_STEPS as readonly number[]).includes(e) ? e : null;
  const sort = one('sort') === 'experience' ? 'experience' : 'newest';
  const p = Number(one('page'));
  const page = Number.isInteger(p) && p >= 1 && p <= 50 ? p : 1;
  return { name, subject, grade, curriculum, minExperience, sort, page };
}

export interface PublicListing extends ListingSnapshot {
  publicId: string;
}

type Row = { public_id: string; published: ListingSnapshot; photo_ok: boolean };

const toPublic = (r: Row): PublicListing => ({
  ...r.published,
  // A photo the teacher removed (or that is no longer approved) is never shown.
  photoId: r.photo_ok ? r.published.photoId : null,
  publicId: r.public_id,
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchPublicListings(
  sql: Db,
  filters: PublicFilters,
  now: Date = new Date(),
  pageSize: number = PAGE_SIZE,
): Promise<{ listings: PublicListing[]; more: boolean }> {
  const f = filters;
  const offset = (f.page - 1) * pageSize;
  const rows = await sql<Row[]>`
    SELECT l.public_id, l.published,
           EXISTS (SELECT 1 FROM teacher_photos p
                   WHERE p.teacher_id = l.teacher_id AND p.status = 'approved'
                     AND p.id::text = l.published ->> 'photoId') AS photo_ok
    FROM teacher_listings l
    JOIN accounts a ON a.id = l.teacher_id
    JOIN teacher_profiles t ON t.account_id = a.id
    WHERE l.status = 'published' AND l.expires_at > ${now}
      AND a.status = 'active' AND t.approval_status = 'approved'
      ${f.subject ? sql`AND l.published -> 'subjects' ? ${f.subject}` : sql``}
      ${f.grade ? sql`AND l.published -> 'grades' @> ${sql.json([f.grade])}` : sql``}
      ${f.curriculum ? sql`AND l.published -> 'curricula' ? ${f.curriculum}` : sql``}
      ${f.minExperience ? sql`AND (l.published ->> 'experienceYears')::int >= ${f.minExperience}` : sql``}
      ${f.name ? sql`AND l.published ->> 'name' ILIKE ${`%${escapeLike(f.name)}%`}` : sql``}
    ORDER BY ${
      f.sort === 'experience'
        ? sql`(l.published ->> 'experienceYears')::int DESC NULLS LAST, l.published_at DESC`
        : sql`l.published_at DESC`
    }, l.public_id
    LIMIT ${pageSize + 1} OFFSET ${offset}`;
  return { listings: rows.slice(0, pageSize).map(toPublic), more: rows.length > pageSize };
}

/** One public listing by its public address, or null (paused, ended, not eligible, unknown). */
export async function getPublicListing(
  sql: Db,
  publicId: string,
  now: Date = new Date(),
): Promise<PublicListing | null> {
  if (!/^t-[a-z0-9]{10}$/.test(publicId)) return null;
  const [row] = await sql<Row[]>`
    SELECT l.public_id, l.published,
           EXISTS (SELECT 1 FROM teacher_photos p
                   WHERE p.teacher_id = l.teacher_id AND p.status = 'approved'
                     AND p.id::text = l.published ->> 'photoId') AS photo_ok
    FROM teacher_listings l
    JOIN accounts a ON a.id = l.teacher_id
    JOIN teacher_profiles t ON t.account_id = a.id
    WHERE l.public_id = ${publicId} AND l.status = 'published' AND l.expires_at > ${now}
      AND a.status = 'active' AND t.approval_status = 'approved'`;
  return row ? toPublic(row) : null;
}

/** An approved photo that a teacher agreed to show on a listing anyone can see now, or null. */
export async function readPublicPhoto(sql: Db, photoId: string, now: Date = new Date()): Promise<Buffer | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoId)) return null;
  const [row] = await sql<Array<{ image: Buffer }>>`
    SELECT p.image FROM teacher_photos p
    JOIN teacher_listings l ON l.teacher_id = p.teacher_id
    JOIN accounts a ON a.id = l.teacher_id
    JOIN teacher_profiles t ON t.account_id = a.id
    WHERE p.id = ${photoId} AND p.status = 'approved'
      AND l.status = 'published' AND l.expires_at > ${now} AND l.published ->> 'photoId' = ${photoId}
      AND a.status = 'active' AND t.approval_status = 'approved'`;
  return row?.image ?? null;
}
