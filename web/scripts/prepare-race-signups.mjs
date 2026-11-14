// Runs before a build using the already configured DATABASE_URL. Never logs credentials.
import { readFileSync, readdirSync } from "node:fs";
import postgres from "postgres";
if (process.env.DATABASE_URL?.trim()) {
  const sql = postgres(process.env.DATABASE_URL.trim(), { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`create table if not exists acc_feature_migration (name text primary key, applied_at timestamptz not null default now())`;
    const dir = new URL("./migrations/", import.meta.url);
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
      await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(1565167599)`;
        if ((await tx`select 1 from acc_feature_migration where name = ${name}`).length) return;
        await tx.unsafe(readFileSync(new URL(name, dir), "utf8"));
        await tx`insert into acc_feature_migration (name) values (${name})`;
      });
    }
    console.log("Race signup and car team schemas ready.");
  } finally { await sql.end(); }
} else if (process.env.VERCEL) {
  throw new Error("DATABASE_URL is required to prepare race signups.");
}
