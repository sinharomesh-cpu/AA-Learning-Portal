import { afterAll, describe, expect, it } from 'vitest';
import { createAdult, createChild, testDb, uniq } from './helpers';

/** WP2-1: the database itself refuses data that breaks the approved rules. */
const sql = testDb();
afterAll(() => sql.end());

describe('accounts', () => {
  it('a child has a username and never an email (OC-35)', async () => {
    await expect(
      sql`INSERT INTO accounts (role, status, email, username, display_name)
          VALUES ('student', 'active', ${`c${uniq()}@example.com`}, ${`kid${uniq()}-1234`}, 'Child')`,
    ).rejects.toThrow(/accounts_identity_by_role/);
    await expect(
      sql`INSERT INTO accounts (role, status, display_name) VALUES ('student', 'active', 'Child')`,
    ).rejects.toThrow(/accounts_identity_by_role/);
  });

  it('an adult has an email and no username', async () => {
    await expect(
      sql`INSERT INTO accounts (role, status, username, display_name) VALUES ('parent', 'active', ${`p${uniq()}-1234`}, 'P')`,
    ).rejects.toThrow(/accounts_identity_by_role/);
  });

  it('emails are stored in lower case and are unique', async () => {
    const email = `dup-${uniq()}@example.com`;
    await expect(
      sql`INSERT INTO accounts (role, status, email, display_name) VALUES ('parent', 'active', ${email.toUpperCase()}, 'P')`,
    ).rejects.toThrow(/accounts_email_shape/);
    await sql`INSERT INTO accounts (role, status, email, display_name) VALUES ('parent', 'active', ${email}, 'P')`;
    await expect(
      sql`INSERT INTO accounts (role, status, email, display_name) VALUES ('teacher', 'active', ${email}, 'T')`,
    ).rejects.toThrow(/accounts_email_unique/);
  });

  it('child usernames are a lower-case name plus a 4-digit suffix', async () => {
    for (const bad of ['Kiran-1234', 'kiran', 'kiran-12', 'kiran smith-1234']) {
      await expect(
        sql`INSERT INTO accounts (role, status, username, display_name) VALUES ('student', 'active', ${bad}, 'C')`,
      ).rejects.toThrow(/accounts_username_shape/);
    }
  });

  it('only known roles and statuses are accepted', async () => {
    await expect(
      sql`INSERT INTO accounts (role, status, email, display_name) VALUES ('owner', 'active', ${`x${uniq()}@example.com`}, 'X')`,
    ).rejects.toThrow(/accounts_role_check/);
    await expect(
      sql`INSERT INTO accounts (role, status, email, display_name) VALUES ('parent', 'enabled', ${`x${uniq()}@example.com`}, 'X')`,
    ).rejects.toThrow(/accounts_status_check/);
  });
});

