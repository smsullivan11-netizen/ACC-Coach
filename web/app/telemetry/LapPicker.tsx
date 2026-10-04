"use client";

import { Crown, LineChart, Medal, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui";
import { carShortName, lapTime } from "@/lib/format";

export type PickLap = {
  id: string; number: number; driver_id: string; driver: string; avatar_url: string | null; car: string | null;
  time_ms: number; comparable: boolean; date: string; position: number | null; positions: boolean;
};

// Two lists of the track's laps: the lap to study (yellow) and the one to compare with (grey).
export default function LapPicker({ laps, me }: { laps: PickLap[]; me: string }) {
  const mine = laps.find((l) => l.driver_id === me && l.position != null) ?? laps.find((l) => l.driver_id === me) ?? laps[0];
  const ref = laps.find((l) => l.position === 1 && l.id !== mine?.id) ?? laps.find((l) => l.id !== mine?.id);
  const [a, setA] = useState(mine?.id ?? null);
  const [b, setB] = useState(ref?.id ?? null);
  const lapA = laps.find((l) => l.id === a), lapB = laps.find((l) => l.id === b);
  const query = lapB && lapB.id !== lapA?.id ? `?vs=${lapB.id}` : "";
  const canReplay = lapA?.positions && (!lapB || lapB.positions);

  return (
    <div className="mt-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <List step={2} title="Your lap" color="#ffd200" laps={laps} selected={a} onSelect={setA} other={b} />
        <List step={3} title="Compare with" color="#d4d4d8" laps={laps} selected={b} onSelect={(id) => setB(id === b ? null : id)} other={a} optional />
      </div>
      <div className="card card-red sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-3 p-4 shadow-2xl shadow-black/60">
        <div className="tabular min-w-0 text-sm text-zinc-300">
          {lapA ? <span className="font-semibold text-accent">{lapA.driver} L{lapA.number} {lapTime(lapA.time_ms)}</span> : "Pick a lap"}
          {lapB && lapB.id !== lapA?.id && <> <span className="text-zinc-500">vs</span> <span className="font-semibold text-zinc-200">{lapB.driver} L{lapB.number} {lapTime(lapB.time_ms)}</span></>}
        </div>
        {lapA && (
          <div className="ml-auto flex gap-2">
            <Link href={`/laps/${lapA.id}${query}`} className="btn btn-ghost"><LineChart size={15} /> Open telemetry</Link>
            {canReplay ? (
              <Link href={`/laps/${lapA.id}${query}${query ? "&" : "?"}replay=1`} className="btn btn-primary"><Play size={15} fill="currentColor" /> Watch replay</Link>
            ) : (
              <span className="btn btn-ghost opacity-50" title="Laps imported from MoTeC have no car positions">No replay (MoTeC lap)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function List({ step, title, color, laps, selected, onSelect, other, optional }: {
  step: number; title: string; color: string; laps: PickLap[]; selected: string | null;
  onSelect: (id: string) => void; other: string | null; optional?: boolean;
}) {
  return (
    <section className="card min-w-0 overflow-hidden">
      <h2 className="flex items-center gap-2 px-4 pt-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <span className="display grid h-5 w-5 place-items-center rounded bg-race text-[10px] text-white">{step}</span>
        <span style={{ color }}>{title}</span>{optional && <span className="normal-case tracking-normal text-zinc-600">(optional: click again to remove)</span>}
      </h2>
      <ul className="mt-2 max-h-[26rem] overflow-y-auto">
        {laps.map((l) => {
          const on = l.id === selected;
          return (
            <li key={l.id}>
              <button onClick={() => onSelect(l.id)} disabled={l.id === other && !on}
                      className={`flex w-full items-center gap-3 border-l-2 px-4 py-2 text-left transition-colors disabled:opacity-30 ${on ? "bg-white/[0.05]" : "border-transparent hover:bg-white/[0.03]"}`}
                      style={on ? { borderColor: color } : undefined}>
                <Avatar url={l.avatar_url} name={l.driver} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm text-white">
                    <span className="truncate">{l.driver} · L{l.number}</span>
                    {l.position === 1 ? <Crown size={13} className="shrink-0 text-accent" /> : l.position != null && <Medal size={13} className="shrink-0 text-emerald-400" />}
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {l.car ? carShortName(l.car) : "–"} · {l.date}{!l.comparable && " · invalid"}{!l.positions && " · no replay"}
                  </div>
                </div>
                <span className={`tabular text-sm font-semibold ${l.comparable ? "text-white" : "text-zinc-500"}`}>{lapTime(l.time_ms)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
