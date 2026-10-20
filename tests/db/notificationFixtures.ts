import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { type ListingPrice, snapshotKey } from '@/lib/listing';
import { stagePiece } from '@/server/files/pieces';
import { proposeRate, type ProposalInput, setRateNegotiation } from '@/server/rateNegotiations';
import { type EnquiryInput, sendEnquiry } from '@/server/teacherEnquiries';
import { addTeacher } from '@/server/teacherLinks';
import { type ListingInput, previewListing, saveListing } from '@/server/teacherListings';
import { shareNewResource } from '@/server/teacherResources';
import { activeLink, createAdult, createChild, type Sql, uniq } from './helpers';

/**
 * Shared synthetic fixtures for the CR-16 notification tests. Every person and record is made
 * up; names carry a random suffix so tests can search responses for them.
 */
export const BASE = 'http://aa.test';
export const DAY = 86_400_000;

export const PRICES: ListingPrice[] = [
  { model: 'hourly', currency: 'INR', amountMinor: 60000, sessions: null, minutes: 40 },
  { model: 'monthly', currency: 'INR', amountMinor: 400000, sessions: 8, minutes: 40 },
];

export interface Teacher {
  id: string;
  email: string;
  name: string;
  publicId: string;
}

/** An approved, active teacher with a published listing open to rate proposals (hourly, monthly). */
export async function teacher(sql: Sql, now: Date, opts: { listing?: boolean } = {}): Promise<Teacher> {
  const name = `Teacher ${uniq()} Sample`;
  const email = `n-teacher-${uniq()}@example.com`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone)
    VALUES ('teacher', 'active', ${email}, ${name}, 'x', 'Asia/Kolkata') RETURNING id`;
  const id = row!.id;
  const owner = await createAdult(sql, 'superadmin');
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at,
                                  submitted_at, curricula, experience_years)
    VALUES (${id}, 'self_registered', 'approved', ${['english', 'maths', 'science']}, ${[4, 5, 6]}, 'A short bio.',
            ${owner}, ${now}, ${now}, ${['CBSE']}, ${5})`;
  let publicId = '';
  if (opts.listing !== false) {
    const input: ListingInput = {
      subjects: ['english', 'maths', 'science'],
      grades: [4, 5, 6],
      curricula: ['CBSE'],
      experienceYears: 5,
      prices: PRICES,
      negotiableModels: ['hourly', 'monthly'],
    };
    const snap = await previewListing(sql, id, input);
    const r = await saveListing(sql, id, { ...input, previewKey: snapshotKey(snap!) }, 'publish', true, now);
    expect(r.ok).toBe(true);
    expect(await setRateNegotiation(sql, id, true, now)).toEqual({ ok: true });
    const [l] = await sql<{ public_id: string }[]>`SELECT public_id FROM teacher_listings WHERE teacher_id = ${id}`;
    publicId = l!.public_id;
  }
  return { id, email, name, publicId };
}

export interface Family {
  parent: string;
  parentEmail: string;
  parentFirst: string;
  child: string;
  childName: string;
}

/** A parent ("Anita…") with one Grade 5 CBSE child studying English, maths and science. */
export async function family(sql: Sql): Promise<Family> {
  const parent = await createAdult(sql, 'parent');
  const parentFirst = `Anita${uniq()}`;
  await sql`UPDATE accounts SET display_name = ${`${parentFirst} Sample`}, time_zone = 'Asia/Kolkata' WHERE id = ${parent}`;
  const child = await createChild(sql, parent);
  const childName = `Kiran${uniq()}`;
  await sql`UPDATE accounts SET display_name = ${childName} WHERE id = ${child}`;
  await sql`UPDATE student_profiles SET subjects = ${['english', 'maths', 'science']}, grade = 5, curriculum = 'CBSE'
            WHERE account_id = ${child}`;
  const [e] = await sql<{ email: string }[]>`SELECT email FROM accounts WHERE id = ${parent}`;
  return { parent, parentEmail: e!.email, parentFirst, child, childName };
}

