import { ArrowLeft, Gauge, Timer, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BopBadge from "@/components/Bop";
import InfoTip from "@/components/InfoTip";
import { delay, PartBar, SectionTitle } from "@/components/ui";
import { REVIEW_DISCORD_ID, requireDriver } from "@/lib/auth";
import { carCutout } from "@/lib/car-images";
import { carSpecs } from "@/lib/car-specs";
import { CAR_PARTS, carInfo, carName, overall, TOP_SPEED_WINGS, type CarPart, type WingKey } from "@/lib/cars";
import { sql } from "@/lib/db";
import { dateTime, lapTime, prettyKey } from "@/lib/format";
import { scaleColor } from "@/lib/ranks";
import { isEstimate, sourceLabel } from "@/lib/reference-adjust";
import { REFERENCE_FACTOR } from "@/lib/references";
import { trackInfo } from "@/lib/tracks";
import { CAR_NOTES, CAR_NOTES_SOURCE } from "@/lib/car-notes";
import RatingForm from "./RatingForm";
import Showroom from "./Showroom";

type Rating = Record<CarPart | WingKey, number | null> & { note: string | null; source: string | null; updated_at: Date | null; editor: string | null };
type Ref = { bop: "default" | "lfm"; track_key: string; time_ms: number; ballast_kg: number | null; restrictor_pct: number | null; sheet_date: string | null; source: string | null };
type TeamTrack = {
  track_key: string; track: string; laps: number; drivers: number;
  best_ms: number; best_lap: string; best_driver: string; best_bop: string;
};

export async function generateMetadata(props: PageProps<"/cars/[car]">): Promise<Metadata> {
  const { car } = await props.params;
  return { title: carInfo(car) ? carName(car) : "Cars" };
}

// One car (user's request, 2026-10-07): the admins' ratings with each sub-rating's text, then per
// track the reference times (OhneSpeed's sheet, both BoPs, the 101 % rating target) next to the
// team's best lap and laps in this car.
export default async function CarPage(props: PageProps<"/cars/[car]">) {
  const me = await requireDriver();
  const { car } = await props.params;
  const info = carInfo(car);
  if (!info) notFound();

  const [rating] = await sql<Rating[]>`
    select r.*, d.display_name as editor from car_rating r left join driver d on d.id = r.updated_by
    where r.car_key = ${car}`.catch(() => []);   // before migration 0016: unrated
  const refs = await sql<Ref[]>`
    select bop, track_key, time_ms, ballast_kg, restrictor_pct, sheet_date, source from lap_reference where car_key = ${car}`.catch(() => []);
  const team = await sql<TeamTrack[]>`
    with laps as (
      select lower(t.key) as track_key, t.key as track, l.id, s.driver_id, d.display_name as driver,
             coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as ms,
             coalesce(s.bop_chosen, s.bop, 'default') as bop
      from lap l join session s on s.id = l.session_id join car c on c.id = s.car_id
      join track t on t.id = s.track_id join driver d on d.id = s.driver_id
      where c.key = ${car} and l.comparable and d.discord_id is distinct from ${REVIEW_DISCORD_ID})
    select track_key, track, count(*)::int as laps, count(distinct driver_id)::int as drivers, min(ms) as best_ms,
           (array_agg(id order by ms, id))[1] as best_lap, (array_agg(driver order by ms, id))[1] as best_driver,
           (array_agg(bop order by ms, id))[1] as best_bop
    from laps group by track_key, track`;
  const [totals] = await sql<{ drivers: number; sessions: number; laps: number; km: number }[]>`
    select count(distinct s.driver_id)::int as drivers, count(distinct s.id)::int as sessions,
           count(l.id) filter (where l.comparable)::int as laps, coalesce(sum(l.distance_m), 0)::float8 / 1000 as km
    from session s join car c on c.id = s.car_id join driver d on d.id = s.driver_id left join lap l on l.session_id = s.id
    where c.key = ${car} and d.discord_id is distinct from ${REVIEW_DISCORD_ID}`;

  // One row per track: the sheet's tracks and the ones the team drove this car on
  const tracks = new Map<string, { name: string; def?: Ref; lfm?: Ref; team?: TeamTrack }>();
  const row = (key: string) => {
    if (!tracks.has(key)) tracks.set(key, { name: trackInfo(key)?.name ?? prettyKey(key) });
    return tracks.get(key)!;
  };
  for (const r of refs) row(r.track_key)[r.bop === "lfm" ? "lfm" : "def"] = r;
  for (const t of team) row(t.track_key).team = t;
  const list = [...tracks.entries()].sort((a, b) => (b[1].team?.laps ?? 0) - (a[1].team?.laps ?? 0) || a[1].name.localeCompare(b[1].name));
  const [{ setups }] = await sql<{ setups: number }[]>`select count(*)::int as setups from setup where car_key = ${car}`.catch(() => [{ setups: 0 }]);
  const total = overall(rating);
  // An admin's description, else the researched starting one (lib/car-notes.ts)
  const note = rating?.note ?? CAR_NOTES[car] ?? null;
  // Sheet pace: the gap to the class's fastest car, averaged over the tracks (as on the Cars page)
  const sheet = await sql<{ car_key: string; gap_pct: number }[]>`
    with d as (select car_key, time_ms, min(time_ms) over (partition by track_key, car_class) as best
               from lap_reference where bop = 'default')
    select car_key, avg(time_ms::float8 / best - 1) * 100 as gap_pct from d group by car_key`.catch(() => []);
  const classGaps = sheet.filter((s) => carInfo(s.car_key)?.cls === info.cls).sort((a, b) => a.gap_pct - b.gap_pct);
  const mine = classGaps.findIndex((s) => s.car_key === car);
  const sheetPace = mine < 0 ? null : { gap: classGaps[mine].gap_pct - classGaps[0].gap_pct, rank: mine + 1, of: classGaps.length };
  const sheetDate = refs.find((r) => r.sheet_date)?.sheet_date;
  const estimated = refs.some((r) => r.bop === "default" && isEstimate(r.source));

  return (
    <div className="bleed bleed-lg">
      <Link href={`/cars?class=${info.cls}`} className="relative z-10 mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft size={15} /> {info.cls} cars
      </Link>
      <Showroom
        car={car} name={info.name} cls={info.cls} year={info.year} cutout={carCutout(car)} overall={total} setups={setups}
        specs={carSpecs(car)} wings={[rating?.top_speed_min_wing ?? null, rating?.top_speed_max_wing ?? null]}
        sheet={sheetPace} team={totals}
      />

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="card card-red rise p-5" style={delay(40)}>
          <SectionTitle icon={Gauge}>Ratings</SectionTitle>
          <ul className="space-y-3">
            {CAR_PARTS.map((p) => {
              const v = rating?.[p.key];
              return (
                <li key={p.key}>
                  <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                    {p.label} <InfoTip text={p.info} />
                    <span className="tabular ml-auto font-semibold" style={v != null ? { color: scaleColor(v) } : undefined}>
                      {v != null ? v : <span className="text-zinc-600">–</span>}
                    </span>
                  </div>
                  <PartBar v={v ?? 0} className="mt-1 h-1.5" />
                  {p.key === "top_speed" && TOP_SPEED_WINGS.some((x) => rating?.[x.key] != null) && (
                    <div className="mt-1 flex gap-4 text-[11px] text-zinc-500">
                      {TOP_SPEED_WINGS.map((x) => <span key={x.key}>{x.label} <span className="tabular text-zinc-400">{rating?.[x.key] != null ? `${rating[x.key]} ${x.unit}` : "–"}</span></span>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {note && <p className="mt-5 whitespace-pre-line text-sm text-zinc-300">{note}</p>}
          {/* Short line; the details behind "i" icons (user's request: no long grey text) */}
          <p className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            {rating?.updated_at
              ? <>Rated by {rating.editor ?? "an admin"}, {dateTime(rating.updated_at)}{rating.source && <InfoTip text={`Source: ${rating.source}`} />}</>
              : <>Not rated yet <InfoTip text="The team's admins rate the cars from their knowledge of them (Edit the ratings)." /></>}
            {!rating?.note && note && <><span>· Description</span><InfoTip text={`Description: ${CAR_NOTES_SOURCE}. An admin's own description replaces it.`} /></>}
          </p>
          {me.is_admin && <RatingForm car={car} initial={{ ...rating, note }} />}
        </section>

        <section className="card rise overflow-hidden" style={delay(80)}>
          <div className="p-5 pb-0">
            <SectionTitle icon={Timer} info={`Reference times: OhneSpeed's sheet${sheetDate ? ` (${sheetDate})` : ""}. Target = default BoP qualifying × ${REFERENCE_FACTOR}: a lap on the target scores 100 pace.${estimated ? " ≈ = corrected estimate: OhneSpeed's time for this car looked wrong (hover it to see why)." : ""}`}>
              Reference times and the team&apos;s laps
            </SectionTitle>
            {totals.laps > 0 && (
              <p className="-mt-1 mb-3 inline-flex items-center gap-1.5 text-xs text-zinc-500">
                <Users size={13} /> {totals.drivers} {totals.drivers === 1 ? "driver" : "drivers"} · {totals.laps} valid laps · {Math.round(totals.km).toLocaleString("en-GB")} km
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[860px]">
              <thead>
                <tr>
                  <th>Track</th>
                  <th className="text-right">Default BoP</th>
                  <th className="text-right">Target 101 %</th>
                  <th className="text-right">LFM BoP</th>
                  <th className="text-right">Team best</th>
                  <th className="text-right">vs target</th>
                  <th className="text-right">Laps</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && <tr><td colSpan={7} className="text-zinc-500">No reference times or laps for this car yet.</td></tr>}
                {list.map(([key, t]) => {
                  const target = t.def ? Math.round(t.def.time_ms * REFERENCE_FACTOR) : null;
                  const vs = t.team && target ? (t.team.best_ms / target - 1) * 100 : null;
                  return (
                    <tr key={key}>
                      <td className="whitespace-nowrap text-zinc-200">
                        {t.team ? <Link href={`/tracks/${t.team.track}`} className="hover:underline">{t.name}</Link> : t.name}
                      </td>
                      <td className="tabular text-right text-zinc-300">
                        {t.def ? (
                          isEstimate(t.def.source)
                            ? <span title={sourceLabel(t.def.source)} className="cursor-help">{lapTime(t.def.time_ms)} <span className="text-accent">≈</span></span>
                            : lapTime(t.def.time_ms)
                        ) : <span className="text-zinc-600">–</span>}
                      </td>
                      <td className="tabular text-right font-semibold text-white">{target ? lapTime(target) : <span className="font-normal text-zinc-600">–</span>}</td>
                      <td className="text-right">
                        {t.lfm ? (
                          <span className="inline-flex items-center justify-end gap-2">
                            <span className="tabular text-zinc-300">{lapTime(t.lfm.time_ms)}</span>
                            {(t.lfm.ballast_kg != null || t.lfm.restrictor_pct) && <BopBadge info={{ bop: "lfm", ballast_kg: t.lfm.ballast_kg, restrictor_pct: t.lfm.restrictor_pct }} />}
                          </span>
                        ) : <span className="text-zinc-600">–</span>}
                      </td>
                      <td className="text-right">
                        {t.team ? (
                          <Link href={`/laps/${t.team.best_lap}`} className="hover:underline">
                            <span className="tabular text-white">{lapTime(t.team.best_ms)}</span>
                            <span className="ml-1.5 text-xs text-zinc-500">{t.team.best_driver}</span>
                            {t.team.best_bop === "lfm" && <span className="ml-1.5 text-[10px] font-semibold text-accent">LFM</span>}
                          </Link>
                        ) : <span className="text-zinc-600">–</span>}
                      </td>
                      <td className={`tabular text-right ${vs == null ? "" : vs <= 0 ? "text-emerald-400" : "text-zinc-300"}`}>
                        {vs == null ? <span className="text-zinc-600">–</span> : `${vs > 0 ? "+" : ""}${vs.toFixed(2)} %`}
                      </td>
                      <td className="tabular text-right text-zinc-300">
                        {t.team ? <>{t.team.laps} <span className="text-xs text-zinc-500">· {t.team.drivers}</span></> : <span className="text-zinc-600">–</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
