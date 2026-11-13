import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { canLead } from "@/lib/race-hq";

type Edit =
  | { action: "clock"; remaining_s?: number; status?: "upcoming" | "live" }
  | { action: "finish" }
  | { action: "archive" }
  | { action: "details"; notes?: string }
  | { action: "plan"; car_id?: string; stints?: { id?: string; driver_id?: string; starts_at?: string; ends_at?: string; note?: string }[] }
  | { action: "lead"; driver_id?: string; enabled?: boolean };

export async function PATCH(request: Request, ctx: RouteContext<"/api/race-hq/[id]">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Edit | null;
  if (!body) return Response.json({ error: "bad request" }, { status: 400 });
  if (!(await canLead(id, me))) return Response.json({ error: "race leads only" }, { status: 403 });
  const [active] = await sql`select 1 from event where id = ${id} and status in ('upcoming', 'live') and archived_at is null`;
  if (!active) return Response.json({ error: "archived races are read-only" }, { status: 409 });

  if (body.action === "clock") {
    if (body.status === "upcoming") {
      await sql`update event set status = 'upcoming', clock_remaining_s = null, clock_updated_at = null,
                clock_source = 'schedule', updated_at = now() where id = ${id}`;
    } else {
      const seconds = Math.round(Number(body.remaining_s));
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 24 * 3600)
        return Response.json({ error: "time remaining must be between 0 and 24 hours" }, { status: 400 });
      await sql`update event set status = 'live', clock_remaining_s = ${seconds}, clock_updated_at = now(),
                clock_source = 'manual', updated_at = now() where id = ${id}`;
    }
    return Response.json({ ok: true });
  }
  if (body.action === "finish" || body.action === "archive") {
    await sql`update event set status = 'finished', archived_at = coalesce(archived_at, now()),
              clock_remaining_s = 0, clock_updated_at = now(), updated_at = now() where id = ${id}`;
    await sql`insert into event_update (event_id, author_id, kind, body)
              values (${id}, ${me.id}, 'system', ${body.action === "finish" ? "Race marked finished." : "Race archived."})`;
    return Response.json({ ok: true });
  }
  if (body.action === "lead") {
    if (!me.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
    if (!body.driver_id || !/^\d+$/.test(body.driver_id) || typeof body.enabled !== "boolean")
      return Response.json({ error: "choose a team member" }, { status: 400 });
    if (body.enabled)
      await sql`insert into event_role (event_id, driver_id, role) values (${id}, ${body.driver_id}, 'lead') on conflict do nothing`;
    else
      await sql`delete from event_role where event_id = ${id} and driver_id = ${body.driver_id} and role = 'lead'`;
    return Response.json({ ok: true });
  }
  if (body.action === "details") {
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : "";
    await sql`update event set notes = ${notes || null}, updated_at = now() where id = ${id}`;
    await sql`insert into event_update (event_id, author_id, kind, body)
              values (${id}, ${me.id}, 'official', 'Race and pit notes were updated.')`;
    return Response.json({ ok: true });
  }
  if (body.action === "plan")
    return Response.json({ error: "Refresh Race Day HQ and use the Stints editor to save this schedule." }, { status: 409 });
  return Response.json({ error: "unknown action" }, { status: 400 });
}
