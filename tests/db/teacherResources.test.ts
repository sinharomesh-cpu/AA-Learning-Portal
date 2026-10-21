import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PIECE_BYTES, stagePiece } from '@/server/files/pieces';
import { mayReadFile, readFileForViewer } from '@/server/files/store';
import {
  editResource,
  listOwnResources,
  listResourcesForParent,
  listResourcesForStudent,
  purgeArchivedResources,
  setArchived,
  shareNewResource,
  shareOptions,
  shareWithMore,
  unshareResource,
} from '@/server/teacherResources';
import { activeLink, createAdult, createChild, testDb, uniq } from './helpers';

/** CR-07 H-2b: teacher-shared resources (T-R1 to T-R5, file access, FR-027.2). */
const sql = testDb();
afterAll(() => sql.end());

const T0 = new Date('2026-10-23T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');

async function teacher(name = 'Teacher A. Rao') {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', 'active', ${`t-${uniq()}@example.com`}, ${name}, 'x') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${row!.id}, 'self_registered', 'approved', ${['maths', 'science']}, ${[4, 5]}, ${owner}, now())`;
  return row!.id;
}

/** A family with one child who studies maths and science. */
async function family(childName = 'Kiran') {
  const parent = await createAdult(sql, 'parent');
  const child = await createChild(sql, parent);
  await sql`UPDATE student_profiles SET subjects = ${['maths', 'science']} WHERE account_id = ${child}`;
  await sql`UPDATE accounts SET display_name = ${childName} WHERE id = ${child}`;
  return { parent, child };
}

async function link(teacherId: string, f: { parent: string; child: string }, subjects: string[]) {
  await activeLink(sql, { teacher: teacherId, child: f.child, parent: f.parent, subjects });
}

async function upload(owner: string) {
  const uploadId = randomUUID();
  const r = await stagePiece(
    sql,
    owner,
    { uploadId, part: 0, total: 1, fileName: 'Leaf worksheet.pdf', bytes: pdf },
    T0,
  );
  if (!r.ok) throw new Error(r.reason);
  return uploadId;
}

async function share(teacherId: string, students: string[], subject = 'science', extra: Record<string, unknown> = {}) {
  return shareNewResource(
    sql,
    teacherId,
    {
      uploadId: await upload(teacherId),
      title: 'Leaf diagram worksheet',
      subject,
      chapter: 'Chapter 2',
      studentIds: students,
      ...extra,
    },
    T0,
  );
}

async function sharedSetup() {
  const t = await teacher();
  const kiran = await family('Kiran');
  const meera = await family('Meera');
  await link(t, kiran, ['science']);
  await link(t, meera, ['science', 'maths']);
  const r = await share(t, [kiran.child, meera.child]);
  if (!r.ok) throw new Error(r.reason);
  const [res] = await listOwnResources(sql, t, T0);
  return { t, kiran, meera, resourceId: r.resourceId, fileId: res!.fileId };
}

