import { Settings2 } from "lucide-react";
import Link from "next/link";
import InfoTip from "@/components/InfoTip";
import { Chip } from "@/components/ui";
import type { CarSpecs } from "@/lib/car-specs";
import { OVERALL_INFO } from "@/lib/cars";
import { scaleColor } from "@/lib/ranks";

type Props = {
  car: string; name: string; cls: string; year: number;
  cutout: string | null; overall: number | null; setups: number;
  specs: CarSpecs | null;
  wings: [number | null, number | null];             // measured top speed, min and max wing (km/h)
  sheet: { gap: number; rank: number; of: number } | null;
  team: { drivers: number; laps: number; km: number };
};
type Row = { k: string; kSub?: string; v: string; unit?: string; sub?: string };

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

function Hud({ side, title, info, rows, big }: { side: "left" | "right"; title: string; info?: string; rows: Row[]; big?: boolean }) {
  return (
    <div className={`hud ${side} ${big ? "hud-big" : ""}`}>
      <div className="hud-glass">
        <div className="hud-title">{title} {info && <InfoTip text={info} side={side} />}</div>
        {rows.map((r) => (
          <div key={`${r.k}-${r.kSub}`} className="hud-row">
            <span className="hud-k">{r.k}{r.kSub && <span className="hud-sub">{r.kSub}</span>}</span>
            <span className="hud-v">{r.v}{r.unit && <small>{r.unit}</small>}{r.sub && <span className="hud-sub">{r.sub}</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The car page's showroom (user's request, 2026-10-09): the car on a stage drawn in CSS (globals.css,
// .stage), its name and overall rating on the wall, and two glass HUDs standing on the stage on both
// sides of it (.hud): the real car's specs (lib/car-specs.ts) and the team's numbers. Below 1280 px the
// HUDs sit flat under the stage.
export default function Showroom({ car, name, cls, year, cutout, overall, setups, specs, wings, sheet, team }: Props) {
  // The make on the wall in huge outlined letters, sized so a long one still fits
  const word = name.split(" ")[0].toUpperCase();
  const specRows: Row[] = specs ? ([
    { k: "Engine", v: specs.engine.replace(/ \(.*\)$/, ""), sub: specs.aspiration },
    specs.displacement && { k: "Displacement", v: specs.displacement.toLocaleString("en-GB"), unit: "cc" },
    specs.power && { k: "Power", v: specs.power.replace(/ hp$/, ""), unit: "hp" },
    specs.weight && { k: "Weight", v: specs.weight.replace(/ kg$/, ""), unit: "kg" },
    specs.gearbox && { k: "Gearbox", v: specs.gearbox },
    { k: "Layout", v: specs.layout },
    specs.debut && { k: "Race debut", v: specs.debut },
  ].filter(Boolean) as Row[]) : [{ k: "Model", v: String(year), sub: "Specs to come" }];
  const statRows = [
    wings[0] != null && { k: "Top speed", kSub: "min wing", v: `${wings[0]}`, unit: "km/h" },
    wings[1] != null && { k: "Top speed", kSub: "max wing", v: `${wings[1]}`, unit: "km/h" },
    sheet && { k: "Sheet pace", v: sheet.gap < 0.005 ? "Fastest" : `+${sheet.gap.toFixed(2)}`, unit: sheet.gap < 0.005 ? undefined : "%", sub: `${ordinal(sheet.rank)} of ${sheet.of} ${cls}` },
    { k: "Team laps", v: team.laps.toLocaleString("en-GB"), sub: `${team.drivers} ${team.drivers === 1 ? "driver" : "drivers"}` },
    { k: "Distance", v: Math.round(team.km).toLocaleString("en-GB"), unit: "km" },
  ].filter(Boolean) as Row[];
  const specInfo = `The real car, from the maker and the teams${specs ? ` (${specs.sources.map((s) => s.label).join(", ")})` : ""}. Power and weight are the maker's figures: in a race the BoP sets them.`;
  const statInfo = "Top speed: measured by the team in game, same conditions for every car. Sheet pace: gap to the class's fastest car in OhneSpeed's sheet, default BoP, averaged over the tracks.";
  const huds = [
    <Hud key="l" side="left" title="The car" info={specInfo} rows={specRows} />,
    <Hud key="r" side="right" title="On track" info={statInfo} rows={statRows} big />,
  ];

  return (
    <>
      <section className="stage rise mb-5" aria-label={`${name} in the showroom`}>
        <div className="stage-wall" />
        <div className="stage-word" style={{ fontSize: `clamp(3rem, ${Math.round(92 / Math.max(word.length, 4))}vw, 20rem)` }} aria-hidden>{word}</div>
        <div className="stage-panel yellow stage-panel-out" style={{ left: "6%" }} />
        <div className="stage-panel stage-panel-in" style={{ left: "13%", top: "33%", height: "24%" }} />
        <div className="stage-panel stage-panel-in" style={{ right: "13%", top: "33%", height: "24%" }} />
        <div className="stage-panel red stage-panel-out" style={{ right: "6%" }} />
        <div className="stage-ceiling" />
        <div className="stage-beam" />
        <div className="stage-floor" />
        <div className="stage-horizon" />
        <div className="stage-glow-l" />
        <div className="stage-glow-r" />
        <div className="stage-table" />
        {!cutout && <div className="inset-x-0 bottom-[17%] text-center text-xs uppercase tracking-[0.3em] text-zinc-600">Car picture to come</div>}
        {cutout && (
          <div className="stage-car">
            <div className="shadow" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="car" src={cutout} alt={name} width={1600} height={430} fetchPriority="high" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="reflection" src={cutout} alt="" width={1600} height={430} aria-hidden />
          </div>
        )}
        <div className="stage-vignette" />
        {huds}

        {/* Name plate and overall rating on the wall */}
        <div className="pointer-events-auto! left-4 top-4 max-w-[60%] sm:left-7 sm:top-6">
          <div className="flex items-center gap-2 text-xs text-zinc-300"><Chip tone="yellow">{cls}</Chip> {year}</div>
          <h1 className="display mt-1.5 text-xl leading-tight text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.8)] sm:text-3xl xl:text-4xl">{name}</h1>
          <Link href={`/setups?car=${car}`} className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-accent hover:underline sm:text-sm">
            <Settings2 size={14} /> {setups ? `${setups} setup${setups === 1 ? "" : "s"}` : "Setups"}
          </Link>
        </div>
        <div className="pointer-events-auto! right-4 top-4 text-right sm:right-7 sm:top-6">
          <div className="flex items-center justify-end gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
            Overall <InfoTip text={OVERALL_INFO} side="right" />
          </div>
          {overall == null ? <div className="text-sm text-zinc-500">not rated yet</div>
            : <div className="tabular display text-3xl drop-shadow-[0_2px_12px_rgb(0_0_0/0.8)] sm:text-5xl" style={{ color: scaleColor(overall) }}>{overall.toFixed(1)}</div>}
        </div>
      </section>

      {/* Narrower screens: the same HUDs under the stage */}
      <div className="rise mb-5 grid gap-4 sm:grid-cols-2 xl:hidden">{huds}</div>
    </>
  );
}
