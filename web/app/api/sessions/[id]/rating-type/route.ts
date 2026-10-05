import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { rebuildDriverRatings, WEIGHTS_BY_TYPE } from "@/lib/ratings";

export const maxDuration = 60;

// Session type for the rating weights (any team member: the team prefers cooperation over
// privacy). Body: { type: "practice" | "qualifying" | "race" | "mixed" | null } (null = ACC's type).
// The driver's ratings are replayed afterwards, since the session's score changes.
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/rating-type">) {
  if (!(await currentDriver())) return Response.json({ error: "sign in" }, { status: 401 });
  const { id } = await ctx.params;
  const { type } = (await request.json().catch(() => ({}))) as { type?: string | null };
  if (!/^\d+$/.test(id) || (type != null && !(type in WEIGHTS_BY_TYPE)))
    return Response.json({ error: "type: practice, qualifying, race, mixed or null" }, { status: 400 });
  const [s] = await sql<{ driver_id: string }[]>`update session set rating_type = ${type ?? null} where id = ${id} returning driver_id`;
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  await rebuildDriverRatings(sql, s.driver_id);
  const [r] = await sql<{ rating: number }[]>`select rating from driver_rating where driver_id = ${s.driver_id} order by id desc limit 1`;
  return Response.json({ ok: true, rating: r?.rating ?? null });
}
