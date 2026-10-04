import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { compressOldTraces, pruneTraces } from "@/lib/storage";

export const maxDuration = 60;

// Admins: prune, compress every old trace (in batches, under 50 s), then give the space back.
export async function POST() {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const start = Date.now();
  await pruneTraces();
  let left = await compressOldTraces();
  while (left > 0 && Date.now() - start < 45_000) left = await compressOldTraces();
  if (left === 0) await sql`vacuum full lap_trace`;   // rewrites the table so the freed space is returned
  return Response.json({ left });
}
