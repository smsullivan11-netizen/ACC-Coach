import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { raceHQ, raceMembers } from "@/lib/race-hq";

type NewCar = { number?: string; name?: string; car_key?: string; driver_ids?: string[] };
type NewRace = {
  title?: string; track_key?: string; starts_at?: string; duration_min?: number;
  league?: string; server?: string; notes?: string; stint_min?: number; cars?: NewCar[];
};

const clean = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";

export async function GET(request: Request) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (id && !/^\d+$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const [data, members] = await Promise.all([raceHQ(id, me), raceMembers()]);
  return Response.json({ data, members });
}

export async function POST(request: Request) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as NewRace | null;
  const title = clean(body?.title, 120), track = clean(body?.track_key, 80).toLowerCase();
  const starts = new Date(body?.starts_at ?? "");
  const duration = Number(body?.duration_min), stintMin = Number(body?.stint_min ?? 65);
  const cars = Array.isArray(body?.cars) ? body.cars.slice(0, 4) : [];
  if (!title || !/^[a-z0-9_-]+$/.test(track) || Number.isNaN(starts.getTime()))
    return Response.json({ error: "title, track and start time are required" }, { status: 400 });
  if (!Number.isInteger(duration) || duration < 30 || duration > 24 * 60)
    return Response.json({ error: "race duration must be between 30 minutes and 24 hours" }, { status: 400 });
  if (!Number.isInteger(stintMin) || stintMin < 10 || stintMin > 240)
    return Response.json({ error: "planned stint length must be between 10 and 240 minutes" }, { status: 400 });
  if (!cars.length || cars.some((c) => !/^\d{1,5}$/.test(clean(c.number, 5)) || !clean(c.name, 100)))
    return Response.json({ error: "add at least one car with a number and name" }, { status: 400 });
  if (cars.some((c) => !Array.isArray(c.driver_ids) || c.driver_ids.length < 1 || c.driver_ids.length > 6))
    return Response.json({ error: "choose between one and six drivers for every car" }, { status: 400 });
  const requestedDrivers = [...new Set(cars.flatMap((c) => c.driver_ids ?? []).filter((id) => /^\d+$/.test(id)))];
  const realDrivers = requestedDrivers.length
    ? await sql<{ id: string }[]>`select id from driver where id in ${sql(requestedDrivers)}` : [];
  const valid = new Set(realDrivers.map((d) => String(d.id)));
  if (cars.some((c) => !c.driver_ids?.length || c.driver_ids.some((id) => !valid.has(id))))
    return Response.json({ error: "choose valid drivers for every car" }, { status: 400 });

  try {
    const eventId = await sql.begin(async (tx) => {
      const [event] = await tx<{ id: string }[]>`
        insert into event (title, track_key, starts_at, duration_min, kind, league, server, notes,
                           min_pit_stops, created_by, status, clock_source)
        values (${title}, ${track}, ${starts.toISOString()}, ${duration},
                ${duration >= 120 ? "endurance" : "sprint"}, ${clean(body?.league, 100) || null},
                ${clean(body?.server, 200) || null}, ${clean(body?.notes, 4000) || null}, 0,
                ${me.id}, 'upcoming', 'schedule') returning id`;
      await tx`insert into event_role (event_id, driver_id, role) values (${event.id}, ${me.id}, 'lead')`;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i], drivers = c.driver_ids!;
        const [car] = await tx<{ id: string }[]>`
          insert into event_car (event_id, number, name, car_key, sort_order)
          values (${event.id}, ${clean(c.number, 5)}, ${clean(c.name, 100)}, ${clean(c.car_key, 80) || null}, ${i})
          returning id`;
        let offset = 0, n = 1;
        while (offset < duration) {
          const end = Math.min(duration, offset + stintMin);
          // Two planned stints per driver gives each driver a useful driving block and recovery time.
          const driverId = drivers[Math.floor((n - 1) / 2) % drivers.length];
          await tx`insert into event_car_stint (event_car_id, n, driver_id, starts_at, ends_at)
                   values (${car.id}, ${n}, ${driverId},
                           ${new Date(starts.getTime() + offset * 60_000).toISOString()},
                           ${new Date(starts.getTime() + end * 60_000).toISOString()})`;
          offset = end; n++;
        }
      }
      await tx`insert into event_update (event_id, author_id, kind, body)
               values (${event.id}, ${me.id}, 'system', ${`${me.display_name} created the race plan.`})`;
      return event.id;
    });
    return Response.json({ ok: true, event_id: eventId });
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      return Response.json({ error: "finish or archive the active race before creating another" }, { status: 409 });
    throw error;
  }
}
