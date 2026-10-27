import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(request: Request, ctx: RouteContext<"/api/race-hq/[id]/readiness">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const { id } = await ctx.params;
  const { ready } = (await request.json().catch(() => ({}))) as { ready?: boolean };
  if (!/^\d+$/.test(id) || typeof ready !== "boolean") return Response.json({ error: "bad request" }, { status: 400 });
  const [assigned] = await sql`select 1 from event_car_stint s join event_car c on c.id = s.event_car_id
                               join event e on e.id = c.event_id
                               where c.event_id = ${id} and s.driver_id = ${me.id}
                                 and e.status in ('upcoming', 'live') and e.archived_at is null limit 1`;
  if (!assigned) return Response.json({ error: "you are not in an active race plan" }, { status: 403 });
  await sql`insert into event_readiness (event_id, driver_id, ready, updated_at)
            values (${id}, ${me.id}, ${ready}, now())
            on conflict (event_id, driver_id) do update set ready = excluded.ready, updated_at = now()`;
  return Response.json({ ok: true });
}
