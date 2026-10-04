import { currentDriver } from "@/lib/auth";
import { renameCorners } from "@/lib/corner-maps";
import { sql } from "@/lib/db";

// Corner names of the track's latest map (admins). Body: { names: { "<corner number>": "Druids" | "" } }.
export async function POST(request: Request, ctx: RouteContext<"/api/corner-maps/[track]/names">) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { track } = await ctx.params;
  const { names } = (await request.json().catch(() => ({}))) as { names?: Record<string, string | null> };
  if (!names || typeof names !== "object") return Response.json({ error: "names expected" }, { status: 400 });
  const [t] = await sql<{ id: string }[]>`select id from track where key = ${track}`;
  if (!t || !(await renameCorners(t.id, names))) return Response.json({ error: "no corner map for this track" }, { status: 404 });
  return Response.json({ ok: true });
}
