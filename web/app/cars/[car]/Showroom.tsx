import { Settings2 } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import InfoTip from "@/components/InfoTip";
import { Chip, PartBar } from "@/components/ui";
import { brandLogo } from "@/lib/brand-logos";
import type { CarSpecs } from "@/lib/car-specs";
import { OVERALL_INFO } from "@/lib/cars";
import { scaleColor } from "@/lib/ranks";

type Part = { key: string; label: string; info: string; v: number | null };
type Props = {
  car: string; name: string; cls: string; year: number;
  cutout: string | null; overall: number | null; setups: number;
  parts: Part[];                                    // the admins' sub-ratings, in CAR_PARTS order
  wings: [number | null, number | null];            // measured top speed, min and max wing (km/h)
  rated: ReactNode;                                  // "Rated by …" line
  specs: CarSpecs | null;
  note: string | null; noteInfo: string | null;      // the car's description and where it comes from
};
type Row = { k: string; v: string; unit?: string; sub?: string };

function Hud({ side, title, info, children }: { side: "left" | "right"; title: string; info?: string; children: ReactNode }) {
  return (
    <div className={`hud ${side}`}>
      <div className="hud-glass">
        <div className="hud-title">{title} {info && <InfoTip text={info} side={side} />}</div>
        {children}
      </div>
    </div>
  );
}

