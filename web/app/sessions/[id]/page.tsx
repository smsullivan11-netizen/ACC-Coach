import { notFound } from "next/navigation";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { lapTime, prettyKey, REASONS } from "@/lib/format";

type Session = {
  id: string;
  recorded: string | null;
  driver: string;
  track: string;
  car: string | null;
  car_class: string | null;
  session_type: string | null;
  source_kind: string;
  source_file: string;
};
type Lap = {
  id: string;
  number: number;
  lap_time_ms: number;
  game_lap_time_ms: number | null;
  official_lap_time_ms: number | null;
  comparable: boolean;
  excluded_reasons: string[];
  metrics: Record<string, number> | null;
};

export default async function SessionPage(props: PageProps<"/sessions/[id]">) {
  await requireDriver();
  const { id } = await props.params;
  if (!/^\d+$/.test(id)) notFound();
  const [session] = await sql<Session[]>`
    select s.id, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon YYYY, HH24:MI') as recorded,
           d.display_name as driver, t.key as track, c.key as car, c.class as car_class,
           s.session_type, s.source_kind, s.source_file
    from session s join driver d on d.id = s.driver_id join track t on t.id = s.track_id
    left join car c on c.id = s.car_id
    where s.id = ${id}`;
  if (!session) notFound();
  const laps = await sql<Lap[]>`
    select l.id, l.number, l.lap_time_ms, l.game_lap_time_ms, l.official_lap_time_ms, l.comparable,
           l.excluded_reasons, l.metrics
    from lap l where l.session_id = ${id} order by l.number`;
  // The most official time available: server results, else the game's, else our own measurement
  const time = (l: Lap) => l.official_lap_time_ms ?? l.game_lap_time_ms ?? l.lap_time_ms;
  const best = Math.min(...laps.filter((l) => l.comparable).map(time));

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">
        {prettyKey(session.track)} · {session.driver}
      </h1>
      <p className="mt-1 text-sm text-zinc-400">
        {session.recorded} · {prettyKey(session.car)} {session.car_class && `(${session.car_class})`} ·{" "}
        <span className="capitalize">{session.session_type ?? "session"}</span> ·{" "}
        {session.source_kind === "shared_memory" ? "recorder" : "MoTeC"} ({session.source_file})
      </p>

      <table className="tabular mt-6 w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr className="border-b border-white/10">
            <th className="py-2 font-normal">Lap</th>
            <th className="text-right font-normal">Time</th>
            <th className="text-right font-normal">Gap</th>
            <th className="pl-6 font-normal">Status</th>
            <th className="text-right font-normal">Full throttle</th>
            <th className="text-right font-normal">Braking</th>
            <th className="text-right font-normal">Top speed</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((l) => {
            const m = l.metrics ?? {};
            const isBest = l.comparable && time(l) === best;
            return (
              <tr key={l.id} className="border-b border-white/5">
                <td className="py-2 text-zinc-400">L{l.number}</td>
                <td className={`text-right ${isBest ? "font-semibold text-purple-300" : l.comparable ? "text-white" : "text-zinc-500"}`}>
                  {lapTime(time(l))}
                </td>
                <td className="text-right text-zinc-400">
                  {l.comparable && Number.isFinite(best) && !isBest ? `+${((time(l) - best) / 1000).toFixed(3)}` : ""}
                </td>
                <td className="pl-6">
                  {l.comparable ? (
                    <span className="text-emerald-400">valid</span>
                  ) : (
                    <span className="text-zinc-500">{l.excluded_reasons.map((r) => REASONS[r] ?? r).join(", ")}</span>
                  )}
                </td>
                <td className="text-right">{m.full_throttle_pct != null ? `${m.full_throttle_pct.toFixed(1)} %` : "–"}</td>
                <td className="text-right">{m.braking_pct != null ? `${m.braking_pct.toFixed(1)} %` : "–"}</td>
                <td className="text-right">{m.max_speed_kmh != null ? `${m.max_speed_kmh.toFixed(0)} km/h` : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-zinc-500">
        Lap times are the game&apos;s when recorded live. Lap charts and lap comparison come next.
      </p>
    </div>
  );
}