describe('profiles', () => {
  it('only the six approved subjects are accepted', async () => {
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    await expect(
      sql`UPDATE student_profiles SET subjects = ${['maths', 'art']} WHERE account_id = ${child}`,
    ).rejects.toThrow(/student_profiles_subjects_check/);
  });

  it('a student profile must belong to a student account', async () => {
    const parent = await createAdult(sql, 'parent');
    await expect(sql`INSERT INTO student_profiles (account_id, grade) VALUES (${parent}, 4)`).rejects.toThrow(
      /is not a student/,
    );
  });

  it('a teacher decision must be made by the Super Admin or an Admin', async () => {
    const teacher = await createAdult(sql, 'teacher', 'pending_approval');
    const parent = await createAdult(sql, 'parent');
    await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, submitted_at)
              VALUES (${teacher}, 'self_registered', 'submitted', now())`;
    await expect(
      sql`UPDATE teacher_profiles SET approval_status = 'approved', decided_by = ${parent}, decided_at = now()
          WHERE account_id = ${teacher}`,
    ).rejects.toThrow(/is not an admin/);
    await expect(
      sql`UPDATE teacher_profiles SET approval_status = 'approved' WHERE account_id = ${teacher}`,
    ).rejects.toThrow(/teacher_profiles_decision/);
    const admin = await createAdult(sql, 'superadmin');
    await sql`UPDATE teacher_profiles SET approval_status = 'approved', decided_by = ${admin}, decided_at = now()
              WHERE account_id = ${teacher}`;
  });

  it('a self-registered teacher has no adding parent (OC-38)', async () => {
    const teacher = await createAdult(sql, 'teacher', 'pending_approval');
    const parent = await createAdult(sql, 'parent');
    await expect(
      sql`INSERT INTO teacher_profiles (account_id, origin, added_by_parent_id)
          VALUES (${teacher}, 'self_registered', ${parent})`,
    ).rejects.toThrow(/teacher_profiles_origin_parent/);
  });
});

describe('relationships', () => {
  it('a guardian link joins a parent to a student only', async () => {
    const parent = await createAdult(sql, 'parent');
    const teacher = await createAdult(sql, 'teacher');
    const child = await createChild(sql, parent);
    await expect(sql`INSERT INTO guardian_links (parent_id, student_id) VALUES (${teacher}, ${child})`).rejects.toThrow(
      /is not a parent/,
    );
  });

  it('a teacher can be linked to a child only by that child’s own parent (OC-36)', async () => {
    const parent = await createAdult(sql, 'parent');
    const otherParent = await createAdult(sql, 'parent');
    const teacher = await createAdult(sql, 'teacher');
    const child = await createChild(sql, parent);
    await expect(
      sql`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status)
          VALUES (${teacher}, ${child}, ${otherParent}, 'parent_added', 'pending')`,
    ).rejects.toThrow(/not a guardian of this child/);
    await sql`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
              VALUES (${teacher}, ${child}, ${parent}, 'parent_added', 'pending', ${['maths']})`;
  });

  it('there is at most one live link per teacher and child', async () => {
    const parent = await createAdult(sql, 'parent');
    const teacher = await createAdult(sql, 'teacher');
    const child = await createChild(sql, parent);
    const insert = () =>
      sql`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
          VALUES (${teacher}, ${child}, ${parent}, 'parent_added', 'active', ${['maths']})`;
    await insert();
    await expect(insert()).rejects.toThrow(/teacher_student_links_live/);
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now()
              WHERE teacher_id = ${teacher} AND student_id = ${child}`;
    await insert(); // a removed link may be re-created later by the parent
  });

  it('a teacher link names at least one subject, all among the child’s subjects (OC-41)', async () => {
    const parent = await createAdult(sql, 'parent');
    const teacher = await createAdult(sql, 'teacher');
    const child = await createChild(sql, parent); // studies maths only
    const link = (subjects: string[]) =>
      sql`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
          VALUES (${teacher}, ${child}, ${parent}, 'parent_added', 'active', ${subjects})`;
    await expect(link([])).rejects.toThrow(/teacher_student_links_subjects_present/);
    await expect(link(['science'])).rejects.toThrow(/among the child's subjects/);
    await expect(link(['art'])).rejects.toThrow(/among the child's subjects|teacher_student_links_subjects_check/);
    await link(['maths']);
  });

  it('a revoked guardian link records when it ended', async () => {
    const parent = await createAdult(sql, 'parent');
    const child = await createChild(sql, parent);
    await expect(
      sql`UPDATE guardian_links SET status = 'revoked' WHERE parent_id = ${parent} AND student_id = ${child}`,
    ).rejects.toThrow(/guardian_links_check/);
  });
});

describe('security tables', () => {
  it('the audit log is append-only (OC-21)', async () => {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO audit_events (event_type, outcome, details) VALUES ('TEST_EVENT', 'success', '{}') RETURNING id`;
    await expect(sql`UPDATE audit_events SET outcome = 'failure' WHERE id = ${row!.id}`).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM audit_events WHERE id = ${row!.id}`).rejects.toThrow(/append-only/);
    await expect(sql`TRUNCATE audit_events`).rejects.toThrow(/append-only/);
  });

  it('tokens and session ids are stored only as 32-byte hashes', async () => {
    const parent = await createAdult(sql, 'parent');
    await expect(
      sql`INSERT INTO one_time_tokens (account_id, purpose, token_hash, expires_at)
          VALUES (${parent}, 'password_reset', ${Buffer.from('plain-token')}, now() + interval '30 minutes')`,
    ).rejects.toThrow(/one_time_tokens_token_hash_check/);
    await expect(
      sql`INSERT INTO sessions (id_hash, account_id, credential_version, idle_expires_at, absolute_expires_at)
          VALUES (${Buffer.from('short')}, ${parent}, 1, now(), now())`,
    ).rejects.toThrow(/sessions_id_hash_check/);
  });

  it('the same email cannot be queued twice (duplicate prevention)', async () => {
    const key = `test:${uniq()}`;
    const insert = () =>
      sql`INSERT INTO email_outbox (to_address, template, dedupe_key) VALUES ('t@example.com', 'test_mail', ${key})`;
    await insert();
    await expect(insert()).rejects.toThrow(/email_outbox_dedupe_key_key/);
  });
});
