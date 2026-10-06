import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { rebuildDriverRatings } from "@/lib/ratings";

export const maxDuration = 60;

// Deletes a session (admins, or the session's own driver): e.g. one processed by an older app that
// cut it wrongly, to upload it again. Its laps, traces and corner results go with it (cascade); the
// driver's ratings are replayed; track outlines refresh by themselves (newest lap changed).
export async function DELETE(_request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const [s] = await sql<{ driver_id: string }[]>`select driver_id from session where id = ${id}`;
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  if (!me.is_admin && me.id !== s.driver_id) return Response.json({ error: "only an admin or the driver" }, { status: 403 });
  await sql`delete from session where id = ${id}`;
  await rebuildDriverRatings(sql, s.driver_id);
  return Response.json({ ok: true });
}
