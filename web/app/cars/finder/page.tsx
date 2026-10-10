import { Compass } from "lucide-react";
import type { Metadata } from "next";
import BopBadge from "@/components/Bop";
import { PageTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { carSide } from "@/lib/car-images";
import { CAR_PARTS, carInfo, CARS, type CarPart } from "@/lib/cars";
import { sql } from "@/lib/db";
import type { FinderCar } from "@/lib/finder";
import { trackInfo } from "@/lib/tracks";
import CarsTabs from "../CarsTabs";
import Finder from "./Finder";

export const metadata: Metadata = { title: "Car finder" };

// Car finder (user's request, 2026-10-10; lib/finder.ts): the admins' ratings of every car, and per
// class and track each car's default-BoP gap to the class's fastest on OhneSpeed's sheet. The choosing
// and scoring happen in the browser (Finder.tsx).
export default async function CarFinderPage() {
  await requireDriver();
  const ratings = await sql<(Record<CarPart, number | null> & { car_key: string })[]>`select * from car_rating`.catch(() => []);
  const refs = await sql<{ car_key: string; track: string; time_ms: number }[]>`
    select car_key, lower(track_key) as track, time_ms from lap_reference where bop = 'default'`.catch(() => []);

  const cars: Record<string, FinderCar[]> = {};
  for (const c of CARS) {
    const r = ratings.find((x) => x.car_key === c.key);
    (cars[c.cls] ??= []).push({ key: c.key, name: c.name, year: c.year, side: carSide(c.key), ratings: Object.fromEntries(CAR_PARTS.map((p) => [p.key, r?.[p.key] ?? null])) });
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
      <Finder cars={cars} gaps={gaps} tracks={tracks} />
    </div>
  );
}
