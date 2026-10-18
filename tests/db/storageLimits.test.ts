import { afterEach, afterAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_STORAGE_SETTINGS,
  getStorageSettings,
  levelFor,
  MB,
  ownUsage,
  type SettingKey,
  storageStatus,
  updateStorageSettings,
} from '@/server/files/limits';
import { removeFile, storeFile } from '@/server/files/store';
import { createAdult, testDb, uniq } from './helpers';

/** OC-96: configurable storage safety limits, enforced on the server. */
const sql = testDb();
afterAll(() => sql.end());

const T0 = new Date('2026-10-21T10:00:00Z');
const MIN = 60_000;
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);
const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');
const notPdf = Buffer.from('<html>not a file we accept</html>');

/** Settings are shared by the whole database: each test puts the defaults back. */
async function setRaw(values: Partial<Record<SettingKey, number>>) {
  for (const [key, value] of Object.entries(values)) {
    await sql`UPDATE platform_settings SET value = ${value as number} WHERE key = ${key}`;
  }
}
afterEach(async () => {
  await setRaw(DEFAULT_STORAGE_SETTINGS);
});

async function teacher() {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO accounts (role, status, email, display_name, password_hash)
    VALUES ('teacher', 'active', ${`t-${uniq()}@example.com`}, 'Teacher Test', 'x') RETURNING id`;
  const owner = await createAdult(sql, 'superadmin');
  await sql`INSERT INTO teacher_profiles (account_id, origin, approval_status, subjects, grades, decided_by, decided_at)
            VALUES (${row!.id}, 'self_registered', 'approved', ${['maths']}, ${[5]}, ${owner}, now())`;
  return row!.id;
}

const upload = (owner: string, now: Date, bytes: Buffer = pdf) =>
  storeFile(sql, owner, 'teacher_resource', bytes, 'Worksheet.pdf', now);

const uploadsCounted = async (owner: string) =>
  (
    await sql<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM rate_events WHERE account_id = ${owner} AND kind = 'file_upload'`
  )[0]!.n;