describe('sharing (T-R1, T-R2)', () => {
  it('a teacher shares with linked students; they and their parents see it straight away', async () => {
    const { t, kiran, meera, fileId } = await sharedSetup();
    for (const who of [kiran.child, meera.child]) {
      const [item] = await listResourcesForStudent(sql, who);
      expect(item).toMatchObject({
        title: 'Leaf diagram worksheet',
        subject: 'science',
        chapter: 'Chapter 2',
        teacherName: 'Teacher A. Rao',
        fromCurrentTeacher: true,
        mediaType: 'application/pdf',
      });
      expect((await readFileForViewer(sql, who, fileId, T0))?.body.equals(pdf)).toBe(true);
    }
    const [forParent] = await listResourcesForParent(sql, kiran.parent);
    expect(forParent!.children.map((c) => c.name)).toEqual(['Kiran']);
    expect(await mayReadFile(sql, kiran.parent, fileId)).not.toBeNull();
    const [own] = await listOwnResources(sql, t, T0);
    expect(own!.sharedWith.map((s) => s.name)).toEqual(['Kiran', 'Meera']);
  });

  it('only in a subject the parent ticked for that link (OC-87 Q-1)', async () => {
    const t = await teacher();
    const kiran = await family();
    await link(t, kiran, ['science']);
    expect(await share(t, [kiran.child], 'maths')).toEqual({ ok: false, reason: 'not_linked' });
    // Nothing was stored for the refused share, and no quota was used.
    const [n] = await sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM stored_files WHERE owner_id = ${t}`;
    expect(n!.n).toBe(0);
  });

  it('never with an unlinked student, a pending link, or as an unapproved teacher', async () => {
    const t = await teacher();
    const stranger = await family();
    expect(await share(t, [stranger.child])).toEqual({ ok: false, reason: 'not_linked' });
    const pending = await family();
    await sql`INSERT INTO teacher_student_links (teacher_id, student_id, created_by_parent_id, source, status, subjects)
              VALUES (${t}, ${pending.child}, ${pending.parent}, 'parent_added', 'pending', ${['science']})`;
    expect(await share(t, [pending.child])).toEqual({ ok: false, reason: 'not_linked' });
    const waiting = await createAdult(sql, 'teacher');
    expect(
      await shareNewResource(
        sql,
        waiting,
        { uploadId: randomUUID(), title: 'x', subject: 'science', studentIds: [pending.child] },
        T0,
      ),
    ).toEqual({ ok: false, reason: 'not_allowed' });
  });

  it('checks the details: title, subject, lengths, students', async () => {
    const t = await teacher();
    const kiran = await family();
    await link(t, kiran, ['science']);
    for (const bad of [
      { title: '' },
      { title: 'x'.repeat(121) },
      { subject: 'art' },
      { chapter: 'c'.repeat(121) },
      { note: 'n'.repeat(1001) },
    ]) {
      expect(await share(t, [kiran.child], 'science', bad)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(await share(t, [])).toEqual({ ok: false, reason: 'invalid' });
    expect(await share(t, ['not-an-id'])).toEqual({ ok: false, reason: 'invalid' });
  });

  it('the database refuses a share without an active link in the subject', async () => {
    const { t, resourceId } = await sharedSetup();
    const stranger = await family();
    await expect(
      sql`INSERT INTO resource_shares (resource_id, student_id) VALUES (${resourceId}, ${stranger.child})`,
    ).rejects.toThrow(/not linked to this teacher/);
    expect(t).toBeTruthy();
  });

  it('shares with more linked students later', async () => {
    const t = await teacher();
    const kiran = await family('Kiran');
    const meera = await family('Meera');
    await link(t, kiran, ['science']);
    await link(t, meera, ['science']);
    const r = await share(t, [kiran.child]);
    if (!r.ok) throw new Error(r.reason);
    expect(await listResourcesForStudent(sql, meera.child)).toHaveLength(0);
    expect(await shareWithMore(sql, t, r.resourceId, [meera.child], T0)).toEqual({ ok: true });
    expect(await listResourcesForStudent(sql, meera.child)).toHaveLength(1);
  });
});

describe('nobody else (T-R3)', () => {
  it('another family, another teacher, Admins and the Super Admin get "not found"', async () => {
    const { fileId } = await sharedSetup();
    const other = await family();
    const [admin] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name) VALUES ('admin', 'active', ${`a-${uniq()}@example.com`}, 'A') RETURNING id`;
    for (const who of [
      other.parent,
      other.child,
      await teacher('Other Teacher'),
      admin!.id,
      await createAdult(sql, 'superadmin'),
    ]) {
      expect(await mayReadFile(sql, who, fileId)).toBeNull();
      expect(await listResourcesForStudent(sql, who)).toEqual([]);
      expect(await listResourcesForParent(sql, who)).toEqual([]);
    }
  });

  it('a teacher cannot change another teacher’s resource', async () => {
    const { resourceId, kiran } = await sharedSetup();
    const other = await teacher('Other Teacher');
    expect(await editResource(sql, other, resourceId, { title: 'Mine now' }, T0)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await unshareResource(sql, other, resourceId, kiran.child, T0)).toEqual({ ok: false, reason: 'not_found' });
    expect(await setArchived(sql, other, resourceId, true, T0)).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('changing and removing (T-R4, T-R5)', () => {
  it('stop sharing with one student: gone at once for them and their parent only', async () => {
    const { t, kiran, meera, resourceId, fileId } = await sharedSetup();
    expect(await unshareResource(sql, t, resourceId, kiran.child, T0)).toEqual({ ok: true });
    expect(await listResourcesForStudent(sql, kiran.child)).toEqual([]);
    expect(await mayReadFile(sql, kiran.child, fileId)).toBeNull();
    expect(await mayReadFile(sql, kiran.parent, fileId)).toBeNull();
    expect(await listResourcesForStudent(sql, meera.child)).toHaveLength(1);
  });

  it('renaming keeps the subject', async () => {
    const { t, kiran, resourceId } = await sharedSetup();
    expect(
      await editResource(
        sql,
        t,
        resourceId,
        { title: 'Leaf worksheet (new)', chapter: '', note: 'Read pages 14 to 16.' },
        T0,
      ),
    ).toEqual({ ok: true });
    const [item] = await listResourcesForStudent(sql, kiran.child);
    expect(item).toMatchObject({
      title: 'Leaf worksheet (new)',
      chapter: null,
      note: 'Read pages 14 to 16.',
      subject: 'science',
    });
  });

  it('delete hides it, restore brings it back; after 30 days it is removed with its file', async () => {
    const { t, kiran, resourceId, fileId } = await sharedSetup();
    expect(await setArchived(sql, t, resourceId, true, T0)).toEqual({ ok: true });
    expect(await listResourcesForStudent(sql, kiran.child)).toEqual([]);
    expect(await mayReadFile(sql, kiran.child, fileId)).toBeNull();
    const [archived] = await listOwnResources(sql, t, T0);
    expect(archived!.removeOn).toEqual(new Date(T0.getTime() + 30 * DAY));
    expect(await setArchived(sql, t, resourceId, false, T0)).toEqual({ ok: true });
    expect(await listResourcesForStudent(sql, kiran.child)).toHaveLength(1);

    expect(await setArchived(sql, t, resourceId, true, T0)).toEqual({ ok: true });
    expect(await purgeArchivedResources(sql, new Date(T0.getTime() + 29 * DAY))).toBe(0);
    expect(await listOwnResources(sql, t, new Date(T0.getTime() + 31 * DAY))).toEqual([]);
    const [file] = await sql<Array<{ body: Buffer | null; deleted_at: Date | null }>>`
      SELECT body, deleted_at FROM stored_files WHERE id = ${fileId}`;
    expect(file!.body).toBeNull();
    expect(file!.deleted_at).not.toBeNull();
  });
});

describe('after a parent removes the teacher (FR-027.2, OC-87 Q-5)', () => {
  it('the child keeps what was shared, marked as from a former teacher; the teacher cannot share more', async () => {
    const { t, kiran, resourceId, fileId } = await sharedSetup();
    await sql`UPDATE teacher_student_links SET status = 'removed', removed_at = now() WHERE teacher_id = ${t} AND student_id = ${kiran.child}`;
    const [item] = await listResourcesForStudent(sql, kiran.child);
    expect(item).toMatchObject({ fromCurrentTeacher: false });
    expect(await mayReadFile(sql, kiran.child, fileId)).not.toBeNull();
    expect(await share(t, [kiran.child])).toEqual({ ok: false, reason: 'not_linked' });
    expect(await unshareResource(sql, t, resourceId, kiran.child, T0)).toEqual({ ok: true });
    expect(await shareWithMore(sql, t, resourceId, [kiran.child], T0)).toEqual({ ok: false, reason: 'not_linked' });
    expect((await shareOptions(sql, t)).map((s) => s.studentId)).not.toContain(kiran.child);
  });
});

describe('type label (CR-17 PR 4)', () => {
  it('defaults to "other", can be set and changed, and refuses unknown types', async () => {
    const t = await teacher();
    const kiran = await family();
    await link(t, kiran, ['science']);
    const plain = await share(t, [kiran.child]);
    const notes = await share(t, [kiran.child], 'science', { resourceType: 'notes' });
    if (!plain.ok || !notes.ok) throw new Error('setup');
    expect(await share(t, [kiran.child], 'science', { resourceType: 'video' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    const types = Object.fromEntries((await listOwnResources(sql, t, T0)).map((r) => [r.id, r.resourceType]));
    expect(types).toEqual({ [plain.resourceId]: 'other', [notes.resourceId]: 'notes' });
    expect(await editResource(sql, t, plain.resourceId, { title: 'Slides', resourceType: 'slides' }, T0)).toEqual({
      ok: true,
    });
    const shown = await listResourcesForStudent(sql, kiran.child);
    expect(shown.find((r) => r.id === plain.resourceId)?.resourceType).toBe('slides');
  });
});

describe('share options', () => {
  it('lists only actively linked students with their ticked subjects', async () => {
    const t = await teacher();
    const kiran = await family('Kiran');
    await link(t, kiran, ['science']);
    expect(await shareOptions(sql, t)).toEqual([
      { studentId: kiran.child, name: 'Kiran', grade: 5, subjects: ['science'] },
    ]);
    expect(PIECE_BYTES).toBeGreaterThan(0);
  });
});
