import 'server-only';
import { writeAudit } from '@/server/auth/audit';
import type { Db, Sql } from '@/server/db/client';
import { MB } from '@/lib/storage';

/**
 * Storage safety limits (OC-96). Temporary, technical limits for development and testing, not
 * business rules and not an approval of paid storage (OC-91). The Super Admin changes them on
 * Admin → Storage; the server reads them on every upload.
 *
 * - Per account: uploads per rolling 24 hours, and total stored file size.
 * - For the whole environment: the database's size is measured against the free allowance
 *   (Neon Free: 1 GB per project, which includes file contents). At the warning level the Super
 *   Admin sees a banner; at the stop level new uploads are refused. Nothing is ever upgraded,
 *   bought or moved to a paid service automatically.
 */

export { MB };

export type SettingKey =
  | 'file_uploads_per_day'
  | 'file_mb_per_account'
  | 'database_allowance_mb'
  | 'storage_warn_percent'
  | 'storage_stop_percent';

export type StorageSettings = Record<SettingKey, number>;

/** Used if a row is missing; the migration seeds the same values. */
export const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  file_uploads_per_day: 100,
  file_mb_per_account: 200,
  database_allowance_mb: 1024,
  storage_warn_percent: 75,
  storage_stop_percent: 90,
};

/** Allowed ranges, so a typing mistake cannot switch the protection off. */
export const SETTING_RANGES: Record<SettingKey, { min: number; max: number; label: string; unit: string }> = {
  file_uploads_per_day: { min: 1, max: 1000, label: 'Uploads per account per day', unit: 'files' },
  file_mb_per_account: { min: 1, max: 1000, label: 'Storage per account', unit: 'MB' },
  database_allowance_mb: { min: 100, max: 100_000, label: 'Free database allowance', unit: 'MB' },
  storage_warn_percent: { min: 10, max: 95, label: 'Warn me at', unit: '%' },
  storage_stop_percent: { min: 20, max: 98, label: 'Stop new uploads at', unit: '%' },
};

export const SETTING_KEYS = Object.keys(DEFAULT_STORAGE_SETTINGS) as SettingKey[];

