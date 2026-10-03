import Link from "next/link";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { lapTime, prettyKey } from "@/lib/format";

type Row = {
  id: string;
  recorded: string | null;
  driver: string;
  track: string;
  car: string | null;
  session_type: string | null;
  source_kind: string;
  laps: number;
  valid_laps: number;
  best_ms: number | null;
};

export default async function SessionsPage() {
  await requireDriver();
  const sessions = await sql<Row[]>`
    select s.id, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon YYYY, HH24:MI') as recorded,
           d.display_name as driver, t.key as track, c.key as car, s.session_type, s.source_kind,
           count(l.id)::int as laps, count(l.id) filter (where l.comparable)::int as valid_laps,
           min(coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)) filter (where l.comparable) as best_ms
    from session s
    join driver d on d.id = s.driver_id
    join track t on t.id = s.track_id
    left join car c on c.id = s.car_id
    left join lap l on l.session_id = s.id
    group by s.id, d.display_name, t.key, c.key
    order by coalesce(s.recorded_at, s.uploaded_at) desc
    limit 200`;

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">Sessions</h1>
      {sessions.length === 0 ? (
        <p className="mt-6 text-zinc-400">
          No session yet. <Link href="/upload" className="underline">Upload one</Link>.
        </p>
      ) : (
        <table className="tabular mt-4 w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr className="border-b border-white/10">
              <th className="py-2 font-normal">Date</th>
              <th className="font-normal">Driver</th>
              <th className="font-normal">Track</th>
              <th className="font-normal">Car</th>
              <th className="font-normal">Session</th>
              <th className="text-right font-normal">Laps (valid)</th>
              <th className="text-right font-normal">Best lap</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-2">
                  <Link href={`/sessions/${s.id}`} className="text-white hover:underline">{s.recorded}</Link>
                </td>
                <td>{s.driver}</td>
                <td>{prettyKey(s.track)}</td>
                <td className="text-zinc-300">{prettyKey(s.car)}</td>
                <td className="capitalize text-zinc-400">{s.session_type ?? "–"}</td>
                <td className="text-right">
                  {s.laps} <span className="text-zinc-500">({s.valid_laps})</span>
                </td>
                <td className="text-right font-medium text-white">{lapTime(s.best_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
