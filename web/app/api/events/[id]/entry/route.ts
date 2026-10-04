import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

// My sign-up for an event. Body: { status: "yes" | "maybe" | "no" | null (withdraw), car_key?, note? }.
export async function POST(request: Request, ctx: RouteContext<"/api/events/[id]/entry">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const b = (await request.json().catch(() => ({}))) as { status?: string | null; car_key?: string | null; note?: string | null };
  if (b.status == null) {
    await sql`delete from event_entry where event_id = ${id} and driver_id = ${me.id}`;
    return Response.json({ ok: true });
  }
  if (!["yes", "maybe", "no"].includes(b.status)) return Response.json({ error: "status: yes, maybe or no" }, { status: 400 });
  const car = typeof b.car_key === "string" && /^[a-z0-9_]{2,60}$/.test(b.car_key) ? b.car_key : null;
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 200) || null : null;
  await sql`
    insert into event_entry (event_id, driver_id, status, car_key, note) values (${id}, ${me.id}, ${b.status}, ${car}, ${note})
    on conflict (event_id, driver_id) do update set status = excluded.status, car_key = excluded.car_key, note = excluded.note, updated_at = now()`;
  return Response.json({ ok: true });
}
