import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { repairStoredTraces } from "@/lib/trace-repair";

// Admins, once after app 0.3: repairs the stored laps whose trace clock disagrees with their lap
// time (pauses counted in, miscalibrated clocks: lib/trace-time.ts) and recomputes those sessions'
// corner results. Lap times, records and ratings do not change. Safe to run again: good traces are
// left alone.
export const maxDuration = 60;

export async function POST() {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  return Response.json(await repairStoredTraces(sql));
}
