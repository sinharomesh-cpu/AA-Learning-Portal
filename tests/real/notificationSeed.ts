import { createHash, randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import postgres from 'postgres';

/**
 * CR-16 N2 browser tests: synthetic accounts and records written straight into the throwaway
 * test database (the same one the dev server uses; `npm run test:e2e:real` sets DATABASE_URL).
 * Everything is made up. Notifications are inserted exactly as the server's notify() helper
 * stores them; the business events themselves are covered by the database tests (N1).
 */

export type Sql = postgres.Sql<Record<string, unknown>>;
export const SEED_PHRASE = ['bells', 'ring', 'for', 'every', 'reader'].join(' ');
const CHILD_PHRASE = ['kites', 'fly', 'high'].join('-');

const hex = () => randomBytes(4).toString('hex');
let pool: Sql | null = null;

export function seedDb(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (run with npm run test:e2e:real).');
  pool ??= postgres(url, { max: 3, onnotice: () => {} });
  return pool;
}

let phraseHash: Promise<string> | null = null;
let childHash: Promise<string> | null = null;
const ARGON = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const adultHash = () => (phraseHash ??= hash(SEED_PHRASE, ARGON));
const kidHash = () => (childHash ??= hash(CHILD_PHRASE, ARGON));

let decider: Promise<string> | null = null;
/** An Admin account that "decided" seeded teacher approvals (never signs in). */
function deciderId(sql: Sql): Promise<string> {
  decider ??= (async () => {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name, email_verified_at)
      VALUES ('admin', 'active', ${`n2-decider-${hex()}@example.com`}, 'Seed Decider', now()) RETURNING id`;
    return row!.id;
  })();
  return decider;
}

export interface Adult {
  id: string;
  email: string;
  name: string;
}

export async function seedParent(sql: Sql, first = `Anita${hex()}`): Promise<Adult> {
  const email = `n2-parent-${hex()}@example.com`;
  const name = `${first} Sample`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone, email_verified_at)
    VALUES ('parent', 'active', ${email}, ${name}, ${await adultHash()}, 'Asia/Kolkata', now()) RETURNING id`;
  return { id: row!.id, email, name };
}

export type Approval = 'approved' | 'draft' | 'submitted' | 'changes_requested' | 'rejected';

/** A teacher: approved and active, awaiting approval (draft / submitted / changes requested) or not approved. */
export async function seedTeacher(sql: Sql, approval: Approval = 'approved'): Promise<Adult> {
  const email = `n2-teacher-${hex()}@example.com`;
  const name = `Seeded Tutor ${hex()}`;
  const status = approval === 'approved' ? 'active' : 'pending_approval';
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash, time_zone, email_verified_at)
    VALUES ('teacher', ${status}, ${email}, ${name}, ${await adultHash()}, 'Asia/Kolkata', now()) RETURNING id`;
  const id = row!.id;
  const decided = ['approved', 'changes_requested', 'rejected'].includes(approval);
  await sql`
    INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, bio, decided_by, decided_at,
                                  submitted_at, curricula, experience_years)
    VALUES (${id}, 'self_registered', ${approval}, ${['maths', 'science']}, ${[4, 5, 6]}, 'A short bio.',
            ${decided ? await deciderId(sql) : null}, ${decided ? new Date() : null},
            ${approval === 'draft' ? null : new Date()}, ${['CBSE']}, ${5})`;
  return { id, email, name };
}

export interface Child {
  id: string;
  username: string;
  name: string;
  password: string;
}

export async function seedChild(sql: Sql, parentId: string, first = `Kiran${hex()}`): Promise<Child> {
  const username = `kid${hex()}-${1000 + Math.floor(Math.random() * 9000)}`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, username, display_name, password_hash, time_zone)
    VALUES ('student', 'active', ${username}, ${first}, ${await kidHash()}, 'Asia/Kolkata') RETURNING id`;
  const id = row!.id;
  await sql`INSERT INTO student_profiles (account_id, grade, subjects, curriculum)
            VALUES (${id}, 5, ${['maths', 'science']}, 'CBSE')`;
  await sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${parentId}, ${id})`;
  return { id, username, name: first, password: CHILD_PHRASE };
}

/** A waiting link request (CR-12) from the parent for the child. */
export async function seedLinkRequest(
  sql: Sql,
  teacher: string,
  child: string,
  parent: string,
  expiresAt: Date = new Date(Date.now() + 14 * 86_400_000),
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects,
                                       requested_at, expires_at)
    VALUES (${teacher}, ${child}, ${parent}, 'parent_added', 'requested', ${['maths']}, now(), ${expiresAt})
    RETURNING id`;
  return row!.id;
}

/** An accepted teacher–child link. */
export async function seedActiveLink(sql: Sql, teacher: string, child: string, parent: string): Promise<string> {
  const id = await seedLinkRequest(sql, teacher, child, parent);
  await sql`UPDATE teacher_student_links SET status = 'active', answered_at = now() WHERE id = ${id}`;
  return id;
}

