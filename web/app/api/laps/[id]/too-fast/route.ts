import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { rebuildDriverRatings } from "@/lib/ratings";
import { flagTooFast } from "@/lib/too-fast";

// Admins: a lap flagged "too fast" (lib/too-fast.ts) was real after all, or a cleared one is flagged
// again. Body: { ok: true } = not a cut (stays cleared), { ok: false } = back to the rule. The
// driver's ratings are replayed.
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/laps/[id]/too-fast">) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { id } = await ctx.params;
  const { ok } = (await request.json().catch(() => ({}))) as { ok?: boolean };
  if (!/^\d+$/.test(id) || typeof ok !== "boolean") return Response.json({ error: "body: { ok: true | false }" }, { status: 400 });
  const [lap] = await sql<{ driver_id: string }[]>`
    update lap l set metrics = coalesce(l.metrics, '{}'::jsonb) || jsonb_build_object('too_fast_ok', ${ok})
    from session s where s.id = l.session_id and l.id = ${id} returning s.driver_id`;
  if (!lap) return Response.json({ error: "not found" }, { status: 404 });
  await flagTooFast(sql, { lapId: id });
  await rebuildDriverRatings(sql, lap.driver_id);
  return Response.json({ ok: true });
}
