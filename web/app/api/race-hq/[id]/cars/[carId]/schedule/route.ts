import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { canLead } from "@/lib/race-hq";
import { instant, protectStarted, ScheduleError, validateSlots, type SavedSlot, type Slot } from "@/lib/stint-schedule";

export async function PATCH(request: Request, ctx: RouteContext<"/api/race-hq/[id]/cars/[carId]/schedule">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (me.is_reviewer) return Response.json({ error: "The Store Reviewer account cannot book race sessions." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Use Race Day HQ on this site." }, { status: 403 });
  const { id, carId } = await ctx.params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(carId)) return Response.json({ error: "Car not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || !["save", "status", "claim", "release", "qualifier"].includes(body.action) || !Number.isSafeInteger(body.revision) || body.revision < 0)
    return Response.json({ error: "Send a schedule action and its current revision." }, { status: 400 });
  const lead = await canLead(id, me);
  if (["save", "status"].includes(body.action) && !lead) return Response.json({ error: "Race leads only." }, { status: 403 });
  try {
    await sql.begin(async (tx) => {
      // The same lock is used by roster, signup and strategy changes.
      const [event] = await tx`select * from event where id = ${id} for update`;
      if (!event) throw new ScheduleError("Race not found.", 404);
      if (event.archived_at || event.status === "finished") throw new ScheduleError("Finished races are read-only.", 409);
      const [car] = await tx`select * from event_car where id = ${carId} and event_id = ${id}`;
      if (!car) throw new ScheduleError("Car not found in this race.", 404);
      if (car.schedule_revision !== body.revision) throw new ScheduleError("The schedule changed. Reload the latest plan and try again.", 409);
      const saved = await tx<SavedSlot[]>`select id, n, driver_id, starts_at, ends_at, note from event_car_stint where event_car_id = ${carId} order by n`;
      const roster = await tx`select r.driver_id from event_car_driver r join driver d on d.id=r.driver_id where r.event_car_id = ${carId} and d.discord_id is distinct from 'review-store'`;
      const drivers = new Set(roster.map((r) => String(r.driver_id)));
      const start = instant(event.starts_at), end = start + event.duration_min * 60000, now = Date.now();
      const normalize = () => saved.map((s) => ({ id: String(s.id), driver_id: s.driver_id === null ? null : String(s.driver_id),
        starts_at: new Date(s.starts_at).toISOString(), ends_at: new Date(s.ends_at).toISOString(), note: s.note }));
      const checkRoster = (slots: Slot[]) => {
        if (slots.some((s) => instant(s.starts_at) > now && s.driver_id && !drivers.has(s.driver_id)))
          throw new ScheduleError("Future stints can only be assigned to this car’s roster.");
      };
      const checkOverlap = async (slots: Slot[]) => {
        const other = await tx`select s.driver_id, s.starts_at, s.ends_at from event_car_stint s
          join event_car c on c.id = s.event_car_id where c.event_id = ${id} and c.id <> ${carId} and s.driver_id is not null`;
        if (slots.some((s) => s.driver_id && instant(s.ends_at) > now && other.some((o) =>
          String(o.driver_id) === s.driver_id && instant(s.starts_at) < instant(o.ends_at) && instant(s.ends_at) > instant(o.starts_at))))
          throw new ScheduleError("A driver is already scheduled in the other car during that time.", 409);
      };
      let message = "";
      if (body.action === "qualifier") {
        if (!event.qualifying_starts_at) throw new ScheduleError("Set the qualifying time in the event timetable first.",409);
        if (instant(event.qualifying_starts_at)<=now) throw new ScheduleError("Qualifying has started; its assignment is locked.",409);
        const driver = body.driver_id;
        if (driver !== null && (typeof driver!=="string" || !drivers.has(driver))) throw new ScheduleError("Choose a driver from this car’s roster.");
        if (!lead) {
          if (!car.roster_confirmed || !drivers.has(String(me.id))) throw new ScheduleError("Join this car’s confirmed roster first.",403);
          if (car.schedule_status!=="open") throw new ScheduleError("Qualifying booking is closed. Ask a lead to reopen booking.",409);
          if (driver === null ? String(car.qualifying_driver_id)!==String(me.id) : driver!==String(me.id) || car.qualifying_driver_id!==null)
            throw new ScheduleError("Book an open qualifying slot or release only your own.",409);
        }
        if (driver) {
          const [other] = await tx`select id from event_car where event_id=${id} and id<>${carId} and qualifying_driver_id=${driver}`;
          if (other) throw new ScheduleError("This driver is qualifying in another car.",409);
        }
        await tx`update event_car set qualifying_driver_id=${driver} where id=${carId}`;
        if (lead) await tx`update event_car set schedule_status='draft' where id=${carId}`;
        message = driver ? `Qualifying driver assigned: ${driver === String(me.id) ? me.display_name : "car roster updated"}.` : "Qualifying slot released.";
      } else if (body.action === "save") {
        const slots = validateSlots(body.stints, start, end);
        protectStarted(slots, saved, now);
        checkRoster(slots);
        await checkOverlap(slots);
        const keep = new Set(slots.flatMap((s) => s.id ? [s.id] : []));
        for (const old of saved) if (!keep.has(String(old.id))) await tx`delete from event_car_stint where id = ${old.id}`;
        // Avoid transient collisions on unique(car,n) while splitting/merging rows.
        await tx`update event_car_stint set n = n + 100000 where event_car_id = ${carId} and starts_at > ${new Date(now).toISOString()}`;
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i];
          if (instant(s.starts_at) <= now) continue;
          if (s.id) await tx`update event_car_stint set n = ${i + 1}, driver_id = ${s.driver_id}, starts_at = ${s.starts_at}, ends_at = ${s.ends_at}, note = ${s.note} where id = ${s.id} and event_car_id = ${carId}`;
          else await tx`insert into event_car_stint (event_car_id, n, driver_id, starts_at, ends_at, note)
            values (${carId}, ${i + 1}, ${s.driver_id}, ${s.starts_at}, ${s.ends_at}, ${s.note})`;
        }
        // Any lead edit needs a fresh review before booking or confirmation.
        await tx`update event_car set schedule_status = 'draft' where id = ${carId}`;
        message = "Stint schedule edited; returned to draft for review.";
      } else if (body.action === "status") {
        if (!["draft", "open", "confirmed"].includes(body.status)) throw new ScheduleError("Choose draft, open or confirmed.");
        if (body.status !== "draft") {
          if (!car.roster_confirmed || drivers.size < 4 || drivers.size > 6) throw new ScheduleError("Confirm this car’s 4–6 driver roster first.", 409);
          const slots = validateSlots(normalize(), start, end);
          checkRoster(slots);
          if (event.qualifying_starts_at && instant(event.qualifying_starts_at)>now && car.qualifying_driver_id && !drivers.has(String(car.qualifying_driver_id)))
            throw new ScheduleError("Choose a qualifying driver from the current roster.",409);
          if (body.status==="confirmed" && event.qualifying_starts_at && !car.qualifying_driver_id)
            throw new ScheduleError("Assign this car’s qualifying slot before confirming.",409);
          await checkOverlap(slots);
          if (body.status === "confirmed" && slots.some((s) => !s.driver_id)) throw new ScheduleError("Assign every open slot before confirming the schedule.", 409);
        }
        await tx`update event_car set schedule_status = ${body.status} where id = ${carId}`;
        message = body.status === "open" ? "Stint booking opened for this car’s drivers." : body.status === "confirmed" ? "Stint schedule confirmed." : "Stint schedule returned to draft.";
      } else {
        if (car.schedule_status !== "open") throw new ScheduleError("Booking is closed. Ask a race lead to open this car’s schedule.", 409);
        if (!car.roster_confirmed || !drivers.has(String(me.id))) throw new ScheduleError("You must be on this car’s confirmed roster to book a stint.", 403);
        if (typeof body.stint_id !== "string" || !/^\d+$/.test(body.stint_id)) throw new ScheduleError("Choose a stint.");
        const slot = saved.find((s) => String(s.id) === body.stint_id);
        if (!slot) throw new ScheduleError("Stint not found in this car.", 404);
        if (instant(slot.starts_at) <= now) throw new ScheduleError("Started and completed stints cannot be booked or released.", 409);
        if (body.action === "claim") {
          if (slot.driver_id !== null) throw new ScheduleError("That stint has already been booked. Choose an open slot.", 409);
          const proposed = normalize().map((s) => s.id === body.stint_id ? { ...s, driver_id: String(me.id) } : s);
          await checkOverlap(proposed);
          await tx`update event_car_stint set driver_id = ${me.id} where id = ${slot.id}`;
          message = `${me.display_name} booked stint ${slot.n}.`;
        } else {
          if (String(slot.driver_id) !== String(me.id)) throw new ScheduleError("You can only release your own stint.", 403);
          await tx`update event_car_stint set driver_id = null where id = ${slot.id}`;
          message = `${me.display_name} released stint ${slot.n}.`;
        }
      }
      await tx`update event_car set schedule_revision = schedule_revision + 1 where id = ${carId}`;
      await tx`update event set updated_at = now() where id = ${id}`;
      await tx`insert into event_update (event_id, event_car_id, author_id, kind, body)
        values (${id}, ${carId}, ${me.id}, ${lead && ["save", "status", "qualifier"].includes(body.action) ? "official" : "system"}, ${message})`;
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ScheduleError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
