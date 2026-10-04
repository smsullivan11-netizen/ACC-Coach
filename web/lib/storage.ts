import "server-only";
import { sql } from "./db";
import { packChannels } from "./trace-store";
import type { EncodedChannel } from "./trace";

// Database storage (Neon free plan: 0.5 GB). Lap traces are ~99 % of it, so they are pruned and
// stored compressed (lib/trace-store.ts); lap times, metrics, corner results and ratings stay forever.

export const STORAGE_LIMIT_BYTES = 512 * 1024 * 1024;

/** Traces nobody needs any more, deleted after each upload:
 *  - laps that cannot be compared (invalid, out-laps, in-laps, incomplete) after 7 days, except edge
 *    laps (the track map's white lines may be set again from them);
 *  - every lap after 60 days, except each driver's best lap per track and class and their last 10 sessions. */
export async function pruneTraces() {
  await sql`
    delete from lap_trace t using lap l, session s
    where t.lap_id = l.id and l.session_id = s.id
      and not l.comparable and not 'track_edges' = any(l.excluded_reasons)
      and s.uploaded_at < now() - interval '7 days'`;
  await sql`
    delete from lap_trace t using lap l, session s
    where t.lap_id = l.id and l.session_id = s.id
      and s.uploaded_at < now() - interval '60 days'
      and l.id not in (select lap_id from best_lap)
      and s.id not in (select id from (select id, row_number() over (partition by driver_id order by uploaded_at desc) as n
                                       from session) recent where n <= 10)`;
}

/** Compresses traces stored before compression existed, a batch at a time. Returns how many are left. */
export async function compressOldTraces(batch = 40): Promise<number> {
  const rows = await sql<{ lap_id: string; channels: Record<string, EncodedChannel & { enc?: string }> }[]>`
    select lap_id, channels from lap_trace
    where channels is not null and exists (select 1 from jsonb_each(channels) c where c.value->>'enc' is null)
    limit ${batch}`;
  for (const r of rows)
    await sql`update lap_trace set channels = ${sql.json(packChannels(r.channels) as never)} where lap_id = ${r.lap_id}`;
  const [{ left }] = await sql<{ left: number }[]>`
    select count(*)::int as left from lap_trace
    where channels is not null and exists (select 1 from jsonb_each(channels) c where c.value->>'enc' is null)`;
  return left;
}

export type StorageStats = {
  total: number; limit: number;
  tables: { name: string; bytes: number }[];
  traces: number; uncompressed: number; avgTrace: number | null;
};

export async function storageStats(): Promise<StorageStats> {
  const [[db], tables, [t]] = await Promise.all([
    sql<{ total: number }[]>`select pg_database_size(current_database())::float8 as total`,
    sql<{ name: string; bytes: number }[]>`
      select c.relname as name, pg_total_relation_size(c.oid)::float8 as bytes
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by 2 desc limit 6`,
    sql<{ traces: number; uncompressed: number; avg: number | null }[]>`
      select count(*)::int as traces,
             count(*) filter (where exists (select 1 from jsonb_each(channels) c where c.value->>'enc' is null))::int as uncompressed,
             avg(pg_column_size(channels))::float8 as avg
      from lap_trace where channels is not null`,
  ]);
  return { total: db.total, limit: STORAGE_LIMIT_BYTES, tables, traces: t.traces, uncompressed: t.uncompressed, avgTrace: t.avg };
}
