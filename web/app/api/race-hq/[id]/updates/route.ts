import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { canLead } from "@/lib/race-hq";

export async function POST(request: Request, ctx: RouteContext<"/api/race-hq/[id]/updates">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { body?: string; kind?: string; car_id?: string | null } | null;
  const text = body?.body?.trim().slice(0, 1200) ?? "";
  const kind = body?.kind === "official" ? "official" : "comment";
  if (!text) return Response.json({ error: "write an update first" }, { status: 400 });
  const [active] = await sql`select 1 from event where id = ${id} and status in ('upcoming', 'live') and archived_at is null`;
  if (!active) return Response.json({ error: "archived races are read-only" }, { status: 409 });
  if (kind === "official" && !(await canLead(id, me)))
    return Response.json({ error: "race leads only" }, { status: 403 });
  let carId: string | null = null;
  if (body?.car_id && /^\d+$/.test(body.car_id)) {
    const [car] = await sql<{ id: string }[]>`select id from event_car where id = ${body.car_id} and event_id = ${id}`;
    if (!car) return Response.json({ error: "car not found" }, { status: 404 });
    carId = car.id;
  }
  const [row] = await sql<{ id: string }[]>`
    insert into event_update (event_id, event_car_id, author_id, kind, body)
    select ${id}, ${carId}, ${me.id}, ${kind}, ${text} where exists (select 1 from event where id = ${id})
    returning id`;
  return row ? Response.json({ ok: true, id: row.id }) : Response.json({ error: "race not found" }, { status: 404 });
}
