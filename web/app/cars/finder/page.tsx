import { Compass } from "lucide-react";
import type { Metadata } from "next";
import BopBadge from "@/components/Bop";
import { PageTitle } from "@/components/ui";
import { REVIEW_DISCORD_ID, requireDriver } from "@/lib/auth";
import { DRIVING_STYLE } from "@/lib/car-driving";
import { carSide } from "@/lib/car-images";
import { CAR_PARTS, carInfo, CARS, type CarPart } from "@/lib/cars";
import { sql } from "@/lib/db";
import type { FinderCar, TrackTimes } from "@/lib/finder";
import { trackInfo } from "@/lib/tracks";
import CarsTabs from "../CarsTabs";
import Finder from "./Finder";

export const metadata: Metadata = { title: "Car finder" };

// Car finder (user's request, 2026-10-10; lib/finder.ts): the admins' ratings of every car, and per
// class and track each car's default-BoP gap to the class's fastest on OhneSpeed's sheet. The choosing
// and scoring happen in the browser (Finder.tsx).
export default async function CarFinderPage() {
  await requireDriver();
  const ratings = await sql<(Record<CarPart, number | null> & { car_key: string; note: string | null })[]>`select * from car_rating`.catch(() => []);
  const refs = await sql<{ car_key: string; track: string; time_ms: number }[]>`
    select car_key, lower(track_key) as track, time_ms from lap_reference where bop = 'default'`.catch(() => []);

  const cars: Record<string, FinderCar[]> = {};
  for (const c of CARS) {
    const r = ratings.find((x) => x.car_key === c.key);
    (cars[c.cls] ??= []).push({ key: c.key, name: c.name, year: c.year, side: carSide(c.key), style: r?.note?.trim() || DRIVING_STYLE[c.key] || null, ratings: Object.fromEntries(CAR_PARTS.map((p) => [p.key, r?.[p.key] ?? null])) });
  }
  // gaps[class][track][car] = % slower than the class's fastest there (default BoP)
  const gaps: Record<string, Record<string, Record<string, number>>> = {};
  const best = new Map<string, number>();
  for (const r of refs) {
    const cls = carInfo(r.car_key)?.cls; if (!cls) continue;
    const k = `${cls}|${r.track}`; best.set(k, Math.min(best.get(k) ?? Infinity, r.time_ms));
  }
  for (const r of refs) {
    const cls = carInfo(r.car_key)?.cls; if (!cls) continue;
    ((gaps[cls] ??= {})[r.track] ??= {})[r.car_key] = (r.time_ms / best.get(`${cls}|${r.track}`)! - 1) * 100;
  }
  // The details of a result: on each track, the car's reference time and the team's best lap in it
  const team = await sql<{ car_key: string; track: string; ms: number; driver: string }[]>`
    select distinct on (c.key, lower(t.key)) c.key as car_key, lower(t.key) as track,
           coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as ms, d.display_name as driver
    from lap l join session s on s.id = l.session_id join car c on c.id = s.car_id join track t on t.id = s.track_id
    join driver d on d.id = s.driver_id
    where l.comparable and d.discord_id is distinct from ${REVIEW_DISCORD_ID}
    order by c.key, lower(t.key), coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)`;
  const times: TrackTimes = {};
  for (const r of refs) ((times[r.track] ??= {})[r.car_key] ??= {}).ref = r.time_ms;
  for (const r of team) Object.assign(((times[r.track] ??= {})[r.car_key] ??= {}), { team: r.ms, driver: r.driver });
  const tracks = [...new Set(refs.map((r) => r.track))].map((k) => ({ key: k, name: trackInfo(k)?.name ?? k })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="bleed bleed-lg">
      <PageTitle icon={Compass} sub="Tell us what you look for: the cars that suit it best, from the team's ratings and the reference times.">
        Car finder
      </PageTitle>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <CarsTabs value="finder" />
        <BopBadge info={{ bop: "default" }} short={false} />
      </div>
      <Finder cars={cars} gaps={gaps} times={times} tracks={tracks} />
    </div>
  );
}
