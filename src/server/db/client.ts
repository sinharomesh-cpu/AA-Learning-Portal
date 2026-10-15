import 'server-only';
import postgres from 'postgres';

/**
 * Database client (Phase 2, WP2-1). Server-only: the connection string never reaches the
 * browser. One pool per server process; created on first use so builds and pages that do not
 * touch the database need no DATABASE_URL.
 */
export type Sql = postgres.Sql<Record<string, unknown>>;
/** A transaction handle (inside `sql.begin`). */
export type Tx = postgres.TransactionSql<Record<string, unknown>>;
/** Either a pool or a transaction: for functions that do not open their own transaction. */
export type Db = Sql | Tx;

let client: Sql | null = null;

export function db(): Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    // Timestamps come back as Date objects; all times are stored as timestamptz (UTC).
    onnotice: () => {},
  });
  return client;
}

/** Closes the pool (tests and scripts). */
export async function closeDb(): Promise<void> {
  if (client) {
    const c = client;
    client = null;
    await c.end({ timeout: 5 });
  }
}