// The car page's showroom (user's request, 2026-10-09): the car on a stage drawn in CSS (globals.css,
// .stage) under its make's glowing logo (lib/brand-logos.ts), its name and overall rating on the wall,
// its description under it, and two glass HUDs standing on the stage on both sides of it (.hud): the
// admins' ratings with their coloured bars and the real car's specs (lib/car-specs.ts). Below 1280 px
// the HUDs sit flat under the stage, and below 640 px the description too.
export default function Showroom({ car, name, cls, year, cutout, overall, setups, parts, wings, rated, specs, note, noteInfo }: Props) {
  const logo = brandLogo(car);
  // A wide logo (the Mustang's pony, Jaguar's leaper, Ginetta's wordmark) keeps its proportions and is
  // made lower, so it is about as big on the wall as a round one. On the stage: the beam starts at it
  const [, , vw, vh] = (logo?.viewBox ?? "0 0 24 24").split(" ").map(Number);
  const ratio = vw / vh;
  const stageVars = { "--logo-k": Math.min(1, 1.8 / ratio), "--logo-r": ratio } as CSSProperties;
  const specRows: Row[] = specs ? ([
    { k: "Engine", v: specs.engine.replace(/ \(.*\)$/, ""), sub: specs.aspiration },
    specs.displacement && { k: "Displacement", v: specs.displacement.toLocaleString("en-GB"), unit: "cc" },
    specs.power && { k: "Power", v: specs.power.replace(/ hp$/, ""), unit: "hp" },
    specs.weight && { k: "Weight", v: specs.weight.replace(/ kg$/, ""), unit: "kg" },
    specs.gearbox && { k: "Gearbox", v: specs.gearbox },
    { k: "Layout", v: specs.layout },
    specs.debut && { k: "Race debut", v: specs.debut },
  ].filter(Boolean) as Row[]) : [{ k: "Model", v: String(year), sub: "Specs to come" }];
  const specInfo = `The real car, from the maker and the teams${specs ? ` (${specs.sources.map((s) => s.label).join(", ")})` : ""}. Power and weight are the maker's figures: in a race the BoP sets them.`;

  const huds = [
    <Hud key="l" side="left" title="Ratings" info="Out of 100, by the team's admins.">
      {parts.map((p) => (
        <div key={p.key} className="hud-rate">
          <div className="flex items-baseline justify-between gap-2">
            <span className="hud-k">{p.label} <InfoTip text={p.info} side="left" /></span>
            <span className="hud-v tabular" style={p.v != null ? { color: scaleColor(p.v) } : { color: "rgb(82 82 91)" }}>{p.v ?? "–"}</span>
          </div>
          <PartBar v={p.v ?? 0} className="mt-1 h-1" />
          {p.key === "top_speed" && (wings[0] != null || wings[1] != null) && (
            <span className="hud-sub">min wing {wings[0] ?? "–"} · max wing {wings[1] ?? "–"} km/h</span>
          )}
        </div>
      ))}
      <div className="hud-foot">{rated}</div>
    </Hud>,
    <Hud key="r" side="right" title="The car" info={specInfo}>
      {specRows.map((r) => (
        <div key={r.k} className="hud-row">
          <span className="hud-k">{r.k}</span>
          <span className="hud-v">{r.v}{r.unit && <small>{r.unit}</small>}{r.sub && <span className="hud-sub">{r.sub}</span>}</span>
        </div>
      ))}
    </Hud>,
  ];
  const noteText = note && <>{note}{noteInfo && <> <InfoTip text={noteInfo} /></>}</>;

  return (
    <>
      <section className="stage rise mb-5" aria-label={`${name} in the showroom`} style={stageVars}>
        <div className="stage-wall" />
        <div className="stage-panel yellow stage-panel-out" style={{ left: "6%" }} />
        <div className="stage-panel stage-panel-in" style={{ left: "13%", top: "33%", height: "24%" }} />
        <div className="stage-panel stage-panel-in" style={{ right: "13%", top: "33%", height: "24%" }} />
        <div className="stage-panel red stage-panel-out" style={{ right: "6%" }} />
        <div className="stage-beam" />
        <div className="stage-logo" aria-hidden style={{ aspectRatio: `${vw} / ${vh}` }}>
          {logo ? (
            <svg viewBox={logo.viewBox ?? "0 0 24 24"}>
              {/* White, lit from below by its own lamp: a touch greyer at the top */}
              <defs><linearGradient id="logo-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c8c8d0" /><stop offset="0.6" stopColor="#f4f4f6" /><stop offset="1" stopColor="#fff" /></linearGradient></defs>
              <path d={logo.path} fillRule="evenodd" fill="url(#logo-fill)" />
            </svg>
          ) : <span>{name.split(" ")[0].toUpperCase()}</span>}
        </div>
        <div className="stage-floor" />
        <div className="stage-horizon" />
        <div className="stage-glow-l" />
        <div className="stage-glow-r" />
        <div className="stage-table" />
        {!cutout && <div className="inset-x-0 bottom-[22%] text-center text-xs uppercase tracking-[0.3em] text-zinc-600">Car picture to come</div>}
        {cutout && (
          <div className="stage-car">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="reflection" src={cutout} alt="" width={1600} height={430} aria-hidden />
            <div className="ambient" />
            <div className="shadow" />
            <div className="underbody" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="contact" src={cutout} alt="" width={1600} height={430} aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="car" src={cutout} alt={name} width={1600} height={430} fetchPriority="high" />
          </div>
        )}
        <div className="stage-vignette" />
        {noteText && <p className="stage-note">{noteText}</p>}
        {huds}

        {/* Name plate and overall rating on the wall */}
        <div className="pointer-events-auto! left-4 top-4 max-w-[52%] sm:left-7 sm:top-6 sm:max-w-[38%]">
          <div className="flex items-center gap-2 text-xs text-zinc-300"><Chip tone="yellow">{cls}</Chip> {year}</div>
          <h1 className={`display mt-1.5 text-xl leading-tight text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.8)] sm:text-3xl ${name.length > 22 ? "" : "xl:text-4xl"}`}>{name}</h1>
          <Link href={`/setups?car=${car}`} className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-accent hover:underline sm:text-sm">
            <Settings2 size={14} /> {setups ? `${setups} setup${setups === 1 ? "" : "s"}` : "Setups"}
          </Link>
        </div>
        <div className="pointer-events-auto! right-4 top-4 text-right sm:right-7 sm:top-6">
          <div className="flex items-center justify-end gap-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
            Overall <InfoTip text={OVERALL_INFO} side="right" />
          </div>
          {overall == null ? <div className="text-sm text-zinc-500">not rated yet</div>
            : <div className="tabular display mt-1 text-5xl leading-none drop-shadow-[0_4px_18px_rgb(0_0_0/0.85)] sm:text-7xl xl:text-[7.5rem]" style={{ color: scaleColor(overall), textShadow: `0 0 16px color-mix(in srgb, ${scaleColor(overall)} 45%, transparent), 0 0 44px color-mix(in srgb, ${scaleColor(overall)} 22%, transparent)` }}>{overall.toFixed(1)}</div>}
        </div>
      </section>

      {/* Narrower screens: the description (phones) and the same HUDs under the stage */}
      {noteText && <p className="mb-5 text-sm text-zinc-300 sm:hidden">{noteText}</p>}
      <div className="rise mb-5 grid gap-4 sm:grid-cols-2 xl:hidden">{huds}</div>
    </>
  );
}
