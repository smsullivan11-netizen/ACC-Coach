import { CarFront } from "lucide-react";
import type { Metadata } from "next";
import { PageTitle, Segmented } from "@/components/ui";
import { REVIEW_DISCORD_ID, requireDriver } from "@/lib/auth";
import { CAR_PARTS, CARS, CLASSES, overall, type CarClass, type CarPart } from "@/lib/cars";
import { sql } from "@/lib/db";
import CarsTable, { type CarRow } from "./CarsTable";

export const metadata: Metadata = { title: "Cars" };

// Cars page (user's request, 2026-10-07): every car of a class with the admins' ratings (lib/cars.ts),
// the gap to the class's fastest car in OhneSpeed's sheet (default BoP, averaged over the tracks), and
// how much the team drives it. Each car opens its own page.
export default async function CarsPage(props: PageProps<"/cars">) {
  const me = await requireDriver();
  const { class: cls } = await props.searchParams;
  const current: CarClass = CLASSES.find((c) => c === cls) ?? "GT3";

  // Without migration 0016 the page still shows the cars, unrated
  const ratings = await sql<(Record<CarPart, number | null> & { car_key: string })[]>`select * from car_rating`.catch(() => []);
  const sheet = await sql<{ car_key: string; gap_pct: number; tracks: number }[]>`
    with d as (select car_key, time_ms, min(time_ms) over (partition by track_key, car_class) as best
               from lap_reference where bop = 'default')
    select car_key, avg(time_ms::float8 / best - 1) * 100 as gap_pct, count(*)::int as tracks from d group by car_key`.catch(() => []);
  const team = await sql<{ car_key: string; drivers: number; laps: number; km: number }[]>`
    select c.key as car_key, count(distinct s.driver_id)::int as drivers,
           count(l.id) filter (where l.comparable)::int as laps, coalesce(sum(l.distance_m), 0)::float8 / 1000 as km
    from session s join car c on c.id = s.car_id join driver d on d.id = s.driver_id left join lap l on l.session_id = s.id
    where d.discord_id is distinct from ${REVIEW_DISCORD_ID}
    group by c.key`;

  const byKey = <T extends { car_key: string }>(rows: T[]) => new Map(rows.map((r) => [r.car_key, r]));
  const r = byKey(ratings), sh = byKey(sheet), tm = byKey(team);
  const rows: CarRow[] = CARS.filter((c) => c.cls === current).map((c) => {
    const rating = r.get(c.key);
    return {
      key: c.key, name: c.name, year: c.year,
      overall: overall(rating),
      parts: Object.fromEntries(CAR_PARTS.map((p) => [p.key, rating?.[p.key] ?? null])) as Record<CarPart, number | null>,
      sheetGap: sh.get(c.key)?.gap_pct ?? null, sheetTracks: sh.get(c.key)?.tracks ?? 0,
      drivers: tm.get(c.key)?.drivers ?? 0, laps: tm.get(c.key)?.laps ?? 0, km: tm.get(c.key)?.km ?? 0,
    };
  });
  // Sheet pace from the class's fastest car on average (user's request: it reads 0, like lap gaps)
  const fastest = Math.min(...rows.map((x) => x.sheetGap ?? Infinity));
  for (const x of rows) if (x.sheetGap != null) x.sheetGap -= fastest;
  const rated = rows.filter((x) => x.overall != null).length;

  return (
    <div className="bleed bleed-lg">
      <PageTitle icon={CarFront} sub="Ratings by the team's admins, out of 100. Click a car for its reference times and the team's laps in it.">
        Cars
      </PageTitle>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented options={CLASSES.map((c) => ({ value: c, label: c }))} value={current} href={(c) => `/cars?class=${c}`} />
        <span className="text-xs text-zinc-500">
          {rated} of {rows.length} cars rated{me.is_admin && rated < rows.length ? ": open a car to rate it" : ""}
        </span>
      </div>
      <CarsTable rows={rows} />
    </div>
  );
}
