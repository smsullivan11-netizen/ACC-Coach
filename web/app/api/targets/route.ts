import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

// Target lap time of a track and car class (admins). Body: { track, car_class, time: "1:24.500" }.
// time empty or null removes the target (the team's best lap is then the only reference).

function parseLapTime(s: string): number | null {
  const m = /^\s*(?:(\d+):)?(\d{1,2}(?:\.\d{1,3})?)\s*$/.exec(s);
  if (!m) return null;
  const ms = Math.round(((m[1] ? +m[1] : 0) * 60 + +m[2]) * 1000);
  return ms > 10_000 && ms < 3_600_000 ? ms : null;
}

export async function POST(request: Request) {
  const driver = await currentDriver();
  if (!driver?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { track, car_class, time } = (await request.json().catch(() => ({}))) as {
    track?: string; car_class?: string; time?: string | null;
  };
  const [t] = await sql<{ id: string }[]>`select id from track where key = ${track ?? ""}`;
  if (!t || !car_class) return Response.json({ error: "unknown track or class" }, { status: 400 });
  if (!time) {
    await sql`delete from track_target where track_id = ${t.id} and car_class = ${car_class}`;
    return Response.json({ ok: true, target_ms: null });
  }
  const ms = parseLapTime(time);
  if (!ms) return Response.json({ error: "lap time format: 1:24.500" }, { status: 400 });
  await sql`
    insert into track_target (track_id, car_class, target_ms, set_by) values (${t.id}, ${car_class}, ${ms}, ${driver.id})
    on conflict (track_id, car_class) do update set target_ms = excluded.target_ms, set_by = excluded.set_by, set_at = now()`;
  return Response.json({ ok: true, target_ms: ms });
}
