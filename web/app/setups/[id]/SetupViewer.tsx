"use client";

import { useState } from "react";
import InfoTip from "@/components/InfoTip";
import { setupTabs, type Cell, type SetupFile } from "@/lib/setups";

// The setup laid out like the game's own setup screens (user's request: as close as possible to ACC's
// native setup page): the six tabs along the top, each setting in a box with its name above and the
// value large; four-wheel settings as the car seen from above (front left / right on top, rear below),
// axle settings as Front / Rear. Boxes in the style of GOSetups' pages. Values are the game's clicks,
// tyre pressures in psi and the camber in degrees.

function Box({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/35 p-3.5">
      <div className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
        {label} {hint && <InfoTip text={hint} />}
      </div>
      {children}
    </div>
  );
}

const Value = ({ children, small = false }: { children: React.ReactNode; small?: boolean }) => (
  <div className={`tabular rounded bg-white/[0.04] px-3 py-1.5 text-center font-semibold text-white ${small ? "text-sm" : "text-xl"}`}>{children}</div>
);

const Sub = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-1 text-center text-[10px] uppercase tracking-wider text-zinc-500">{children}</div>
);

const WHEELS = ["Front left", "Front right", "Rear left", "Rear right"];

function CellBox({ cell }: { cell: Cell }) {
  switch (cell.kind) {
    case "single":
      return <Box label={cell.label} hint={cell.hint}><Value>{cell.value}</Value></Box>;
    case "axles":
      return (
        <Box label={cell.label} hint={cell.hint}>
          <div className="grid grid-cols-2 gap-2">
            <div><Sub>{cell.frontLabel ?? "Front"}</Sub><Value>{cell.front}</Value></div>
            <div><Sub>{cell.rearLabel ?? "Rear"}</Sub><Value>{cell.rear}</Value></div>
          </div>
        </Box>
      );
    case "pair":
      return (
        <Box label={cell.label} hint={cell.hint}>
          <div className="grid grid-cols-2 gap-2">
            {cell.values.map((v, i) => <div key={i}><Sub>{cell.labels[i]}</Sub><Value>{v}</Value></div>)}
          </div>
        </Box>
      );
    case "wheels":
      return (
        <Box label={cell.label} hint={cell.hint}>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
            {cell.values.map((v, i) => (
              <div key={i}>
                <div className="mb-0.5 text-center text-[9px] uppercase tracking-wider text-zinc-600">{WHEELS[i]}</div>
                <Value small>{v}</Value>
              </div>
            ))}
          </div>
        </Box>
      );
  }
}

const Grid = ({ cells }: { cells: Cell[] }) => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cells.map((c, i) => <CellBox key={`${c.label}${i}`} cell={c} />)}</div>
);

export default function SetupViewer({ file }: { file: SetupFile }) {
  const tabs = setupTabs(file);
  const [tab, setTab] = useState(tabs[0].key);
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  return (
    <div className="card card-red rise overflow-hidden">
      <div role="tablist" className="flex overflow-x-auto border-b border-white/[0.08] bg-black/40 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === tab} type="button" onClick={() => setTab(t.key)}
                  className={`relative shrink-0 px-5 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                    t.key === tab ? "bg-white/[0.06] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
            {t.label}
            {t.key === tab && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-race" />}
          </button>
        ))}
      </div>
      <div className="space-y-5 p-5">
        {current.cells.length ? <Grid cells={current.cells} /> : <p className="text-sm text-zinc-500">Nothing in this file for this tab.</p>}
        {current.extra?.map((x) => (
          <div key={x.title}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{x.title}</h3>
            <Grid cells={x.cells} />
          </div>
        ))}
      </div>
    </div>
  );
}
