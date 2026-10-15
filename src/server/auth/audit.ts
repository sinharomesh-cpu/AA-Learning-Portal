import 'server-only';
import type { Db } from '@/server/db/client';

/**
 * Audit log (OC-21, G1-08 §3.5). Append-only in the database. Details are small, flat and
 * checked here: anything that looks like a password, token, code or secret is refused, so a
 * coding mistake fails loudly instead of leaking into the log.
 */
export type AuditOutcome = 'success' | 'failure' | 'denied';

export interface AuditEvent {
  type: string;
  outcome: AuditOutcome;
  actorId?: string | null;
  subjectId?: string | null;
  requestId?: string | null;
  details?: Record<string, string | number | boolean | null>;
}

const FORBIDDEN_KEY = /pass|token|secret|code|otp|hash|cookie/i;
const MAX_STRING = 200;

export function sanitiseDetails(details: AuditEvent['details'] = {}): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`Audit detail "${key}" is not allowed.`);
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error(`Audit detail "${key}" must be a plain value.`);
    }
    out[key] = typeof value === 'string' ? value.slice(0, MAX_STRING) : value;
  }
  return out;
}

export async function writeAudit(sql: Db, event: AuditEvent, now: Date = new Date()): Promise<void> {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(event.type)) throw new Error(`Bad audit event type ${event.type}`);
  const details = sanitiseDetails(event.details);
  await sql`
    INSERT INTO audit_events (occurred_at, request_id, event_type, outcome, actor_id, subject_id, details)
    VALUES (${now}, ${event.requestId ?? null}, ${event.type}, ${event.outcome},
            ${event.actorId ?? null}, ${event.subjectId ?? null}, ${sql.json(details)})`;
}
