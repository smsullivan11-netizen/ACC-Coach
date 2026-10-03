import "server-only";
import postgres from "postgres";

// One connection pool per server process (reused across hot reloads in development).
// Note: bigint ids and numeric values come back as strings.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

export const sql = globalForDb.sql ?? postgres(process.env.DATABASE_URL ?? "", { max: 5, onnotice: () => {} });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
