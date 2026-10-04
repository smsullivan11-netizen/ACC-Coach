import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { setEdge } from "@/lib/track-edges";

export const maxDuration = 60;

// Sets a track edge from an edge lap, or clears it (admins). Body: { side: "left" | "right", lap_id: "123" | null }.
export async function POST(request: Request, ctx: RouteContext<"/api/tracks/[track]/edges">) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { track } = await ctx.params;
  const { side, lap_id } = (await request.json().catch(() => ({}))) as { side?: string; lap_id?: string | null };
  if ((side !== "left" && side !== "right") || (lap_id != null && !/^\d+$/.test(String(lap_id))))
    return Response.json({ error: "side (left or right) and lap_id expected" }, { status: 400 });
  const [t] = await sql<{ id: string }[]>`select id from track where key = ${track}`;
  if (!t) return Response.json({ error: "unknown track" }, { status: 404 });
  const error = await setEdge(t.id, side, lap_id == null ? null : String(lap_id), me.id);
  return error ? Response.json({ error }, { status: 409 }) : Response.json({ ok: true });
}
