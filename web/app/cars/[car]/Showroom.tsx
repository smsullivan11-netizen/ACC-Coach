import { Flag, Settings2, Trophy, Wrench } from "lucide-react";
import Link from "next/link";
import InfoTip from "@/components/InfoTip";
import { Chip, delay, SectionTitle } from "@/components/ui";
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

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

// The car page's showroom (user's request, 2026-10-09): the car big on a stage drawn in CSS (globals.css,
// .stage), its name and overall rating on the wall, then the headline numbers, the spec sheet and the
// real car's racing record (lib/car-specs.ts).
export default function Showroom({ car, name, cls, year, cutout, overall, setups, specs, wings, sheet, team }: Props) {
  // The make on the wall in huge outlined letters, sized so a long one still fits
  const word = name.split(" ")[0].toUpperCase();
  const headline = [
    wings[0] != null && { label: "Top speed", value: `${wings[0]}`, unit: "km/h", sub: wings[1] != null ? `min wing · ${wings[1]} km/h max wing` : "min wing", info: "Measured by the team in game, same conditions for every car." },
    specs?.power && { label: "Power", value: specs.power.replace(/ hp$/, ""), unit: "hp", sub: "maker's figure", info: "In a race the BoP changes it." },
    specs && { label: "Engine", value: specs.engine.replace(/ \(.*\)$/, ""), sub: specs.aspiration },
    specs?.weight && { label: "Weight", value: specs.weight.replace(/ kg$/, ""), unit: "kg", sub: "maker's figure", info: "In a race the BoP adds ballast." },
    sheet && { label: "Sheet pace", value: sheet.gap < 0.005 ? "Fastest" : `+${sheet.gap.toFixed(2)}`, unit: sheet.gap < 0.005 ? undefined : "%", sub: `${ordinal(sheet.rank)} of ${sheet.of} ${cls}`, info: "Gap to the class's fastest car in OhneSpeed's sheet, default BoP, averaged over the tracks." },
    { label: "Team laps", value: team.laps.toLocaleString("en-GB"), sub: `${team.drivers} ${team.drivers === 1 ? "driver" : "drivers"} · ${Math.round(team.km).toLocaleString("en-GB")} km` },
  ].filter(Boolean) as { label: string; value: string; unit?: string; sub: string; info?: string }[];

  const sheetRows = specs ? ([
    ["Engine", specs.engine],
    ["Aspiration", specs.aspiration],
    ["Displacement", specs.displacement ? `${specs.displacement.toLocaleString("en-GB")} cc` : null],
    ["Power", specs.power],
    ["Weight", specs.weight],
    ["Gearbox", specs.gearbox],
    ["Layout", specs.layout],
    ["ACC model", String(year)],
    ["Race debut", specs.debut],
    ["Built by", specs.builder],
  ].filter(([, v]) => v) as [string, string][]) : [];

  return (
    <>
      <section className="stage rise mb-4" aria-label={`${name} in the showroom`}>
        <div className="stage-wall" />
        <div className="stage-word" style={{ fontSize: `clamp(3rem, ${Math.round(92 / Math.max(word.length, 4))}vw, 20rem)` }} aria-hidden>{word}</div>
        <div className="stage-panel yellow" style={{ left: "6%" }} />
        <div className="stage-panel" style={{ left: "13%", top: "33%", height: "24%" }} />
        <div className="stage-panel" style={{ right: "13%", top: "33%", height: "24%" }} />
        <div className="stage-panel red" style={{ right: "6%" }} />
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

      {/* Headline numbers */}
      <div className="rise mb-5 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]" style={delay(30)}>
        {headline.map((h) => (
          <div key={h.label} className="card px-4 py-3">
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {h.label} {h.info && <InfoTip text={h.info} />}
            </div>
            <div className="mt-1">
              <span className="tabular display text-xl text-white sm:text-2xl">{h.value}</span>
              {h.unit && <span className="ml-1 text-sm text-zinc-400">{h.unit}</span>}
            </div>
            <div className="mt-0.5 truncate text-xs text-zinc-500">{h.sub}</div>
          </div>
        ))}
      </div>

      {specs && (
        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          <section className="card rise p-5" style={delay(50)}>
            <SectionTitle icon={Wrench} info="The real car's specs, from the maker and the teams. Power and weight are the maker's figures: in a race the BoP sets them.">The car</SectionTitle>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
              {sheetRows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-zinc-500">{k}</dt>
                  <dd className="text-zinc-200">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="card card-red rise p-5" style={delay(70)}>
            <SectionTitle icon={Trophy} info="Only well-documented results: overall wins, class wins in the big races, titles.">Racing record</SectionTitle>
            {specs.wins.length === 0 ? <p className="text-sm text-zinc-500">No major win found yet.</p> : (
              <ul className="space-y-2.5">
                {specs.wins.map((w) => (
                  <li key={`${w.year}-${w.event}-${w.detail}`} className="flex gap-3">
                    <span className="tabular mt-0.5 h-fit rounded-md bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent">{w.year}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-white"><Flag size={13} className="shrink-0 text-race" /> {w.event}</div>
                      {w.detail && <div className="text-xs text-zinc-400">{w.detail}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
              Sources: {specs.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="hover:text-zinc-300 hover:underline">{s.label}</a>)}
            </p>
          </section>
        </div>
      )}
    </>
  );
}
