import { MonitorPlay, Play, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { delay, PageTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { lapTime, prettyKey } from "@/lib/format";
import { hasPhoto, photoUrl, trackInfo } from "@/lib/tracks";
import LapPicker, { type PickLap } from "./LapPicker";

export const metadata: Metadata = { title: "Telemetry" };


// Telemetry and replay, one click from the top bar: pick a track, then your lap and the one to
// compare with, and open the replay or the charts. Defaults: your last track, your best lap there
// against the team's best.
export default async function TelemetryPage(props: PageProps<"/telemetry">) {
  const me = await requireDriver();
  const { track: asked } = await props.searchParams;
  const tracks = await sql<{ id: string; key: string; laps: number; last: Date }[]>`
    select t.id, t.key, count(l.id)::int as laps, max(coalesce(s.recorded_at, s.uploaded_at)) as last,
           bool_or(s.driver_id = ${me.id}) as mine
    from track t join session s on s.track_id = t.id join lap l on l.session_id = s.id join lap_trace tr on tr.lap_id = l.id
    where not 'track_edges' = any(l.excluded_reasons)
    group by t.id, t.key order by bool_or(s.driver_id = ${me.id}) desc, max(coalesce(s.recorded_at, s.uploaded_at)) desc`;
  const current = tracks.find((t) => t.key === asked) ?? tracks[0];

  const laps = current ? await sql<PickLap[]>`
    select l.id, l.number, d.id as driver_id, d.display_name as driver, d.avatar_url, c.key as car,
           coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as time_ms, l.comparable,
           to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon') as date, r.position::int as position,
           tr.channels ? 'pos_x_m' as positions
    from lap l join session s on s.id = l.session_id join driver d on d.id = s.driver_id left join car c on c.id = s.car_id
    join lap_trace tr on tr.lap_id = l.id left join lap_ranking r on r.lap_id = l.id
    where s.track_id = ${current.id} and not 'track_edges' = any(l.excluded_reasons)
    order by r.position is null, l.comparable desc, 7 limit 60` : [];

  const myBest = laps.find((l) => l.driver_id === me.id && l.position != null);
  const teamBest = laps.find((l) => l.position === 1 && l.id !== myBest?.id);

  return (
    <div>
      <PageTitle icon={MonitorPlay} sub="Watch two laps side by side on the track, or dig into the charts: speed, inputs, gear, time gap and every corner.">
        Telemetry &amp; replay
      </PageTitle>

      {tracks.length === 0 ? (
        <p className="card p-6 text-zinc-400">No lap recorded yet. <Link href="/download" className="text-accent underline">Get the app</Link> and drive.</p>
      ) : (
        <>
          {/* 1. Track */}
          <h2 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            <span className="display grid h-5 w-5 place-items-center rounded bg-race text-[10px] text-white">1</span> Track
          </h2>
          <div className="rise -mx-1 flex gap-3 overflow-x-auto px-1 pb-2 pt-1">
            {tracks.map((t) => {
              const on = t.key === current.key;
              return (
                <Link key={t.key} href={`/telemetry?track=${t.key}`} scroll={false}
                      className={`card relative h-24 w-44 shrink-0 overflow-hidden transition ${on ? "ring-2 ring-accent" : "opacity-70 hover:opacity-100"}`}>
                  {hasPhoto(t.key) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl(t.key)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5">
                    <div className="truncate text-sm font-semibold text-white">{trackInfo(t.key)?.name ?? prettyKey(t.key)}</div>
                    <div className="text-[11px] text-zinc-400">{t.laps} lap{t.laps === 1 ? "" : "s"}</div>
                  </div>
                </Link>
              );
            })}
          </div>

          {myBest && teamBest && (
            <Link href={`/laps/${myBest.id}?vs=${teamBest.id}&replay=1`}
                  className="card card-hover rise mt-5 flex flex-wrap items-center gap-4 p-4" style={delay(60)}>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-race/15 text-race"><Zap size={20} /></span>
              <div className="min-w-0">
                <div className="font-medium text-white">Quick replay: your best vs the team best</div>
                <div className="tabular text-sm text-zinc-400">
                  <span className="text-accent">{lapTime(myBest.time_ms)}</span> against {teamBest.driver}&apos;s {lapTime(teamBest.time_ms)}
                  {" "}· {myBest.time_ms >= teamBest.time_ms ? "+" : ""}{((myBest.time_ms - teamBest.time_ms) / 1000).toFixed(3)} s
                </div>
              </div>
              <span className="btn btn-primary ml-auto"><Play size={15} fill="currentColor" /> Watch</span>
            </Link>
          )}

          {/* 2-3. Laps */}
          <LapPicker key={current.key} laps={laps} me={me.id} />
        </>
      )}
    </div>
  );
}