export async function getStorageSettings(sql: Db): Promise<StorageSettings> {
  const rows = await sql<Array<{ key: SettingKey; value: number }>>`
    SELECT key, value FROM platform_settings WHERE key IN ${sql(SETTING_KEYS)}`;
  const out = { ...DEFAULT_STORAGE_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export type SettingsProblem = 'not_allowed' | 'invalid' | 'warn_not_below_stop';

/** Only the Super Admin (the owner) changes the limits; every change is in the audit trail. */
export async function updateStorageSettings(
  sql: Sql,
  actorId: string,
  input: Partial<Record<SettingKey, unknown>>,
  now: Date = new Date(),
): Promise<{ ok: true; settings: StorageSettings } | { ok: false; reason: SettingsProblem }> {
  const [actor] = await sql<Array<{ ok: boolean }>>`
    SELECT (role = 'superadmin' AND status = 'active') AS ok FROM accounts WHERE id = ${actorId}`;
  if (!actor?.ok) return { ok: false, reason: 'not_allowed' };
  const next: Partial<StorageSettings> = {};
  for (const key of SETTING_KEYS) {
    const raw = input[key];
    if (raw === undefined) continue;
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    const { min, max } = SETTING_RANGES[key];
    if (!Number.isInteger(n) || n < min || n > max) return { ok: false, reason: 'invalid' };
    next[key] = n;
  }
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${STORAGE_LOCK})`;
    const current = await getStorageSettings(tx);
    const merged = { ...current, ...next };
    if (merged.storage_warn_percent >= merged.storage_stop_percent) {
      return { ok: false as const, reason: 'warn_not_below_stop' as const };
    }
    const changed = SETTING_KEYS.filter((k) => merged[k] !== current[k]);
    for (const key of changed) {
      await tx`INSERT INTO platform_settings (key, value, updated_by, updated_at)
               VALUES (${key}, ${merged[key]}, ${actorId}, ${now})
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
                                               updated_at = EXCLUDED.updated_at`;
      await writeAudit(
        tx,
        {
          type: 'STORAGE_LIMIT_CHANGED',
          outcome: 'success',
          actorId,
          details: { setting: key, from: current[key], to: merged[key] },
        },
        now,
      );
    }
    return { ok: true as const, settings: merged };
  });
}

/**
 * One lock for every upload and every settings change, so the limits are checked one upload at
 * a time across the whole environment (no two uploads can both squeeze past a limit).
 */
export const STORAGE_LOCK = 4_242_017;

export type StorageLevel = 'ok' | 'warning' | 'stopped';

export interface StorageStatus {
  databaseBytes: number;
  fileBytes: number;
  fileCount: number;
  allowanceBytes: number;
  warnBytes: number;
  stopBytes: number;
  level: StorageLevel;
  settings: StorageSettings;
}

export function levelFor(bytes: number, s: StorageSettings): StorageLevel {
  const allowance = s.database_allowance_mb * MB;
  if (bytes >= (allowance * s.storage_stop_percent) / 100) return 'stopped';
  if (bytes >= (allowance * s.storage_warn_percent) / 100) return 'warning';
  return 'ok';
}

/**
 * The whole environment's use. The database size counts everything stored, file contents
 * included, so it is at least as large as what the provider measures.
 */
export async function storageStatus(sql: Db, settings?: StorageSettings): Promise<StorageStatus> {
  const s = settings ?? (await getStorageSettings(sql));
  const [row] = await sql<Array<{ db: string; files: string; n: number }>>`
    SELECT pg_database_size(current_database())::bigint AS db,
           coalesce((SELECT sum(byte_size) FROM stored_files WHERE deleted_at IS NULL), 0)::bigint AS files,
           (SELECT count(*)::int FROM stored_files WHERE deleted_at IS NULL) AS n`;
  const databaseBytes = Number(row!.db);
  const allowanceBytes = s.database_allowance_mb * MB;
  return {
    databaseBytes,
    fileBytes: Number(row!.files),
    fileCount: row!.n,
    allowanceBytes,
    warnBytes: Math.floor((allowanceBytes * s.storage_warn_percent) / 100),
    stopBytes: Math.floor((allowanceBytes * s.storage_stop_percent) / 100),
    level: levelFor(databaseBytes, s),
    settings: s,
  };
}

/** Records reaching the warning or stop level, at most once a day each, for the Super Admin. */
export async function noteStorageLevel(sql: Db, level: StorageLevel, now: Date): Promise<void> {
  if (level === 'ok') return;
  const type = level === 'stopped' ? 'STORAGE_UPLOADS_STOPPED' : 'STORAGE_WARNING';
  const [recent] = await sql`
    SELECT 1 FROM audit_events WHERE event_type = ${type}
      AND occurred_at > ${new Date(now.getTime() - 24 * 60 * 60 * 1000)} LIMIT 1`;
  if (!recent) await writeAudit(sql, { type, outcome: level === 'stopped' ? 'denied' : 'success' }, now);
}

export interface OwnUsage {
  usedBytes: number;
  limitBytes: number;
  uploadsToday: number;
  uploadsPerDay: number;
  /** When the next upload is allowed again, if today's uploads are used up. */
  nextUploadAt: Date | null;
}

/** What one account has used, for the meter ("85 MB of 200 MB used") and the messages. */
export async function ownUsage(
  sql: Db,
  ownerId: string,
  now: Date = new Date(),
  settings?: StorageSettings,
): Promise<OwnUsage> {
  const s = settings ?? (await getStorageSettings(sql));
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [row] = await sql<Array<{ bytes: string; uploads: number; nth: Date | null }>>`
    SELECT coalesce((SELECT sum(byte_size) FROM stored_files WHERE owner_id = ${ownerId} AND deleted_at IS NULL), 0)::bigint AS bytes,
           (SELECT count(*)::int FROM rate_events WHERE account_id = ${ownerId} AND kind = 'file_upload'
              AND occurred_at > ${since}) AS uploads,
           -- The newest upload that must age out before one more fits under the limit.
           (SELECT occurred_at FROM rate_events WHERE account_id = ${ownerId} AND kind = 'file_upload'
              AND occurred_at > ${since} ORDER BY occurred_at DESC OFFSET ${s.file_uploads_per_day - 1} LIMIT 1) AS nth`;
  const uploadsToday = row!.uploads;
  const full = uploadsToday >= s.file_uploads_per_day;
  return {
    usedBytes: Number(row!.bytes),
    limitBytes: s.file_mb_per_account * MB,
    uploadsToday,
    uploadsPerDay: s.file_uploads_per_day,
    nextUploadAt: full && row!.nth ? new Date(row!.nth.getTime() + 24 * 60 * 60 * 1000) : null,
  };
}
