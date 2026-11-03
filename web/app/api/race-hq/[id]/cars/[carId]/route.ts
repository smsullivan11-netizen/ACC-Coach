import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { canLead } from "@/lib/race-hq";
import { generateCarPlan } from "@/lib/race-car-plan";

class EditError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const numeric = (value: unknown, max: number, integer = false) => {
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value)))
    throw new EditError(`Enter a ${integer ? "whole " : ""}number between 0 and ${max}, or leave it blank.`);
  return value;
};
const text = (value: unknown, max: number) => {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new EditError(`Text must be ${max} characters or fewer.`);
  return value.trim() || null;
};

export async function PATCH(request: Request, ctx: RouteContext<"/api/race-hq/[id]/cars/[carId]">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Use Race Day HQ on this site." }, { status: 403 });
  const { id, carId } = await ctx.params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(carId)) return Response.json({ error: "Car not found." }, { status: 404 });
  if (!(await canLead(id, me))) return Response.json({ error: "Race leads only." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || !["roster", "strategy", "generate"].includes(body.action)) return Response.json({ error: "Invalid car change." }, { status: 400 });
  try {
    await sql.begin(async (tx) => {
      // Serializes roster, signup, strategy and plan edits for the entire event.
      const [event] = await tx`select *, starts_at > now() as before_start from event where id = ${id} for update`;
      if (!event || event.archived_at || event.status === "finished") throw new EditError("Archived races are read-only.", 409);
      const [car] = await tx`select * from event_car where id = ${carId} and event_id = ${id}`;
      if (!car) throw new EditError("Car not found in this race.", 404);
      if (body.action === "roster") {
        const drivers: unknown = body.driver_ids;
        if (!Array.isArray(drivers) || drivers.length > 6 || drivers.some((d) => typeof d !== "string" || !/^\d+$/.test(d)) || new Set(drivers).size !== drivers.length || typeof body.confirmed !== "boolean")
          throw new EditError("Choose up to six different drivers.");
        const ids = drivers as string[];
        if (body.confirmed && ids.length < 4) throw new EditError("A confirmed roster needs 4–6 drivers.");
        if (ids.length) {
          const eligible = await tx`select driver_id from event_signup where event_id = ${id}
            union select driver_id from event_car_driver where event_id = ${id} and event_car_id = ${carId}`;
          const allowed = new Set(eligible.map((r) => String(r.driver_id)));
          if (ids.some((d) => !allowed.has(d))) throw new EditError("Drivers must sign up before being added to a car.");
          const assigned = await tx`select driver_id from event_car_driver where event_id = ${id} and event_car_id <> ${carId}`;
          if (assigned.some((r) => ids.includes(String(r.driver_id)))) throw new EditError("A driver can belong to only one car in this race.", 409);
        }
        await tx`delete from event_car_driver where event_id = ${id} and event_car_id = ${carId}`;
        for (let i = 0; i < ids.length; i++) await tx`insert into event_car_driver (event_id, event_car_id, driver_id, sort_order) values (${id}, ${carId}, ${ids[i]}, ${i})`;
        // Keep historical stints; clear only unfinished assignments outside the new roster.
        if (ids.length) await tx`update event_car_stint set driver_id = null where event_car_id = ${carId} and ends_at > now() and driver_id not in ${tx(ids)}`;
        else await tx`update event_car_stint set driver_id = null where event_car_id = ${carId} and ends_at > now()`;
        await tx`update event_car set roster_confirmed = ${body.confirmed} where id = ${carId}`;
      } else if (body.action === "strategy") {
        const s = body.strategy;
        if (!s || !Number.isInteger(s.stint_min) || s.stint_min < 10 || s.stint_min > 240) throw new EditError("Stint length must be 10–240 whole minutes.");
        const start = numeric(s.starting_fuel_l, 200), refuel = numeric(s.refuel_l, 200), reserve = numeric(s.reserve_l, 50);
        const stops = numeric(s.min_pit_stops, 100, true), window = text(s.pit_window, 300), notes = text(s.notes, 4000);
        if (s.tyre_plan !== null && !["every_stop", "as_needed", "no_change"].includes(s.tyre_plan)) throw new EditError("Choose a tyre plan.");
        await tx`insert into event_car_strategy (event_car_id, stint_min, starting_fuel_l, refuel_l, reserve_l, tyre_plan, min_pit_stops, pit_window, notes)
          values (${carId}, ${s.stint_min}, ${start}, ${refuel}, ${reserve}, ${s.tyre_plan}, ${stops}, ${window}, ${notes})
          on conflict (event_car_id) do update set stint_min = excluded.stint_min, starting_fuel_l = excluded.starting_fuel_l,
            refuel_l = excluded.refuel_l, reserve_l = excluded.reserve_l, tyre_plan = excluded.tyre_plan,
            min_pit_stops = excluded.min_pit_stops, pit_window = excluded.pit_window, notes = excluded.notes`;
      } else {
        if (event.status !== "upcoming" || !event.before_start) throw new EditError("Rebuild plans only before the race starts. Edit live stints individually.", 409);
        const drivers = await tx`select driver_id from event_car_driver where event_car_id = ${carId} order by sort_order, driver_id`;
        if (!car.roster_confirmed || drivers.length < 4 || drivers.length > 6) throw new EditError("Confirm this car’s 4–6 driver roster first.", 409);
        const [strategy] = await tx`select stint_min from event_car_strategy where event_car_id = ${carId}`;
        await generateCarPlan(tx, carId, new Date(event.starts_at).toISOString(), event.duration_min, strategy?.stint_min ?? 65, drivers.map((r) => String(r.driver_id)));
      }
      await tx`update event set updated_at = now() where id = ${id}`;
      await tx`insert into event_update (event_id, event_car_id, author_id, kind, body)
        values (${id}, ${carId}, ${me.id}, 'official', ${body.action === "roster" ? "Car roster updated." : body.action === "strategy" ? "Car strategy updated." : "Car stint plan rebuilt from its roster and strategy."})`;
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof EditError) return Response.json({ error: error.message }, { status: error.status });
    if ((error as { code?: string }).code === "23505") return Response.json({ error: "A driver is already assigned to another car. Refresh and try again." }, { status: 409 });
    throw error;
  }
}