/** A waiting enquiry from the parent to the teacher, expiring at `expiresAt` (default 14 days). */
export async function seedEnquiry(
  sql: Sql,
  parent: string,
  teacher: string,
  expiresAt: Date = new Date(Date.now() + 14 * 86_400_000),
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO teacher_enquiries (parent_id, teacher_id, stated_grade, stated_curriculum, subjects, sent_at, expires_at)
    VALUES (${parent}, ${teacher}, 5, 'CBSE', ${['maths']}, now(), ${expiresAt}) RETURNING id`;
  return row!.id;
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');

/** A worksheet the (linked) teacher shared with the child (CR-07). */
export async function seedShare(sql: Sql, teacher: string, child: string, title = 'Fractions'): Promise<string> {
  const [file] = await sql<{ id: string }[]>`
    INSERT INTO stored_files (owner_id, purpose, media_type, byte_size, sha256, file_name, body)
    VALUES (${teacher}, 'teacher_resource', 'application/pdf', ${PDF.length},
            ${createHash('sha256').update(PDF).digest()}, 'Worksheet.pdf', ${PDF}) RETURNING id`;
  const [res] = await sql<{ id: string }[]>`
    INSERT INTO teacher_resources (teacher_id, file_id, title, subject, chapter)
    VALUES (${teacher}, ${file!.id}, ${title}, 'maths', 'Chapter 1') RETURNING id`;
  const [share] = await sql<{ id: string }[]>`
    INSERT INTO resource_shares (resource_id, student_id) VALUES (${res!.id}, ${child}) RETURNING id`;
  return share!.id;
}

export interface NoteInput {
  kind?: 'action' | 'update' | 'reminder';
  type?: string;
  title: string;
  body?: string;
  href: string;
  entityType:
    | 'enquiry'
    | 'link_request'
    | 'rate_proposal'
    | 'resource_share'
    | 'listing'
    | 'learning_package'
    | 'teacher_profile';
  entityId: string;
  createdAt?: Date;
  read?: boolean;
}

/** One notification, stored as notify() stores it (unique event key, internal link). */
export async function seedNote(sql: Sql, recipient: string, n: NoteInput): Promise<string> {
  const created = n.createdAt ?? new Date();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO notifications (recipient_id, kind, type, title, body, href, entity_type, entity_id, dedupe_key,
                               created_at, read_at)
    VALUES (${recipient}, ${n.kind ?? 'update'}, ${n.type ?? 'seeded_update'}, ${n.title}, ${n.body ?? ''}, ${n.href},
            ${n.entityType}, ${n.entityId}, ${`seed:${hex()}${hex()}:${recipient}`}, ${created},
            ${n.read ? created : null})
    RETURNING id`;
  return row!.id;
}

/** `count` notifications "Update 1" (newest) … "Update count" (oldest), one minute apart. */
export async function seedMany(
  sql: Sql,
  recipient: string,
  count: number,
  base: Omit<NoteInput, 'title' | 'createdAt'>,
  start: Date = new Date(),
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    ids.push(
      await seedNote(sql, recipient, {
        ...base,
        title: `Update ${i}`,
        createdAt: new Date(start.getTime() - i * 60_000),
      }),
    );
  }
  return ids;
}

export async function unreadOf(sql: Sql, recipient: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM notifications WHERE recipient_id = ${recipient} AND read_at IS NULL`;
  return r!.n;
}

export async function readAtOf(sql: Sql, id: string): Promise<Date | null> {
  const [r] = await sql<{ read_at: Date | null }[]>`SELECT read_at FROM notifications WHERE id = ${id}`;
  return r!.read_at;
}

/** A waiting hourly rate proposal (CR-13): the parent's first offer, the teacher's turn. */
export async function seedRateProposal(
  sql: Sql,
  parent: string,
  teacher: string,
  expiresAt: Date = new Date(Date.now() + 14 * 86_400_000),
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO rate_negotiations (parent_id, teacher_id, listing_public_id, child_key, grade, curriculum, subject,
                                   model, currency, asking_amount_minor, asking_minutes, status, turn, offers,
                                   expires_at)
    VALUES (${parent}, ${teacher}, ${`t-${hex()}ab`}, ${`grade:5:CBSE:${hex()}`}, 5, 'CBSE', 'maths', 'hourly', 'INR',
            60000, 40, 'pending', 'teacher', 1, ${expiresAt})
    RETURNING id`;
  await sql`INSERT INTO rate_offers (negotiation_id, seq, made_by, amount_minor, minutes)
            VALUES (${row!.id}, 1, 'parent', 55000, 40)`;
  return row!.id;
}

/** Holds the shared sweep inside its minute (§7.5): it may not run for 60 s from now. */
export async function holdSharedSweep(sql: Sql): Promise<Date> {
  const [r] = await sql<{ t: Date }[]>`
    UPDATE notification_throttles SET last_run_at = now() WHERE name = 'shared_sweep' RETURNING last_run_at AS t`;
  return r!.t;
}

export async function sharedSweepAt(sql: Sql): Promise<Date> {
  const [r] = await sql<{ t: Date }[]>`SELECT last_run_at AS t FROM notification_throttles WHERE name = 'shared_sweep'`;
  return r!.t;
}
