import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { importResults } from "@/lib/results";

// Import an ACC server results file (.json, raw body) into this event (admins).
export async function POST(request: Request, ctx: RouteContext<"/api/events/[id]/results">) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { id } = await ctx.params;
  const [e] = /^\d+$/.test(id) ? await sql`select 1 from event where id = ${id}` : [];
  if (!e) return Response.json({ error: "not found" }, { status: 404 });
  try {
    return Response.json(await importResults(Buffer.from(await request.arrayBuffer()), { eventId: id, by: me.id }));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "could not read the file" }, { status: 400 });
  }
}

// Detach an imported session from the event and delete it (admins). Body: { session_id }.
export async function DELETE(request: Request, ctx: RouteContext<"/api/events/[id]/results">) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { id } = await ctx.params;
  const { session_id } = (await request.json().catch(() => ({}))) as { session_id?: string };
  if (!session_id || !/^\d+$/.test(session_id)) return Response.json({ error: "session_id expected" }, { status: 400 });
  await sql`delete from server_session where id = ${session_id} and event_id = ${id}`;
  return Response.json({ ok: true });
}
