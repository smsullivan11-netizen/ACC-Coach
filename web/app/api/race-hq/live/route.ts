import { driverFromRequest } from "@/lib/auth";
import { sql } from "@/lib/db";

// The linked Windows app posts ACC's live session timer. A driver can update only an active event
// whose plan includes them and whose track matches the game. The bearer token already belongs to
// that driver, so no separate always-on credential is introduced.
export async function POST(request: Request) {
  const driver = await driverFromRequest(request);
  if (!driver) return Response.json({ error: "valid upload token required" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { track?: string; remaining_s?: number; session?: string } | null;
  const track = body?.track?.trim().toLowerCase() ?? "", seconds = Math.round(Number(body?.remaining_s));
  if (!/^[a-z0-9_-]+$/.test(track) || !Number.isFinite(seconds) || seconds < 0 || seconds > 24 * 3600 || body?.session !== "race")
    return Response.json({ error: "live race timing expected" }, { status: 400 });
  const [event] = await sql<{ id: string }[]>`
    select distinct e.id from event e join event_car c on c.event_id = e.id
    join event_car_stint s on s.event_car_id = c.id
    where e.status in ('upcoming', 'live') and e.archived_at is null and e.track_key = ${track}
      and s.driver_id = ${driver.id}
      and now() between e.starts_at - interval '6 hours'
                    and e.starts_at + make_interval(mins => e.duration_min) + interval '6 hours'
    limit 1`;
  if (!event) return Response.json({ ok: true, matched: false });
  await sql`update event set status = 'live', clock_remaining_s = ${seconds}, clock_updated_at = now(),
            clock_source = 'acc', updated_at = now() where id = ${event.id}`;
  return Response.json({ ok: true, matched: true, event_id: event.id });
}
