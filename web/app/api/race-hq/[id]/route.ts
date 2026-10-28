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
  if (body.action === "plan") {
    const stints = body.stints;
    if (!body.car_id || !/^\d+$/.test(body.car_id) || !Array.isArray(stints) || !stints.length || stints.length > 100)
      return Response.json({ error: "invalid stint plan" }, { status: 400 });
    const carId = body.car_id;
    const [car] = await sql`select 1 from event_car where id = ${carId} and event_id = ${id}`;
    if (!car) return Response.json({ error: "car not found" }, { status: 404 });
    const parsed = stints.map((s) => ({
      id: String(s.id ?? ""), driver: String(s.driver_id ?? ""), start: new Date(s.starts_at ?? ""),
      end: new Date(s.ends_at ?? ""), note: s.note?.trim().slice(0, 300) || null,
    }));
    if (parsed.some((s) => !/^\d+$/.test(s.id) || !/^\d+$/.test(s.driver) ||
        Number.isNaN(s.start.getTime()) || Number.isNaN(s.end.getTime()) || s.end <= s.start))
      return Response.json({ error: "every stint needs a driver and valid start/end" }, { status: 400 });
    const ordered = [...parsed].sort((a, b) => a.start.getTime() - b.start.getTime());
    if (ordered.some((s, i) => i > 0 && s.start.getTime() !== ordered[i - 1].end.getTime()))
      return Response.json({ error: "stints must form a continuous plan" }, { status: 400 });
    const drivers = [...new Set(parsed.map((s) => s.driver))];
    if (drivers.length > 6) return Response.json({ error: "a car can have at most six drivers" }, { status: 400 });
    const validDrivers = await sql<{ id: string }[]>`select id from driver where id in ${sql(drivers)}`;
    if (validDrivers.length !== drivers.length) return Response.json({ error: "driver not found" }, { status: 400 });
    await sql.begin(async (tx) => {
      for (const s of parsed) {
        const rows = await tx`update event_car_stint set driver_id = ${s.driver}, starts_at = ${s.start.toISOString()},
                              ends_at = ${s.end.toISOString()}, note = ${s.note}
                              where id = ${s.id} and event_car_id = ${carId} returning id`;
        if (!rows.length) throw new Error("stint not found");
      }
      await tx`update event set updated_at = now() where id = ${id}`;
      await tx`insert into event_update (event_id, event_car_id, author_id, kind, body)
               values (${id}, ${carId}, ${me.id}, 'official', 'The stint plan was updated.')`;
    });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
