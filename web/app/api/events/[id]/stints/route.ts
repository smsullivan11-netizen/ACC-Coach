import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

// Save the event's line-up (admins). Body: { stints: [{ driver_id | null, minutes }] } in order.
export async function POST(request: Request, ctx: RouteContext<"/api/events/[id]/stints">) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { id } = await ctx.params;
  const { stints } = (await request.json().catch(() => ({}))) as { stints?: { driver_id: string | null; minutes: number }[] };
  if (!/^\d+$/.test(id) || !Array.isArray(stints) || stints.length > 60) return Response.json({ error: "stints expected" }, { status: 400 });
  const rows = stints.map((s, n) => ({
    event_id: id, n: n + 1, driver_id: s.driver_id && /^\d+$/.test(s.driver_id) ? s.driver_id : null,
    minutes: Math.max(1, Math.round(Number(s.minutes) || 1)),
  }));
  await sql.begin(async (tx) => {
    await tx`delete from event_stint where event_id = ${id}`;
    if (rows.length) await tx`insert into event_stint ${tx(rows)}`;
  });
  return Response.json({ ok: true });
}
