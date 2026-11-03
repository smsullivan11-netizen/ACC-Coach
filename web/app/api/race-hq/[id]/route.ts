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
    if (!body.car_id || !/^\d+$/.test(body.car_id) || !Array.isArray(stints) || !stints.length || stints.length > 200 || stints.some((s) => !s || typeof s !== "object"))
      return Response.json({ error: "invalid stint plan" }, { status: 400 });
    const carId = body.car_id;
    const parsed = stints.map((s) => ({
      id: String(s.id ?? ""), driver: String(s.driver_id ?? ""), start: new Date(s.starts_at ?? ""),
      end: new Date(s.ends_at ?? ""), note: typeof s.note === "string" ? s.note.trim().slice(0, 300) || null : null,
    }));
    if (new Set(parsed.map((s) => s.id)).size !== parsed.length || parsed.some((s) => !/^\d+$/.test(s.id) || (s.driver !== "" && !/^\d+$/.test(s.driver)) ||
        Number.isNaN(s.start.getTime()) || Number.isNaN(s.end.getTime()) || s.end <= s.start))
      return Response.json({ error: "every stint needs a roster driver and valid start/end" }, { status: 400 });
    const result = await sql.begin(async (tx) => {
      const [event] = await tx`select * from event where id = ${id} for update`;
      if (!event || event.status === "finished" || event.archived_at)
        return Response.json({ error: "archived races are read-only" }, { status: 409 });
      const [car] = await tx`select roster_confirmed from event_car where id = ${carId} and event_id = ${id}`;
      if (!car) return Response.json({ error: "car not found" }, { status: 404 });
      const roster = await tx`select driver_id from event_car_driver where event_car_id = ${carId}`;
      if (!car.roster_confirmed || roster.length < 4 || roster.length > 6)
        return Response.json({ error: "confirm this car’s 4–6 driver roster first" }, { status: 409 });
      const drivers = new Set(roster.map((d) => String(d.driver_id)));
      // Historical assignments may belong to a previous roster. Unfinished ones must use this car’s current team.
      if (parsed.some((s) => s.end.getTime() > Date.now() && !drivers.has(s.driver)))
        return Response.json({ error: "choose drivers from this car’s roster" }, { status: 400 });
      const saved = await tx`select id, n, driver_id, starts_at, ends_at from event_car_stint where event_car_id = ${carId} order by n`;
      if (saved.length !== parsed.length || saved.some((r) => !parsed.some((s) => s.id === String(r.id))))
        return Response.json({ error: "save the complete plan for this car; refresh first" }, { status: 409 });
      const ordered = saved.map((r) => parsed.find((s) => s.id === String(r.id))!);
      if (ordered.some((s, i) => i > 0 && s.start.getTime() !== ordered[i - 1].end.getTime()))
        return Response.json({ error: "stints must form a continuous plan in stint order" }, { status: 400 });
      // A completed stint is race history and must survive roster changes.
      if (saved.some((r, i) => new Date(r.ends_at).getTime() <= Date.now() &&
        (String(r.driver_id ?? "") !== ordered[i].driver || new Date(r.starts_at).getTime() !== ordered[i].start.getTime() || new Date(r.ends_at).getTime() !== ordered[i].end.getTime())))
        return Response.json({ error: "completed stints cannot be reassigned or retimed" }, { status: 409 });
      for (const s of parsed) {
        await tx`update event_car_stint set driver_id = ${s.driver || null}, starts_at = ${s.start.toISOString()},
          ends_at = ${s.end.toISOString()}, note = ${s.note} where id = ${s.id} and event_car_id = ${carId}`;
      }
      await tx`update event set updated_at = now() where id = ${id}`;
      await tx`insert into event_update (event_id, event_car_id, author_id, kind, body)
        values (${id}, ${carId}, ${me.id}, 'official', 'The car’s stint plan was updated.')`;
      return null;
    });
    return result ?? Response.json({ ok: true });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
