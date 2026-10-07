import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { importReferences } from "@/lib/references";
import { flagTooFast } from "@/lib/too-fast";

export const maxDuration = 60;

// Admins: reads OhneSpeed's sheet again (lib/references.ts) when it has been updated, then checks
// every lap against the new references ("too fast"). Ratings are replayed by "Recompute all ratings".
export async function POST() {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  try {
    const report = await importReferences(sql);
    await flagTooFast(sql);
    return Response.json({ ok: true, ...report });
  } catch (e) {
    return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
  }
}
