import { GitCompareArrows, Play, Swords } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, delay, PageTitle, Segmented, ZONE_OPTIONS } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { carShortName, lapTime } from "@/lib/format";
import { zoneMode, type ZoneMode } from "@/lib/sections";
import { sectionsFromLaps, sectionTables } from "@/lib/sections-db";
import { hasPhoto, photoUrl, trackInfo } from "@/lib/tracks";

export const metadata: Metadata = { title: "Head to head" };

type D = { id: string; display_name: string; avatar_url: string | null; rating: number | null };
type Shared = { track: string; car_class: string | null; map_id: string | null; a_lap: string; a_ms: number; a_car: string | null;
                b_lap: string; b_ms: number; b_car: string | null; a_corners: number; b_corners: number; corners: number };

/** Sections each driver is faster through (best pass through each section on one lap, same map and
 *  class). The sections come from both drivers' best laps on the map (linked on either). */
async function sectionCounts(r: Shared, aId: string, bId: string) {
  if (!r.map_id) return { a: 0, b: 0, total: 0 };
  const best = await sql<{ id: string }[]>`
    select distinct on (ss.driver_id) l.id
    from lap l join session ss on ss.id = l.session_id left join car c on c.id = ss.car_id
    where l.comparable and ss.driver_id in (${aId}, ${bId}) and c.class is not distinct from ${r.car_class}
      and exists (select 1 from corner_result cr where cr.lap_id = l.id and cr.corner_map_id = ${r.map_id})
    order by ss.driver_id, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)`;
  const sections = await sectionsFromLaps(r.map_id, best.map((x) => x.id));
  const bests = await sql<{ driver_id: string; s: number; t: number }[]>`
    with ${sectionTables(sections, r.map_id)}
    select ss.driver_id, x.s, min(x.t) as t
    from lapsec x join lap l on l.id = x.lap_id join session ss on ss.id = l.session_id left join car c on c.id = ss.car_id
    where ss.driver_id in (${aId}, ${bId}) and c.class is not distinct from ${r.car_class}
    group by 1, 2`;
  let a = 0, b = 0, total = 0;
  sections.forEach((_, s) => {
    const ta = bests.find((x) => x.s === s && x.driver_id === aId)?.t, tb = bests.find((x) => x.s === s && x.driver_id === bId)?.t;
    if (ta == null || tb == null) return;
    total++;
    if (ta < tb) a++;
    else if (tb < ta) b++;
  });
  return { a, b, total };
}

// Two drivers side by side: every track and class they have both driven, who is faster, and through
// how many corners, or sections (corners driven as one, `?by=sections`), each one is faster (best
// pass, latest corner map). Cooperation first: each row links to the replay of both laps.
export default async function HeadToHead(props: PageProps<"/drivers/compare">) {
  const me = await requireDriver();
  const q = await props.searchParams;
  const by: ZoneMode = zoneMode(q.by) ?? "corners";
  const drivers = await sql<D[]>`
    select d.id, d.display_name, d.avatar_url,
           (select rating from driver_rating where driver_id = d.id order by id desc limit 1) as rating
    from driver d where exists (select 1 from session s where s.driver_id = d.id) order by d.display_name`;
  const pick = (v: unknown, fallback?: string) => (typeof v === "string" && drivers.some((d) => d.id === v) ? v : fallback);
  const aId = pick(q.a, drivers.some((d) => d.id === me.id) ? me.id : drivers[0]?.id);
  const bId = pick(q.b, drivers.find((d) => d.id !== aId)?.id);
  const A = drivers.find((d) => d.id === aId), B = drivers.find((d) => d.id === bId);

  const found = A && B && A.id !== B.id ? await sql<Shared[]>`
    with map as (select distinct on (track_id) id, track_id from corner_map order by track_id, version desc)
    select t.key as track, a.car_class, map.id as map_id, a.lap_id as a_lap, a.lap_time_ms as a_ms, ca.key as a_car,
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
    group by t.key, a.car_class, map.id, a.lap_id, a.lap_time_ms, ca.key, b.lap_id, b.lap_time_ms, cb.key
    order by t.key` : [];
  // By section: the same rows, counted through sections instead of corners
  const rows = by === "sections" && A && B
    ? await Promise.all(found.map(async (r) => {
        const c = await sectionCounts(r, A.id, B.id);
        return { ...r, a_corners: c.a, b_corners: c.b, corners: c.total };
      }))
    : found;
  const unit = by === "sections" ? "section" : "corner";
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
            <Side d={A} wins={aWins} corners={aCorners} unit={unit} />
            <div className="display text-center text-3xl text-zinc-500">
              <span className={aWins >= bWins ? "text-accent" : "text-white"}>{aWins}</span>
              <span className="mx-2 text-race">–</span>
              <span className={bWins >= aWins ? "text-accent" : "text-white"}>{bWins}</span>
              <div className="mt-1 font-sans text-xs uppercase tracking-wider text-zinc-500">tracks won</div>
              <Segmented options={ZONE_OPTIONS} value={by} href={(v) => `/drivers/compare?a=${A.id}&b=${B.id}&by=${v}`} className="mt-3 font-sans" />
            </div>
            <Side d={B} wins={bWins} corners={bCorners} unit={unit} right />
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
                      <div className="text-xs text-zinc-500">{r.car_class ?? "Other"}{r.corners > 0 && ` · ${unit}s ${r.a_corners}–${r.b_corners}`}</div>
                    </div>
                    <div className="tabular ml-auto flex items-center gap-5 text-sm">
                      <Time ms={r.a_ms} car={r.a_car} win={aFaster} />
                      <span className={`w-20 text-center font-semibold ${gap === 0 ? "text-zinc-400" : aFaster ? "text-emerald-400" : "text-red-400"}`}>
                        {gap === 0 ? "tie" : `${gap > 0 ? "+" : ""}${gap.toFixed(3)}`}
                      </span>
                      <Time ms={r.b_ms} car={r.b_car} win={!aFaster && gap !== 0} />
                    </div>
                    <Link href={`/laps/${r.a_lap}?vs=${r.b_lap}&replay=1&by=${by}`} className="btn btn-primary px-3 py-1.5 text-xs">
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

function Side({ d, wins, corners, unit, right }: { d: D; wins: number; corners: number; unit: string; right?: boolean }) {
  return (
    <Link href={`/drivers/${d.id}`} className={`flex items-center gap-4 ${right ? "flex-row-reverse text-right" : ""}`}>
      <Avatar url={d.avatar_url} name={d.display_name} size={64} ring />
      <div className="min-w-0">
        <div className="display truncate text-xl text-white">{d.display_name}</div>
        <div className="tabular text-sm text-zinc-400">
          rating <span className="font-semibold text-accent">{d.rating != null ? d.rating.toFixed(1) : "–"}</span>
        </div>
        <div className="text-xs text-zinc-500">{wins} track{wins === 1 ? "" : "s"} · faster through {corners} {unit}{corners === 1 ? "" : "s"}</div>
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
