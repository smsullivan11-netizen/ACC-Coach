import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { rebuildDriverRatings } from "@/lib/ratings";
import { snapshotBop } from "@/lib/references";
import { flagTooFast } from "@/lib/too-fast";

export const maxDuration = 60;

// The session's BoP (any team member, like the session type: the team prefers cooperation over
// privacy). Body: { bop: "default" | "lfm" | null } (null = the detected one). LFM's ballast and
// restrictor are frozen for the session, its laps checked again against the BoP's reference ("too
// fast"), and the driver's ratings replayed (lib/references.ts).
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/bop">) {
  if (!(await currentDriver())) return Response.json({ error: "sign in" }, { status: 401 });
  const { id } = await ctx.params;
  const { bop } = (await request.json().catch(() => ({}))) as { bop?: string | null };
  if (!/^\d+$/.test(id) || (bop != null && bop !== "default" && bop !== "lfm"))
    return Response.json({ error: "bop: default, lfm or null" }, { status: 400 });
  const [s] = await sql<{ driver_id: string }[]>`update session set bop_chosen = ${bop ?? null} where id = ${id} returning driver_id`;
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  await snapshotBop(sql, id);
  await flagTooFast(sql, { sessionId: id });
  await rebuildDriverRatings(sql, s.driver_id);
  return Response.json({ ok: true });
}
