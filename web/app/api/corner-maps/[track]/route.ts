import { driverFromRequest } from "@/lib/auth";
import { sql } from "@/lib/db";

// The team's reference corner map of a track (latest version), exactly as first uploaded.
// The upload script saves it locally before processing, so every driver's corners match.
export async function GET(request: Request, ctx: RouteContext<"/api/corner-maps/[track]">) {
  if (!(await driverFromRequest(request))) return Response.json({ error: "sign in or use a valid upload token" }, { status: 401 });
  const { track } = await ctx.params;
  const [map] = await sql<{ definition: unknown }[]>`
    select m.definition from corner_map m join track t on t.id = m.track_id
    where t.key = ${track} and m.definition is not null
    order by m.version desc limit 1`;
  return map ? Response.json(map.definition) : Response.json({ error: "no corner map yet" }, { status: 404 });
}
