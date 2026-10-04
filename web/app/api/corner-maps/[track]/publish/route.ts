import { currentDriver } from "@/lib/auth";
import { proposeMap, publishMap } from "@/lib/corner-maps";
import { DETAIL, type Detail } from "@/lib/corners";
import { sql } from "@/lib/db";

export const maxDuration = 60;

// Builds the corner map again from the team's best clean laps and publishes it as the track's next
// version; every lap's corner results are recomputed (admins). Body: { detail }.
export async function POST(request: Request, ctx: RouteContext<"/api/corner-maps/[track]/publish">) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { track } = await ctx.params;
  const { detail = "normal" } = (await request.json().catch(() => ({}))) as { detail?: string };
  if (!(detail in DETAIL)) return Response.json({ error: "detail: fewer, normal or more" }, { status: 400 });
  const [t] = await sql<{ id: string }[]>`select id from track where key = ${track}`;
  if (!t) return Response.json({ error: "unknown track" }, { status: 404 });
  const built = await proposeMap(t.id, detail as Detail);
  if (!built?.proposal.corners.length) return Response.json({ error: "no corner found on this track's laps" }, { status: 409 });
  const result = await publishMap(t.id, built.proposal, { detail: detail as Detail, laps: built.laps, by: me.display_name });
  return Response.json(result);
}
