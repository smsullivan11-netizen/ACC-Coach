import { ArrowLeft, Crown, GitCompareArrows, Map as MapIcon, Ruler, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Chip, delay, Position, RankIcon } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { carShortName, gap, lapTime, prettyKey } from "@/lib/format";
import { carClass } from "@/lib/import-bundle";
import { hasPhoto, photoUrl, trackInfo } from "@/lib/tracks";
import TargetForm from "./TargetForm";

type Row = {
  position: number;
  gap_ms: number;
  lap_time_ms: number;
  lap_id: string;
  car_class: string | null;
  driver_id: string;
  driver: string;
  rating: number | null;
  avatar_url: string | null;
  car: string | null;
  session_id: string;
  date: string | null;
  theoretical_ms: number | null;
};


export async function generateMetadata(props: PageProps<"/tracks/[track]">): Promise<Metadata> {
  const { track } = await props.params;
  return { title: trackInfo(track)?.name ?? prettyKey(track) };
}

export default async function TrackPage(props: PageProps<"/tracks/[track]">) {
  const me = await requireDriver();
  const { track } = await props.params;
  const [t] = await sql<{ id: string; length_m: number }[]>`select id, length_m from track where key = ${track}`;
  if (!t) notFound();

  // Best valid lap per driver and class; theoretical best = sum of the driver's best corners on the
  // track's latest corner map
  const rows = await sql<Row[]>`
    with map as (select id from corner_map where track_id = ${t.id} order by version desc limit 1)
    select r.position::int, r.gap_ms, r.lap_time_ms, r.lap_id, r.car_class, r.driver_id, d.display_name as driver, d.avatar_url,
           c.key as car, l.session_id, to_char(r.recorded_at, 'DD Mon YYYY') as date,
           round(tb.theoretical_s * 1000)::int as theoretical_ms,
           (select dr.rating from driver_rating dr where dr.driver_id = r.driver_id order by dr.id desc limit 1) as rating
    from lap_ranking r
    join driver d on d.id = r.driver_id
    join lap l on l.id = r.lap_id
    left join car c on c.id = r.car_id
    left join theoretical_best tb on tb.driver_id = r.driver_id and tb.car_class is not distinct from r.car_class
                                  and tb.corner_map_id = (select id from map)
    where r.track_id = ${t.id}
    order by r.car_class nulls last, r.position`;
  // Targets per car (LFM 101 % for the team's cars): the pace score's 100 (lib/targets.ts
  // ratingReference; a car without one uses its class's targets on the track)
  const targets = await sql<{ car: string; target_ms: number; source: string | null }[]>`
    select car_key as car, target_ms, source from car_target where track_key = lower(${track}) order by car_key`;
  const cars = new Map<string, { cls: string; target: (typeof targets)[number] | null; best: number | null }>();
  for (const x of targets) cars.set(x.car, { cls: carClass(x.car), target: x, best: null });
  for (const r of rows) {
    if (!r.car) continue;
    const e = cars.get(r.car) ?? { cls: r.car_class ?? "Other", target: null, best: null };
    e.best = e.best == null ? r.lap_time_ms : Math.min(e.best, r.lap_time_ms);
    cars.set(r.car, e);
  }
  const classes = [...new Set([...rows.map((r) => r.car_class ?? "Other"), ...[...cars.values()].map((e) => e.cls)])];

  const info = trackInfo(track) ?? { name: prettyKey(track), country: "" };

  return (
    <div>
      <Link href="/tracks" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft size={15} /> All leaderboards
      </Link>
      {/* Banner: photo, flag and name */}
      <div className="card rise relative overflow-hidden">
        {hasPhoto(track) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(track)} alt="" className="h-44 w-full object-cover sm:h-56" />
        ) : (
          <div className="h-44 w-full bg-[radial-gradient(120%_90%_at_50%_0%,#26262b_0%,#0d0d10_70%)] sm:h-56" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="stripe absolute inset-x-0 bottom-0 h-[2px]" />
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-4 p-5">
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              {info.country && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/flags/${info.country}.svg`} alt="" width={22} height={15} className="h-[15px] w-[22px] rounded-[2px] object-cover" />
              )}
              <Ruler size={14} className="text-zinc-400" /> {Math.round(t.length_m)} m
            </div>
            <h1 className="display mt-1 text-3xl text-white sm:text-4xl">{info.name}</h1>
          </div>
          <Link href={`/tracks/${track}/corners`} className="btn btn-ghost ml-auto bg-black/40 backdrop-blur">
            <MapIcon size={15} /> Track map &amp; corners
          </Link>
        </div>
      </div>

      {rows.length === 0 && <p className="card mt-6 p-6 text-zinc-400">No valid lap yet on this track.</p>}
      {classes.map((cls, ci) => {
        const inClass = [...cars.entries()].filter(([, e]) => e.cls === cls);
        const withTarget = inClass.filter(([, e]) => e.target);
        const list = rows.filter((r) => (r.car_class ?? "Other") === cls);
        return (
          <section key={cls} className="card card-red rise relative mt-6" style={delay(80 + ci * 60)}>
            <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
              <h2 className="display text-xl text-white">{cls}</h2>
              {withTarget.map(([car, e]) => (
                <Chip key={car} tone="red" icon={Target}>Target {carShortName(car)} {lapTime(e.target!.target_ms)}</Chip>
              ))}
              {me.is_admin && (
                <details className="ml-auto text-sm text-zinc-400">
                  <summary className="cursor-pointer list-none text-xs text-zinc-500 hover:text-zinc-300">Edit targets</summary>
                  <div className="absolute right-5 z-10 mt-2 space-y-2 rounded-lg border border-white/10 bg-raised p-3 shadow-xl">
                    {inClass.map(([car, e]) => (
                      <div key={car} className="flex flex-wrap items-center gap-3">
                        <span className="w-44 text-zinc-300">{prettyKey(car)}</span>
                        <TargetForm track={track} car={car} current={e.target ? lapTime(e.target.target_ms) : ""} />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <div className="mt-3 overflow-x-auto">
              {list.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-12">#</th>
                      <th>Driver</th>
                      <th>Car</th>
                      <th className="text-right">Lap</th>
                      <th className="text-right">Gap</th>
                      <th className="text-right" title="Sum of the driver's best corners">Theoretical</th>
                      <th>Date</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r, k) => (
                      <tr key={r.driver_id} className={r.driver_id === me.id ? "bg-accent/[0.06]" : ""}>
                        <td><Position n={r.position} /></td>
                        <td>
                          <Link href={`/drivers/${r.driver_id}`} className="flex items-center gap-2.5 text-white hover:underline">
                            <Avatar url={r.avatar_url} name={r.driver} size={26} /> {r.driver}
                            <RankIcon rating={r.rating} size={14} />
                            {r.position === 1 && <Crown size={14} className="text-accent" />}
                          </Link>
                        </td>
                        <td className="text-zinc-300">{r.car ? carShortName(r.car) : "–"}</td>
                        <td className="text-right">
                          <Link href={`/laps/${r.lap_id}`} className={`font-semibold hover:underline ${r.position === 1 ? "text-accent" : "text-white"}`}>
                            {lapTime(r.lap_time_ms)}
                          </Link>
                        </td>
                        <td className="text-right text-zinc-400">{gap(r.gap_ms)}</td>
                        <td className="text-right text-zinc-400">{lapTime(r.theoretical_ms)}</td>
                        <td className="whitespace-nowrap text-zinc-500">{r.date}</td>
                        <td className="text-right">
                          {k > 0 && (
                            <Link href={`/laps/${r.lap_id}?vs=${list[0].lap_id}`} className="btn btn-ghost px-2.5 py-1 text-xs font-medium">
                              <GitCompareArrows size={13} /> vs leader
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-5 pb-4 text-sm text-zinc-500">No valid lap yet in this class.</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
