import { GitCompareArrows, Play, Swords } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, delay, PageTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { carShortName, lapTime } from "@/lib/format";
import { hasPhoto, photoUrl, trackInfo } from "@/lib/tracks";

export const metadata: Metadata = { title: "Head to head" };

type D = { id: string; display_name: string; avatar_url: string | null; rating: number | null };
type Shared = { track: string; car_class: string | null; a_lap: string; a_ms: number; a_car: string | null; b_lap: string; b_ms: number; b_car: string | null;
                a_corners: number; b_corners: number; corners: number };

// Two drivers side by side: every track and class they have both driven, who is faster, and through
// how many corners each one is faster (best pass per corner, latest corner map). Cooperation first:
// each row links to the replay of both laps.
export default async function HeadToHead(props: PageProps<"/drivers/compare">) {
  const me = await requireDriver();
  const q = await props.searchParams;
  const drivers = await sql<D[]>`
    select d.id, d.display_name, d.avatar_url,
           (select rating from driver_rating where driver_id = d.id order by id desc limit 1) as rating
    from driver d where exists (select 1 from session s where s.driver_id = d.id) order by d.display_name`;
  const pick = (v: unknown, fallback?: string) => (typeof v === "string" && drivers.some((d) => d.id === v) ? v : fallback);
  const aId = pick(q.a, drivers.some((d) => d.id === me.id) ? me.id : drivers[0]?.id);
  const bId = pick(q.b, drivers.find((d) => d.id !== aId)?.id);
  const A = drivers.find((d) => d.id === aId), B = drivers.find((d) => d.id === bId);

  const rows = A && B && A.id !== B.id ? await sql<Shared[]>`
    with map as (select distinct on (track_id) id, track_id from corner_map order by track_id, version desc)
    select t.key as track, a.car_class, a.lap_id as a_lap, a.lap_time_ms as a_ms, ca.key as a_car,
           b.lap_id as b_lap, b.lap_time_ms as b_ms, cb.key as b_car,
           count(*) filter (where xa.time_s < xb.time_s)::int as a_corners,
           count(*) filter (where xb.time_s < xa.time_s)::int as b_corners,
           count(xa.corner_number)::int as corners
    from best_lap a join best_lap b on b.track_id = a.track_id and b.car_class is not distinct from a.car_class and b.driver_id = ${B.id}
    join track t on t.id = a.track_id left join car ca on ca.id = a.car_id left join car cb on cb.id = b.car_id
    left join map on map.track_id = a.track_id
    left join corner_best xa on xa.corner_map_id = map.id and xa.driver_id = a.driver_id and xa.car_class is not distinct from a.car_class
    left join corner_best xb on xb.corner_map_id = map.id and xb.driver_id = b.driver_id and xb.car_class is not distinct from a.car_class
                             and xb.corner_number = xa.corner_number
    where a.driver_id = ${A.id}
    group by t.key, a.car_class, a.lap_id, a.lap_time_ms, ca.key, b.lap_id, b.lap_time_ms, cb.key
    order by t.key` : [];
  const aWins = rows.filter((r) => r.a_ms < r.b_ms).length, bWins = rows.filter((r) => r.b_ms < r.a_ms).length;
  const aCorners = rows.reduce((s, r) => s + r.a_corners, 0), bCorners = rows.reduce((s, r) => s + r.b_corners, 0);

  return (
    <div>
      <PageTitle icon={Swords} sub="Two drivers on every track they have both driven: who is faster, where, and the replay to learn from each other.">
        Head to head
      </PageTitle>
      <form className="card rise mb-6 flex flex-wrap items-center gap-3 p-4">
        <select name="a" defaultValue={aId} className="input min-w-40 flex-1">{drivers.map((d) => <option key={d.id} value={d.id}>{d.display_name}</option>)}</select>
        <span className="display text-race">VS</span>
        <select name="b" defaultValue={bId} className="input min-w-40 flex-1">{drivers.map((d) => <option key={d.id} value={d.id}>{d.display_name}</option>)}</select>
        <button className="btn btn-primary"><GitCompareArrows size={15} /> Compare</button>
      </form>

      {A && B && A.id !== B.id ? (
        <>
          <div className="card card-red rise grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-6" style={delay(60)}>
            <Side d={A} wins={aWins} corners={aCorners} />
            <div className="display text-center text-3xl text-zinc-500">
              <span className={aWins >= bWins ? "text-accent" : "text-white"}>{aWins}</span>
              <span className="mx-2 text-race">–</span>
              <span className={bWins >= aWins ? "text-accent" : "text-white"}>{bWins}</span>
              <div className="mt-1 font-sans text-xs uppercase tracking-wider text-zinc-500">tracks won</div>
            </div>
            <Side d={B} wins={bWins} corners={bCorners} right />
          </div>

          {rows.length === 0 ? (
            <p className="card mt-5 p-6 text-zinc-400">{A.display_name} and {B.display_name} have no track in common yet (with a valid lap in the same class).</p>
          ) : (
            <div className="mt-5 space-y-3">
              {rows.map((r, i) => {
                const gap = (r.a_ms - r.b_ms) / 1000;
                const aFaster = gap < 0;
                return (
                  <div key={`${r.track}-${r.car_class}`} className="card rise flex flex-wrap items-center gap-4 overflow-hidden pr-4" style={delay(100 + i * 40)}>
                    {hasPhoto(r.track) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl(r.track)} alt="" className="h-20 w-36 shrink-0 object-cover" />
                    ) : <div className="h-20 w-36 shrink-0 bg-white/5" />}
                    <div className="min-w-40">
                      <div className="font-medium text-white">{trackInfo(r.track)?.name ?? r.track}</div>
                      <div className="text-xs text-zinc-500">{r.car_class ?? "Other"}{r.corners > 0 && ` · corners ${r.a_corners}–${r.b_corners}`}</div>
                    </div>
                    <div className="tabular ml-auto flex items-center gap-5 text-sm">
                      <Time ms={r.a_ms} car={r.a_car} win={aFaster} />
                      <span className={`w-20 text-center font-semibold ${gap === 0 ? "text-zinc-400" : aFaster ? "text-emerald-400" : "text-red-400"}`}>
                        {gap === 0 ? "tie" : `${gap > 0 ? "+" : ""}${gap.toFixed(3)}`}
                      </span>
                      <Time ms={r.b_ms} car={r.b_car} win={!aFaster && gap !== 0} />
                    </div>
                    <Link href={`/laps/${r.a_lap}?vs=${r.b_lap}&replay=1`} className="btn btn-primary px-3 py-1.5 text-xs">
                      <Play size={13} fill="currentColor" /> Replay
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <p className="card p-6 text-zinc-400">Pick two different drivers.</p>
      )}
    </div>
  );
}

function Side({ d, wins, corners, right }: { d: D; wins: number; corners: number; right?: boolean }) {
  return (
    <Link href={`/drivers/${d.id}`} className={`flex items-center gap-4 ${right ? "flex-row-reverse text-right" : ""}`}>
      <Avatar url={d.avatar_url} name={d.display_name} size={64} ring />
      <div className="min-w-0">
        <div className="display truncate text-xl text-white">{d.display_name}</div>
        <div className="tabular text-sm text-zinc-400">
          rating <span className="font-semibold text-accent">{d.rating != null ? d.rating.toFixed(1) : "–"}</span>
        </div>
        <div className="text-xs text-zinc-500">{wins} track{wins === 1 ? "" : "s"} · faster through {corners} corner{corners === 1 ? "" : "s"}</div>
      </div>
    </Link>
  );
}

function Time({ ms, car, win }: { ms: number; car: string | null; win: boolean }) {
  return (
    <div className="text-center">
      <div className={`font-semibold ${win ? "text-accent" : "text-white"}`}>{lapTime(ms)}</div>
      <div className="text-[11px] text-zinc-500">{car ? carShortName(car) : "–"}</div>
    </div>
  );
}
