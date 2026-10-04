import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { parseLapTime } from "@/lib/targets";

// Target lap time of a track and car (admins). Body: { track: "brands_hatch", car: "ford_mustang_gt3",
// time: "1:22.570" }; time empty or null removes the target (the team's best lap is then the reference).
export async function POST(request: Request) {
  const driver = await currentDriver();
  if (!driver?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { track?: string; car?: string; time?: string | null };
  const { car, time } = body;
  let { track } = body;
  const key = /^[A-Za-z0-9_]{2,60}$/;
  if (!track || !car || !key.test(track) || !key.test(car)) return Response.json({ error: "track and car keys expected" }, { status: 400 });
  track = track.toLowerCase();   // targets are keyed by the lowercase track key
  if (!time) {
    await sql`delete from car_target where track_key = ${track} and car_key = ${car}`;
    return Response.json({ ok: true, target_ms: null });
  }
  const ms = parseLapTime(time);
  if (!ms) return Response.json({ error: "lap time format: 1:24.500" }, { status: 400 });
  await sql`
    insert into car_target (track_key, car_key, target_ms, source, set_by) values (${track}, ${car}, ${ms}, ${"set by " + driver.display_name}, ${driver.id})
    on conflict (track_key, car_key) do update set target_ms = excluded.target_ms, source = excluded.source,
                                                  set_by = excluded.set_by, set_at = now()`;
  return Response.json({ ok: true, target_ms: ms });
}
