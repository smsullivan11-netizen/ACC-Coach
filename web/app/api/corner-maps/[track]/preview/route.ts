import { currentDriver } from "@/lib/auth";
import { latestMap, mapHash, proposeMap } from "@/lib/corner-maps";
import { DETAIL, type Detail } from "@/lib/corners";
import { sql } from "@/lib/db";

export const maxDuration = 60;

// A new corner map built from the team's best clean laps, not saved (admins). Body: { detail }.
export async function POST(request: Request, ctx: RouteContext<"/api/corner-maps/[track]/preview">) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { track } = await ctx.params;
  const { detail = "normal" } = (await request.json().catch(() => ({}))) as { detail?: string };
  if (!(detail in DETAIL)) return Response.json({ error: "detail: fewer, normal or more" }, { status: 400 });
  const [t] = await sql<{ id: string }[]>`select id from track where key = ${track}`;
  if (!t) return Response.json({ error: "unknown track" }, { status: 404 });
  const built = await proposeMap(t.id, detail as Detail);
  if (!built) return Response.json({ error: "no clean lap recorded with the ACC Coach app on this track yet" }, { status: 409 });
  const current = await latestMap(sql, t.id);
  const same = current?.definition?.method === "geometry"
    && mapHash({ track, length_m: built.proposal.length_m, corners: built.proposal.corners }) === mapHash(current.definition);
  return Response.json({ ...built, next_version: (current?.version ?? 0) + 1, same_as_current: same });
}
