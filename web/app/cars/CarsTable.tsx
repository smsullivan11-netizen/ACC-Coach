"use client";

import { ArrowDown, ArrowUp, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import InfoTip from "@/components/InfoTip";
import { PartBar, Position, ScaleNumber } from "@/components/ui";
import { carSide } from "@/lib/car-images";
import { CAR_PARTS, OVERALL_INFO, type CarPart } from "@/lib/cars";
import { scaleColor } from "@/lib/ranks";

export type CarRow = {
  key: string; name: string; year: number; overall: number | null; parts: Record<CarPart, number | null>; wings: (number | null)[];
  sheetGap: number | null; sheetTracks: number; drivers: number; laps: number; km: number;
};
type Key = "overall" | CarPart | "sheetGap";

const SHEET_INFO = "Gap to the class's fastest car in OhneSpeed's sheet (default BoP qualifying times), averaged over the sheet's tracks. The sheet's older GT3s are corrected (their times were placeholders): with GOSetups' times where it has the car, else moved up behind the corrected cars in the sheet's order. The team's laps never change it.";
// Columns of their own; driveability and the team's laps sit under the car's name (user's request:
// the table fits the page instead of scrolling sideways)
const COLUMNS = CAR_PARTS.filter((p) => p.key !== "driveability");
const DRIVEABILITY = CAR_PARTS.find((p) => p.key === "driveability")!;

function Part({ v, wings }: { v: number | null | undefined; wings?: (number | null)[] }) {
  if (v == null) return <span className="text-zinc-600">–</span>;
  return (
    <div className="ml-auto w-max min-w-12">
      <div className="text-right font-semibold"><ScaleNumber v={v} /></div>
      <PartBar v={v} className="mt-1 h-1" />
      {wings && wings.some((x) => x != null) && (
        // Top speed: its two small grey numbers, the absolute top speed in km/h at min wing then max wing
        <div className="mt-1 flex justify-end gap-1.5 whitespace-nowrap text-[10px] leading-none text-zinc-500">
          <span title="Top speed at min wing (km/h)">{wings[0] ?? "–"}</span><span title="Top speed at max wing (km/h)">{wings[1] ?? "–"}</span>
        </div>
      )}
    </div>
  );
}

/** Driveability as 0-5 stars, by halves (100 = 5 stars). */
function Stars({ v }: { v: number }) {
  const stars = Math.round(v / 10) / 2;
  return (
    <span className="inline-flex items-center gap-0.5" title={`${DRIVEABILITY.label}: ${stars} / 5 (${v}/100). ${DRIVEABILITY.info}`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, stars - i));
        return (
          <span key={i} className="relative inline-block h-3 w-3">
            <Star size={12} className="absolute inset-0 text-zinc-700" fill="currentColor" strokeWidth={0} />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={12} className="text-accent" fill="currentColor" strokeWidth={0} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// Cars of one class: overall rating, the sub-ratings and the sheet's pace gap; under each car's name
// its driveability stars and the team's laps. Every column sorts (click again to reverse); cars
// without a value stay at the bottom, in the sheet's order.
export default function CarsTable({ rows }: { rows: CarRow[] }) {
  // By overall rating once a car of the class is rated, by the sheet before (user: nothing rated
  // left the list alphabetical and without positions)
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>(() =>
    rows.some((r) => r.overall != null) ? { key: "overall", desc: true } : { key: "sheetGap", desc: false });
  const val = (r: CarRow, k: Key): number | null =>
    k === "overall" || k === "sheetGap" ? r[k] : r.parts[k] ?? null;
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const x = val(a, sort.key), y = val(b, sort.key);
    if (x == null && y == null)   // not rated (or not in the sheet): the sheet's order, then the name
      return (a.sheetGap ?? Infinity) - (b.sheetGap ?? Infinity) || a.name.localeCompare(b.name);
    if (x == null) return 1;
    if (y == null) return -1;
    return sort.desc ? y - x : x - y;
  }), [rows, sort]);
  // The smaller sheet gap is the better one: sorted ascending first
  const click = (key: Key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "sheetGap" }));
  let pos = 0;

  const head = (key: Key, label: string, info: string, edge = false) => (
    <th key={key} className="text-right align-bottom">
      <span className="inline-flex items-end justify-end gap-1">
        <button type="button" onClick={() => click(key)}
                className={`inline-flex max-w-[5.5rem] items-end gap-1 whitespace-normal text-right uppercase leading-tight hover:text-white ${sort.key === key ? "text-accent" : ""}`}>
          {label}
          {sort.key === key && (sort.desc ? <ArrowDown size={11} className="shrink-0" /> : <ArrowUp size={11} className="shrink-0" />)}
        </button>
        <InfoTip text={info} edge={edge} />
      </span>
    </th>
  );

  return (
    <div className="card card-red rise overflow-x-auto">
      <table className="data-table min-w-[1060px]">
        <thead>
          <tr>
            <th className="w-20 align-bottom">#</th>
            <th className="align-bottom">
              <span className="inline-flex items-center gap-1">Car <InfoTip text={`Under the name: ${DRIVEABILITY.label.toLowerCase()} (${DRIVEABILITY.info.toLowerCase().replace(/\.$/, "")}) in stars out of 5, and the valid laps the team has driven in the car.`} /></span>
            </th>
            {head("overall", "Overall", OVERALL_INFO)}
            {COLUMNS.map((p) => head(p.key, p.label, p.info))}
            {head("sheetGap", "Sheet pace", SHEET_INFO, true)}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const v = val(r, sort.key);
            const n = v != null ? ++pos : null;
            const drive = r.parts.driveability;
            return (
              <tr key={r.key}>
                <td>
                  {/* The rank, and under it the car seen from the side (lib/car-images.ts) when there is a picture */}
                  {n != null ? <Position n={n} /> : null}
                  {carSide(r.key) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={carSide(r.key)!} alt="" width={80} height={24} loading="lazy" className="mt-1.5 h-auto w-20 max-w-none brightness-[1.5] contrast-[1.1]" />
                  )}
                </td>
                <td>
                  <Link href={`/cars/${r.key}`} className="whitespace-nowrap text-white hover:underline">
                    <span className="font-medium">{r.name}</span> <span className="text-xs text-zinc-500">{r.year}</span>
                  </Link>
                  <div className="mt-1.5 flex items-end gap-3 whitespace-nowrap text-xs text-zinc-500">
                    {drive != null && (
                      <span className="inline-flex flex-col items-start gap-0.5">
                        <span className="text-[9px] font-semibold uppercase leading-none tracking-wider text-zinc-400">Driveability</span>
                        <Stars v={drive} />
                      </span>
                    )}
                    {r.laps > 0 && <span>{r.laps} team {r.laps === 1 ? "lap" : "laps"} · {r.drivers} {r.drivers === 1 ? "driver" : "drivers"}</span>}
                  </div>
                </td>
                <td className="text-right">
                  {r.overall == null ? <span className="whitespace-nowrap text-xs text-zinc-500">not rated yet</span> : (
                    <span className="tabular text-lg font-bold" style={{ color: scaleColor(r.overall) }}>{r.overall.toFixed(1)}</span>
                  )}
                </td>
                {COLUMNS.map((p) => <td key={p.key} className="text-right"><Part v={r.parts[p.key]} wings={p.key === "top_speed" ? r.wings : undefined} /></td>)}
                <td className="tabular whitespace-nowrap text-right" title={r.sheetTracks ? `Averaged over ${r.sheetTracks} tracks` : undefined}>
                  {r.sheetGap == null ? <span className="text-zinc-600">–</span>
                    : r.sheetGap < 0.005 ? <span className="text-xs font-semibold uppercase tracking-wider text-accent">Fastest</span>
                    : <span className="text-zinc-300">+{r.sheetGap.toFixed(2)} %</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
