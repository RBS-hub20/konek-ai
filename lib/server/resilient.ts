import type { SupabaseClient } from '@supabase/supabase-js';

/* ═══════════════════════════════════════════════════════════════════
   Writing to a schema you cannot fully trust.

   PostgREST rejects an insert the moment one column is unknown, so a
   database that is a few columns behind the code fails the whole write
   — one missing column at a time, which is miserable to chase.

   These helpers drop the offending column and retry, so a write lands
   with whatever the table actually has and reports what it had to skip.
   Nothing here papers over a *missing table*: that is reported plainly.
   ═══════════════════════════════════════════════════════════════════ */

export interface PgError {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}

const MAX_RETRIES = 25;

/** PGRST205 / 42P01 — the table itself is not there. */
export function isMissingTable(err: PgError | null | undefined): boolean {
  if (!err) return false;
  return err.code === 'PGRST205' || err.code === '42P01' ||
    /Could not find the table/i.test(err.message ?? '');
}

/** Pulls the column name out of the various "unknown column" messages. */
export function missingColumn(err: PgError | null | undefined): string | null {
  if (!err) return null;
  const msg = `${err.message ?? ''} ${err.details ?? ''}`;
  if (err.code && !['PGRST204', '42703'].includes(err.code) && !/column/i.test(msg)) return null;

  /* PostgREST: Could not find the 'campaign_id' column of 'call_logs' in the schema cache */
  const a = msg.match(/Could not find the '([^']+)' column/i);
  if (a) return a[1];
  /* Postgres: column "campaign_id" of relation "call_logs" does not exist */
  const b = msg.match(/column "([^"]+)" of relation/i);
  if (b) return b[1];
  /* Postgres: column call_logs.campaign_id does not exist */
  const c = msg.match(/column [\w.]*?\.?([\w]+) does not exist/i);
  if (c) return c[1];
  return null;
}

export interface WriteResult<T> {
  data: T | null;
  /** Columns the table did not have, which were dropped to let the write land. */
  dropped: string[];
  /** Set when the table itself is absent — the write did not happen. */
  missingTable: boolean;
  error: PgError | null;
}

/**
 * Inserts `row`, retrying without any column the table does not have.
 * Returns what landed plus the list of columns it had to drop.
 */
export async function insertResilient<T = Record<string, unknown>>(
  db: SupabaseClient,
  table: string,
  row: Record<string, unknown>
): Promise<WriteResult<T>> {
  const payload = { ...row };
  const dropped: string[] = [];

  for (let i = 0; i < MAX_RETRIES; i++) {
    const { data, error } = await db.from(table).insert(payload).select('*').maybeSingle();
    if (!error) return { data: (data as T) ?? null, dropped, missingTable: false, error: null };

    const err = error as PgError;
    if (isMissingTable(err)) return { data: null, dropped, missingTable: true, error: err };

    const col = missingColumn(err);
    if (col && col in payload) {
      delete payload[col];
      dropped.push(col);
      if (Object.keys(payload).length === 0) {
        return { data: null, dropped, missingTable: false, error: err };
      }
      continue;
    }
    return { data: null, dropped, missingTable: false, error: err };
  }
  return { data: null, dropped, missingTable: false, error: { message: 'Too many unknown columns' } };
}

/** Same idea for updates. */
export async function updateResilient<T = Record<string, unknown>>(
  db: SupabaseClient,
  table: string,
  match: Record<string, unknown>,
  patch: Record<string, unknown>
): Promise<WriteResult<T>> {
  const payload = { ...patch };
  const dropped: string[] = [];

  for (let i = 0; i < MAX_RETRIES; i++) {
    let q = db.from(table).update(payload);
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string);
    const { data, error } = await q.select('*').maybeSingle();
    if (!error) return { data: (data as T) ?? null, dropped, missingTable: false, error: null };

    const err = error as PgError;
    if (isMissingTable(err)) return { data: null, dropped, missingTable: true, error: err };

    const col = missingColumn(err);
    if (col && col in payload) {
      delete payload[col];
      dropped.push(col);
      if (Object.keys(payload).length === 0) {
        return { data: null, dropped, missingTable: false, error: null };
      }
      continue;
    }
    return { data: null, dropped, missingTable: false, error: err };
  }
  return { data: null, dropped, missingTable: false, error: { message: 'Too many unknown columns' } };
}

/** Advice to attach to a schema-shaped failure. */
export const SCHEMA_HINT =
  'Run supabase.sql in the Supabase SQL Editor. It is idempotent and ends with NOTIFY pgrst so the schema cache reloads.';
