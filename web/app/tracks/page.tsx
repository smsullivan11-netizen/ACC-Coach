import Link from "next/link";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { lapTime, prettyKey } from "@/lib/format";

export default async function TracksPage() {
  await requireDriver();
  const tracks = await sql<{ key: string; drivers: number; laps: number; best_ms: number | null }[]>`
    select t.key, count(distinct s.driver_id)::int as drivers,
           count(l.id) filter (where l.comparable)::int as laps,
           min(coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)) filter (where l.comparable) as best_ms
    from track t join session s on s.track_id = t.id join lap l on l.session_id = s.id
    group by t.key order by t.key`;

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">Leaderboards</h1>
      {tracks.length === 0 && <p className="mt-6 text-zinc-400">No laps uploaded yet.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tracks.map((t) => (
          <Link key={t.key} href={`/tracks/${t.key}`} className="rounded-lg border border-white/10 p-4 hover:border-white/30">
            <div className="font-medium text-white">{prettyKey(t.key)}</div>
            <div className="tabular mt-2 text-sm text-zinc-400">
              Best {lapTime(t.best_ms)} · {t.laps} valid laps · {t.drivers} driver{t.drivers === 1 ? "" : "s"}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
