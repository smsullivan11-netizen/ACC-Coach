// Applies db/migrations/*.sql in order, each once (recorded in schema_migrations).
// Usage: npm run db:migrate   (reads DATABASE_URL from .env.local)
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "db", "migrations");
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

try {
  await sql`create table if not exists schema_migrations (
              name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const name of files.filter((f) => !done.has(f))) {
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, name), "utf8"));
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    console.log(`applied ${name}`);
  }
  console.log(`database up to date (${files.length} migrations)`);
} finally {
  await sql.end();
}