describe('the settings', () => {
  it('start with the owner-approved defaults (100 uploads a day, 200 MB per account)', async () => {
    expect(await getStorageSettings(sql)).toEqual({
      file_uploads_per_day: 100,
      file_mb_per_account: 200,
      database_allowance_mb: 1024,
      storage_warn_percent: 75,
      storage_stop_percent: 90,
    });
  });

  it('only the Super Admin changes them; every change is audited', async () => {
    const owner = await createAdult(sql, 'superadmin');
    for (const who of [await createAdult(sql, 'parent'), await teacher()]) {
      expect(await updateStorageSettings(sql, who, { file_uploads_per_day: 5 }, T0)).toEqual({
        ok: false,
        reason: 'not_allowed',
      });
    }
    const [admin] = await sql<{ id: string }[]>`
      INSERT INTO accounts (role, status, email, display_name) VALUES ('admin', 'active', ${`a-${uniq()}@example.com`}, 'A')
      RETURNING id`;
    expect(await updateStorageSettings(sql, admin!.id, { file_uploads_per_day: 5 }, T0)).toMatchObject({ ok: false });

    const r = await updateStorageSettings(sql, owner, { file_uploads_per_day: '50', file_mb_per_account: 300 }, T0);
    expect(r).toMatchObject({ ok: true, settings: { file_uploads_per_day: 50, file_mb_per_account: 300 } });
    const events = await sql<Array<{ details: Record<string, unknown> }>>`
      SELECT details FROM audit_events WHERE event_type = 'STORAGE_LIMIT_CHANGED' AND occurred_at = ${T0}
      ORDER BY details->>'setting'`;
    expect(events.map((e) => e.details)).toEqual([
      { setting: 'file_mb_per_account', from: 200, to: 300 },
      { setting: 'file_uploads_per_day', from: 100, to: 50 },
    ]);
  });

  it('refuses values outside the ranges, and a warning level that is not below the stop level', async () => {
    const owner = await createAdult(sql, 'superadmin');
    for (const bad of [{ file_uploads_per_day: 0 }, { file_mb_per_account: 1.5 }, { database_allowance_mb: 'lots' }]) {
      expect(await updateStorageSettings(sql, owner, bad, T0)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(await updateStorageSettings(sql, owner, { storage_warn_percent: 90 }, T0)).toEqual({
      ok: false,
      reason: 'warn_not_below_stop',
    });
    expect(await getStorageSettings(sql)).toEqual(DEFAULT_STORAGE_SETTINGS);
  });
});

describe('uploads per account per day', () => {
  it('follows the setting and says when the next upload is allowed', async () => {
    await setRaw({ file_uploads_per_day: 3 });
    const t = await teacher();
    for (const m of [0, 1, 2]) expect((await upload(t, at(m))).ok).toBe(true);
    expect(await upload(t, at(10))).toEqual({ ok: false, reason: 'daily_limit', limit: 3, nextUploadAt: at(24 * 60) });
    expect((await upload(t, at(24 * 60 - 1))).ok).toBe(false);
    expect((await upload(t, at(24 * 60))).ok).toBe(true);
  });

  it('refused or failed uploads use no quota', async () => {
    await setRaw({ file_uploads_per_day: 2 });
    const t = await teacher();
    expect((await upload(t, at(0))).ok).toBe(true);
    for (let i = 0; i < 5; i += 1) expect(await upload(t, at(1), notPdf)).toEqual({ ok: false, reason: 'type' });
    expect(await uploadsCounted(t)).toBe(1);
    expect((await upload(t, at(2))).ok).toBe(true);
    // Over the limit now: a refusal for the limit itself also adds nothing.
    expect((await upload(t, at(3))).ok).toBe(false);
    expect(await uploadsCounted(t)).toBe(2);
  });

  it('uploads sent at the same moment cannot pass the limit', async () => {
    await setRaw({ file_uploads_per_day: 2 });
    const t = await teacher();
    const results = await Promise.all(Array.from({ length: 6 }, () => upload(t, T0)));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(await uploadsCounted(t)).toBe(2);
  });
});

describe('storage per account', () => {
  /** Records already stored for the account, without bytes (kept "elsewhere"). */
  async function fill(owner: string, bytes: number) {
    await sql`INSERT INTO stored_files (owner_id, purpose, media_type, byte_size, sha256, file_name, storage, object_key)
              VALUES (${owner}, 'teacher_resource', 'application/pdf', ${bytes}, ${Buffer.alloc(32)}, 'big.pdf', 'object', 'test')`;
  }

  it('follows the setting and reports what is used', async () => {
    await setRaw({ file_mb_per_account: 1 });
    const t = await teacher();
    await fill(t, MB - pdf.length - 10);
    expect((await upload(t, T0)).ok).toBe(true);
    expect(await upload(t, at(1))).toEqual({
      ok: false,
      reason: 'space_full',
      usedBytes: MB - 10,
      limitBytes: MB,
    });
  });

  it('removing a file makes space again', async () => {
    await setRaw({ file_mb_per_account: 1 });
    const t = await teacher();
    await fill(t, MB - 2 * pdf.length);
    const first = await upload(t, T0);
    if (!first.ok) throw new Error(first.reason);
    expect((await upload(t, at(1))).ok).toBe(true);
    expect((await upload(t, at(2))).ok).toBe(false);
    expect(await removeFile(sql, t, first.fileId, at(3))).toBe(true);
    expect((await upload(t, at(4))).ok).toBe(true);
  });

  it('uploads sent at the same moment cannot pass the space limit', async () => {
    await setRaw({ file_mb_per_account: 1 });
    const t = await teacher();
    await fill(t, MB - 3 * pdf.length);
    const results = await Promise.all(Array.from({ length: 6 }, () => upload(t, T0)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
  });

  it('the meter numbers: used, limit and uploads in the last 24 hours', async () => {
    const t = await teacher();
    await upload(t, T0);
    await upload(t, at(5));
    expect(await ownUsage(sql, t, at(10))).toEqual({
      usedBytes: 2 * pdf.length,
      limitBytes: 200 * MB,
      uploadsToday: 2,
      uploadsPerDay: 100,
      nextUploadAt: null,
    });
  });
});

describe('the whole environment against the free allowance', () => {
  it('levels: ok below the warning, warning from it, stopped from the stop level', () => {
    const s = { ...DEFAULT_STORAGE_SETTINGS, database_allowance_mb: 100 };
    expect(levelFor(74 * MB, s)).toBe('ok');
    expect(levelFor(75 * MB, s)).toBe('warning');
    expect(levelFor(90 * MB, s)).toBe('stopped');
  });

  it('at the stop level every upload is refused safely, and the Super Admin is told once', async () => {
    await setRaw({ database_allowance_mb: 1 }); // far below the test database's real size
    const t = await teacher();
    const before = await uploadsCounted(t);
    expect(await upload(t, T0)).toEqual({ ok: false, reason: 'storage_full' });
    expect(await upload(t, at(1))).toEqual({ ok: false, reason: 'storage_full' });
    expect(await uploadsCounted(t)).toBe(before);
    const [n] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM audit_events WHERE event_type = 'STORAGE_UPLOADS_STOPPED'
        AND occurred_at BETWEEN ${T0} AND ${at(1)}`;
    expect(n!.n).toBe(1);
    expect((await storageStatus(sql)).level).toBe('stopped');
  });

  it('at the warning level uploads still work and the warning is recorded', async () => {
    const { databaseBytes } = await storageStatus(sql);
    // An allowance where the database is at about 80%: above a 50% warning, well below a 95% stop.
    await setRaw({
      database_allowance_mb: Math.ceil(databaseBytes / MB / 0.8),
      storage_warn_percent: 50,
      storage_stop_percent: 95,
    });
    const t = await teacher();
    const later = at(3 * 24 * 60);
    expect((await upload(t, later)).ok).toBe(true);
    const [w] = await sql`SELECT 1 FROM audit_events WHERE event_type = 'STORAGE_WARNING' AND occurred_at = ${later}`;
    expect(w).toBeDefined();
    expect((await storageStatus(sql)).level).toBe('warning');
  });
});
