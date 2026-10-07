"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import InfoTip from "@/components/InfoTip";
import { PartBar, Position, ScaleNumber } from "@/components/ui";
import { CAR_PARTS, OVERALL_INFO, type CarPart } from "@/lib/cars";
import { scaleColor } from "@/lib/ranks";

export type CarRow = {
  key: string; name: string; year: number; overall: number | null; parts: Record<CarPart, number | null>;
  sheetGap: number | null; sheetTracks: number; drivers: number; laps: number; km: number;
};
type Key = "overall" | CarPart | "sheetGap" | "laps";

const SHEET_INFO = "How far the car is from the class's fastest car in OhneSpeed's sheet (default BoP qualifying times), averaged over the tracks of the sheet. 0.00 % = the fastest everywhere. Measured, not a rating.";
const LAPS_INFO = "Valid laps the team has driven in this car, and by how many drivers.";

function Part({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-zinc-600">–</span>;
  return (
    <div className="ml-auto w-14">
      <div className="text-right font-semibold"><ScaleNumber v={v} /></div>
      <PartBar v={v} className="mt-1 h-1" />
    </div>
  );
}

// Cars of one class: overall rating, the eight sub-ratings, the sheet's pace gap and the team's laps.
// Every column sorts (click again to reverse); unrated cars stay at the bottom.
export default function CarsTable({ rows }: { rows: CarRow[] }) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: "overall", desc: true });
  const val = (r: CarRow, k: Key): number | null =>
    k === "overall" || k === "sheetGap" || k === "laps" ? r[k] : r.parts[k] ?? null;
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const x = val(a, sort.key), y = val(b, sort.key);
    if (x == null && y == null) return (b.overall ?? -1) - (a.overall ?? -1) || a.name.localeCompare(b.name);
    if (x == null) return 1;
    if (y == null) return -1;
    return sort.desc ? y - x : x - y;
  }), [rows, sort]);
  // The smaller sheet gap is the better one: sorted ascending first
  const click = (key: Key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "sheetGap" }));
  let pos = 0;

  const head = (key: Key, label: string, info: string, edge = false) => (
    <th key={key} className="text-right">
      <span className="inline-flex items-center justify-end gap-1">
        <button type="button" onClick={() => click(key)} className={`inline-flex items-center gap-1 uppercase hover:text-white ${sort.key === key ? "text-accent" : ""}`}>
          {label}
          {sort.key === key && (sort.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
        </button>
        <InfoTip text={info} edge={edge} />
      </span>
    </th>
  );

  return (
    <div className="card card-red rise overflow-x-auto">
      <table className="data-table min-w-[1280px]">
        <thead>
          <tr>
            <th className="w-12">#</th>
            <th>Car</th>
            {head("overall", "Overall", OVERALL_INFO)}
            {CAR_PARTS.map((p) => head(p.key, p.label, p.info))}
            {head("sheetGap", "Sheet pace", SHEET_INFO, true)}
            {head("laps", "Team laps", LAPS_INFO, true)}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const v = val(r, sort.key);
            const n = v != null ? ++pos : null;
            return (
              <tr key={r.key}>
                <td>{n != null ? <Position n={n} /> : null}</td>
                <td>
                  <Link href={`/cars/${r.key}`} className="whitespace-nowrap text-white hover:underline">
                    <span className="font-medium">{r.name}</span> <span className="text-xs text-zinc-500">{r.year}</span>
                  </Link>
                </td>
                <td className="text-right">
                  {r.overall == null ? <span className="text-xs text-zinc-500">not rated yet</span> : (
                    <div className="ml-auto w-20">
                      <div className="tabular text-right text-lg font-bold" style={{ color: scaleColor(r.overall) }}>{r.overall.toFixed(1)}</div>
                      <PartBar v={r.overall} className="mt-1 h-1.5" />
                    </div>
                  )}
                </td>
                {CAR_PARTS.map((p) => <td key={p.key} className="text-right"><Part v={r.parts[p.key]} /></td>)}
                <td className="tabular text-right text-zinc-300" title={r.sheetTracks ? `${r.sheetTracks} tracks` : undefined}>
                  {r.sheetGap == null ? <span className="text-zinc-600">–</span> : `+${r.sheetGap.toFixed(2)} %`}
                </td>
                <td className="tabular text-right text-zinc-300">
                  {r.laps ? <>{r.laps} <span className="text-xs text-zinc-500">· {r.drivers} {r.drivers === 1 ? "driver" : "drivers"}</span></> : <span className="text-zinc-600">–</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