/** A second guardian for the same child (an active parent). */
export async function secondParent(sql: Sql, child: string): Promise<string> {
  const p = await createAdult(sql, 'parent');
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${p}, ${child})`;
  return p;
}

export async function enquire(sql: Sql, t: Teacher, f: Family, now: Date, over: Partial<EnquiryInput> = {}) {
  const r = await sendEnquiry(
    sql,
    f.parent,
    {
      publicId: t.publicId,
      childId: f.child,
      grade: null,
      curriculum: null,
      subjects: ['maths'],
      times: [],
      priceIndex: null,
      message: '',
      ...over,
    },
    BASE,
    now,
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.id;
}

export async function propose(sql: Sql, t: Teacher, f: Family, now: Date, over: Partial<ProposalInput> = {}) {
  const r = await proposeRate(
    sql,
    f.parent,
    {
      publicId: t.publicId,
      priceIndex: 1, // monthly
      childId: f.child,
      grade: null,
      curriculum: null,
      subject: 'maths',
      amount: '3,400',
      sessions: 8,
      minutes: 40,
      message: '',
      ...over,
    },
    BASE,
    now,
  );
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.id;
}

/** A link request from this family's parent to an approved teacher (reaches the teacher at once). */
export async function requestLink(sql: Sql, t: Teacher, f: Family, now: Date, subjects = ['maths']) {
  const r = await addTeacher(
    sql,
    f.parent,
    { name: 'Sample', email: t.email, children: [{ childId: f.child, subjects }], baseUrl: BASE },
    now,
  );
  expect(r).toMatchObject({ ok: true, outcome: 'sent' });
  const [l] = await sql<{ id: string }[]>`
    SELECT id FROM teacher_student_links WHERE teacher_id = ${t.id} AND student_id = ${f.child} AND status = 'requested'`;
  return l!.id;
}

export async function link(sql: Sql, t: Teacher, f: Family, subjects = ['maths', 'science']) {
  return activeLink(sql, { teacher: t.id, child: f.child, parent: f.parent, subjects });
}

const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');

/** Shares a new worksheet with these (linked) students. */
export async function shareWorksheet(sql: Sql, t: Teacher, students: string[], now: Date, title = 'Fractions') {
  const uploadId = randomUUID();
  const staged = await stagePiece(
    sql,
    t.id,
    { uploadId, part: 0, total: 1, fileName: 'Worksheet.pdf', bytes: pdf },
    now,
  );
  if (!staged.ok) throw new Error(staged.reason);
  const r = await shareNewResource(
    sql,
    t.id,
    { uploadId, title, subject: 'maths', chapter: 'Chapter 1', studentIds: students },
    now,
  );
  if (!r.ok) throw new Error(r.reason);
  return r.resourceId;
}

export interface Row {
  id: string;
  recipient_id: string;
  kind: string;
  type: string;
  title: string;
  body: string;
  href: string;
  entity_type: string;
  entity_id: string;
  offer_seq: number | null;
  dedupe_key: string;
  created_at: Date;
  read_at: Date | null;
}

/** Notifications about one record (any recipient). */
export async function notesFor(sql: Sql, entityId: string): Promise<Row[]> {
  return sql<Row[]>`SELECT * FROM notifications WHERE entity_id = ${entityId} ORDER BY created_at, dedupe_key`;
}

/** Notifications of one recipient. */
export async function notesOf(sql: Sql, recipient: string): Promise<Row[]> {
  return sql<Row[]>`SELECT * FROM notifications WHERE recipient_id = ${recipient} ORDER BY created_at, dedupe_key`;
}

export async function emailsTo(sql: Sql, address: string): Promise<Array<{ template: string; dedupe_key: string }>> {
  return sql<Array<{ template: string; dedupe_key: string }>>`
    SELECT template, dedupe_key FROM email_outbox WHERE to_address = ${address} ORDER BY created_at, dedupe_key`;
}

/** Inserts a notification directly (paging, retention and redaction tests). */
export async function seedNote(
  sql: Sql,
  recipient: string,
  at: Date,
  over: Partial<{ entityType: string; entityId: string; title: string; kind: string; href: string; readAt: Date }> = {},
) {
  const [r] = await sql<{ id: string }[]>`
    INSERT INTO notifications (recipient_id, kind, type, title, body, href, entity_type, entity_id, dedupe_key,
                               created_at, read_at)
    VALUES (${recipient}, ${over.kind ?? 'update'}, 'test_seed', ${over.title ?? 'Seeded'}, '', ${over.href ?? '/parent'},
            ${over.entityType ?? 'teacher_profile'}, ${over.entityId ?? recipient}, ${`seed:${randomUUID()}`}, ${at},
            ${over.readAt ?? null})
    RETURNING id`;
  return r!.id;
}

export { uniq };

/**
 * Makes every notification insert whose key matches the LIKE pattern fail, to test that a failure
 * after the business UPDATE rolls back the transition, the email and the notifications together.
 */
export async function injectFailure(sql: Sql, pattern: string): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS zz_fail_keys (pattern text NOT NULL);
    CREATE OR REPLACE FUNCTION zz_fail_notify() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM zz_fail_keys WHERE NEW.dedupe_key LIKE pattern) THEN
        RAISE EXCEPTION 'injected failure';
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS zz_fail_notify ON notifications;
    CREATE TRIGGER zz_fail_notify BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION zz_fail_notify();`);
  await sql`DELETE FROM zz_fail_keys`;
  await sql`INSERT INTO zz_fail_keys (pattern) VALUES (${pattern})`;
}

export async function clearFailure(sql: Sql): Promise<void> {
  await sql.unsafe(`
    DROP TRIGGER IF EXISTS zz_fail_notify ON notifications;
    DROP FUNCTION IF EXISTS zz_fail_notify();
    DROP TABLE IF EXISTS zz_fail_keys;`);
}

export const resetSweep = (sql: Sql) =>
  sql`UPDATE notification_throttles SET last_run_at = '-infinity' WHERE name = 'shared_sweep'`;
/** Holds the shared sweep inside its minute (as if one had just run). */
export const holdSweep = (sql: Sql) =>
  sql`UPDATE notification_throttles SET last_run_at = now() WHERE name = 'shared_sweep'`;
export async function lastSweep(sql: Sql): Promise<Date> {
  const [r] = await sql<
    { at: Date }[]
  >`SELECT last_run_at AS at FROM notification_throttles WHERE name = 'shared_sweep'`;
  return r!.at;
}
