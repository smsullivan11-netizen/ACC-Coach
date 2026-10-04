import "server-only";
import postgres from "postgres";

// One connection pool per server process (reused across hot reloads in development).
// Note: bigint ids and numeric values come back as strings.
const url = (process.env.DATABASE_URL ?? "").trim();
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

export const sql =
  globalForDb.sql ??
  postgres(url, {
    max: 5,
    onnotice: () => {},
    // Neon's pooled address (…-pooler…) goes through PgBouncer: no prepared statements there
    prepare: !url.includes("-pooler"),
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
