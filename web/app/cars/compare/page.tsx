import { GitCompareArrows, Swords, Timer, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import InfoTip from "@/components/InfoTip";
import { delay, PageTitle, SectionTitle, Segmented } from "@/components/ui";
import { REVIEW_DISCORD_ID, requireDriver } from "@/lib/auth";
import { carCutout } from "@/lib/car-images";
import { carSpecs, type CarSpecs } from "@/lib/car-specs";
import { CAR_PARTS, carInfo, CARS, CLASSES, OVERALL_INFO, overall, RANK_MODES, rankMode, type CarPart, type RankMode, type WingKey } from "@/lib/cars";
import { sql } from "@/lib/db";
import { lapTime, prettyKey } from "@/lib/format";
import { scaleColor } from "@/lib/ranks";
import { trackInfo } from "@/lib/tracks";

export const metadata: Metadata = { title: "Car head to head" };

type Rating = Record<CarPart | WingKey, number | null> & { car_key: string };
type Times = { car_key: string; track_key: string; ref_ms: number | null; team_ms: number | null };

// Two cars side by side (user's request, 2026-10-10, like the drivers' head to head): the admins'
// sub-ratings face to face, the overall (race or qualy / hotlap, `?mode=`), the real cars' specs and,
// on every track, OhneSpeed's default-BoP reference time and the team's best lap in each.
export default async function CarHeadToHead(props: PageProps<"/cars/compare">) {
  await requireDriver();
  const q = await props.searchParams;
  const mode = rankMode(q.mode);
  const pick = (v: unknown, fallback: string) => (typeof v === "string" && carInfo(v) ? v : fallback);
  const a = pick(q.a, "ford_mustang_gt3");
  const b = pick(q.b, CARS.find((c) => c.cls === carInfo(a)!.cls && c.key !== a)!.key);
  const A = carInfo(a)!, B = carInfo(b)!;
  const url = (x: string, y: string, m: RankMode) => `/cars/compare?a=${x}&b=${y}${m === "qualy" ? "&mode=qualy" : ""}`;

  const ratings = await sql<Rating[]>`select * from car_rating where car_key in (${a}, ${b})`.catch(() => []);
  const ra = ratings.find((r) => r.car_key === a) ?? null, rb = ratings.find((r) => r.car_key === b) ?? null;
  const times = await sql<Times[]>`
    with refs as (select car_key, lower(track_key) as track_key, time_ms from lap_reference where bop = 'default' and car_key in (${a}, ${b})),
    team as (
      select c.key as car_key, lower(t.key) as track_key, min(coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)) as ms
      from lap l join session s on s.id = l.session_id join car c on c.id = s.car_id join track t on t.id = s.track_id
      join driver d on d.id = s.driver_id
      where c.key in (${a}, ${b}) and l.comparable and d.discord_id is distinct from ${REVIEW_DISCORD_ID}
      group by 1, 2)
    select coalesce(r.car_key, t.car_key) as car_key, coalesce(r.track_key, t.track_key) as track_key, r.time_ms as ref_ms, t.ms as team_ms
    from refs r full join team t on t.car_key = r.car_key and t.track_key = r.track_key`;
  const tracks = [...new Set(times.map((t) => t.track_key))]
    .map((k) => ({ key: k, name: trackInfo(k)?.name ?? prettyKey(k), a: times.find((t) => t.track_key === k && t.car_key === a), b: times.find((t) => t.track_key === k && t.car_key === b) }))
    .filter((t) => (t.a?.ref_ms != null && t.b?.ref_ms != null) || (t.a?.team_ms != null && t.b?.team_ms != null))
    .sort((x, y) => x.name.localeCompare(y.name));
  const refTracks = tracks.filter((t) => t.a?.ref_ms != null && t.b?.ref_ms != null);
  const refGap = refTracks.length ? refTracks.reduce((s, t) => s + (t.a!.ref_ms! / t.b!.ref_ms! - 1), 0) / refTracks.length * 100 : null;

  const oa = overall(ra, mode), ob = overall(rb, mode);
  const counted = CAR_PARTS.filter((p) => p.key !== "driveability" && !(mode === "qualy" && p.key === "tyre_wear"));
  const aParts = counted.filter((p) => ra?.[p.key] != null && rb?.[p.key] != null && ra[p.key]! > rb[p.key]!).length;
  const bParts = counted.filter((p) => ra?.[p.key] != null && rb?.[p.key] != null && rb[p.key]! > ra[p.key]!).length;
  const options = CLASSES.map((cls) => ({ cls, cars: CARS.filter((c) => c.cls === cls) }));

  return (
    <div className="bleed bleed-lg">
      <PageTitle icon={Swords} sub="Two cars side by side: the team's ratings, the real cars' specs and the reference times on every track.">
        Car head to head
      </PageTitle>
      <form className="card rise mb-6 flex flex-wrap items-center gap-3 p-4">
        {[["a", a], ["b", b]].map(([name, value], i) => (
          <div key={name} className="contents">
            {i === 1 && <span className="display text-race">VS</span>}
            <select name={name} defaultValue={value} className="input min-w-52 flex-1">
              {options.map((o) => <optgroup key={o.cls} label={o.cls}>{o.cars.map((c) => <option key={c.key} value={c.key}>{c.name} ({c.year})</option>)}</optgroup>)}
            </select>
          </div>
        ))}
        {mode === "qualy" && <input type="hidden" name="mode" value="qualy" />}
        <button className="btn btn-primary"><GitCompareArrows size={15} /> Compare</button>
      </form>

      {a === b ? <p className="card p-6 text-zinc-400">Pick two different cars.</p> : (
        <>
          {/* Face to face */}
          <div className="card card-red rise relative overflow-hidden p-6" style={delay(40)}>
            <div className="grid grid-cols-2 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
              <Side car={a} name={A.name} cls={A.cls} year={A.year} overall={oa} parts={aParts} mode={mode} />
              <div className="order-last col-span-2 text-center sm:order-none sm:col-span-1">
                <div className="display text-3xl">
                  <span className={aParts >= bParts ? "text-accent" : "text-white"}>{aParts}</span>
                  <span className="mx-2 text-race">–</span>
                  <span className={bParts >= aParts ? "text-accent" : "text-white"}>{bParts}</span>
                </div>
                <div className="mt-1 flex items-center justify-center gap-1 text-xs uppercase tracking-wider text-zinc-500">ratings won <InfoTip text={`Sub-ratings where each car is ahead, out of those both have (${mode === "qualy" ? "tyre wear and " : ""}driveability left out).`} /></div>
                <Segmented options={RANK_MODES} value={mode} href={(m) => url(a, b, m)} className="mt-3" />
              </div>
              <Side car={b} name={B.name} cls={B.cls} year={B.year} overall={ob} parts={bParts} mode={mode} right />
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {/* The sub-ratings face to face: each bar grows from the middle */}
            <section className="card rise p-5" style={delay(80)}>
              <SectionTitle info="Out of 100, by the team's admins. Under top speed: the absolute top speed at min and max wing.">Ratings</SectionTitle>
              <div className="space-y-3">
                {CAR_PARTS.map((p) => {
                  const va = ra?.[p.key] ?? null, vb = rb?.[p.key] ?? null;
                  const off = p.key === "driveability" || (mode === "qualy" && p.key === "tyre_wear");
                  return (
                    <div key={p.key} className={off ? "opacity-60" : ""}>
                      <div className="mb-1 flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider text-zinc-400">
                        {p.label} <InfoTip text={p.info + (off ? " Not counted in this overall." : "")} />
                      </div>
                      <div className="grid grid-cols-[2.5rem_1fr_1fr_2.5rem] items-center gap-2">
                        <Val v={va} win={va != null && vb != null && va > vb} />
                        <Bar v={va} right />
                        <Bar v={vb} />
                        <Val v={vb} win={va != null && vb != null && vb > va} />
                      </div>
                      {p.key === "top_speed" && (
                        <div className="mt-0.5 grid grid-cols-2 gap-4 text-[11px] text-zinc-500">
                          <span className="text-right">{wings(ra)}</span><span>{wings(rb)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Specs side by side */}
            <section className="card rise p-5" style={delay(110)}>
              <SectionTitle icon={Wrench} info="The real cars, from the makers and the teams. Power and weight are the makers' figures: in a race the BoP sets them.">The cars</SectionTitle>
              <SpecTable a={carSpecs(a)} b={carSpecs(b)} ya={A.year} yb={B.year} />
            </section>
          </div>

          {/* Track by track */}
          <section className="card rise mt-5 overflow-hidden" style={delay(140)}>
            <div className="p-5 pb-0">
              <SectionTitle icon={Timer} info="Reference: OhneSpeed's sheet, default BoP qualifying. Team: the team's best valid lap in each car (any BoP). Gap: the left car against the right one.">
                Track by track
              </SectionTitle>
              {refGap != null && (
                <p className="-mt-1 mb-3 text-sm text-zinc-400">
                  On the sheet, {A.name} is <span className={`font-semibold ${refGap <= 0 ? "text-emerald-400" : "text-red-400"}`}>{refGap > 0 ? "+" : ""}{refGap.toFixed(2)} %</span> against {B.name} on average ({refTracks.length} tracks).
                </p>
              )}
            </div>
            {tracks.length === 0 ? <p className="px-5 pb-5 text-sm text-zinc-500">No track with times for both cars yet.</p> : (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Track</th>
                      <th className="text-right">Reference<Sub>{A.name}</Sub></th><th className="text-center">Gap</th><th>Reference<Sub>{B.name}</Sub></th>
                      <th className="text-right">Team best<Sub>{A.name}</Sub></th><th className="text-center">Gap</th><th>Team best<Sub>{B.name}</Sub></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((t) => (
                      <tr key={t.key}>
                        <td className="whitespace-nowrap text-zinc-200">{t.name}</td>
                        <Pair x={t.a?.ref_ms} y={t.b?.ref_ms} />
                        <Pair x={t.a?.team_ms} y={t.b?.team_ms} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const Sub = ({ children }: { children: string }) => <div className="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-zinc-500">{children}</div>;

const wings = (r: Rating | null) =>
  r?.top_speed_min_wing != null || r?.top_speed_max_wing != null ? `${r?.top_speed_min_wing ?? "–"} / ${r?.top_speed_max_wing ?? "–"} km/h` : "";

function Side({ car, name, cls, year, overall: o, parts, mode, right }: { car: string; name: string; cls: string; year: number; overall: number | null; parts: number; mode: RankMode; right?: boolean }) {
  const img = carCutout(car);
  return (
    <Link href={`/cars/${car}${mode === "qualy" ? "?mode=qualy" : ""}`} className={`group flex min-w-0 flex-col gap-2 ${right ? "items-end text-right" : ""}`}>
      {/* The two cars face each other: the right one mirrored */}
      {img
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={img} alt="" width={1600} height={430} className={`h-auto w-full max-w-md brightness-[1.12] drop-shadow-[0_14px_10px_rgb(0_0_0/0.8)] transition-transform group-hover:scale-[1.03] ${right ? "-scale-x-100 group-hover:-scale-x-[1.03]" : ""}`} />
        : <div className="h-24 w-full max-w-md rounded-lg bg-white/5" />}
      <div className="min-w-0">
        <div className="text-xs text-zinc-500">{cls} · {year}</div>
        <div className="display text-base leading-tight text-white group-hover:underline sm:truncate sm:text-xl">{name}</div>
        <div className={`mt-1 flex items-baseline gap-2 ${right ? "justify-end" : ""}`}>
          <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-zinc-500">Overall <InfoTip text={OVERALL_INFO} side={right ? "right" : "left"} /></span>
          <span className="tabular display text-2xl sm:text-3xl" style={o != null ? { color: scaleColor(o) } : undefined}>{o != null ? o.toFixed(1) : "–"}</span>
        </div>
        <div className="sr-only">{parts} ratings won</div>
      </div>
    </Link>
  );
}

function Val({ v, win }: { v: number | null; win: boolean }) {
  return <span className={`tabular text-center text-sm font-semibold ${win ? "" : "opacity-70"}`} style={v != null ? { color: scaleColor(v) } : { color: "rgb(82 82 91)" }}>{v ?? "–"}</span>;
}

function Bar({ v, right }: { v: number | null; right?: boolean }) {
  return (
    <div className={`flex h-2 overflow-hidden rounded-full bg-white/5 ${right ? "justify-end" : ""}`}>
      {v != null && <div className="h-full rounded-full" style={{ width: `${v}%`, background: scaleColor(v) }} />}
    </div>
  );
}

function SpecTable({ a, b, ya, yb }: { a: CarSpecs | null; b: CarSpecs | null; ya: number; yb: number }) {
  const rows: [string, (s: CarSpecs) => string | undefined][] = [
    ["Engine", (s) => s.engine], ["Aspiration", (s) => s.aspiration],
    ["Displacement", (s) => (s.displacement ? `${s.displacement.toLocaleString("en-GB")} cc` : undefined)],
    ["Power", (s) => s.power], ["Weight", (s) => s.weight], ["Gearbox", (s) => s.gearbox],
    ["Layout", (s) => s.layout], ["Race debut", (s) => s.debut],
  ];
  return (
    <table className="w-full text-sm">
      <tbody>
        <tr className="border-b border-white/5">
          <td className="py-2 pr-3 text-right text-zinc-200">{ya}</td>
          <td className="w-28 py-2 text-center text-[11px] uppercase tracking-wider text-zinc-500">ACC model</td>
          <td className="py-2 pl-3 text-zinc-200">{yb}</td>
        </tr>
        {rows.map(([label, get]) => {
          const x = a ? get(a) : undefined, y = b ? get(b) : undefined;
          if (!x && !y) return null;
          return (
            <tr key={label} className="border-b border-white/5 last:border-0">
              <td className="py-2 pr-3 text-right text-zinc-200">{x ?? <span className="text-zinc-600">–</span>}</td>
              <td className="w-28 py-2 text-center text-[11px] uppercase tracking-wider text-zinc-500">{label}</td>
              <td className="py-2 pl-3 text-zinc-200">{y ?? <span className="text-zinc-600">–</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Pair({ x, y }: { x: number | null | undefined; y: number | null | undefined }) {
  const gap = x != null && y != null ? (x - y) / 1000 : null;
  return (
    <>
      <td className={`tabular text-right ${gap != null && gap < 0 ? "font-semibold text-accent" : "text-zinc-300"}`}>{x != null ? lapTime(x) : <span className="text-zinc-600">–</span>}</td>
      <td className={`tabular w-24 text-center text-xs font-semibold ${gap == null ? "text-zinc-600" : gap === 0 ? "text-zinc-400" : gap < 0 ? "text-emerald-400" : "text-red-400"}`}>
        {gap == null ? "–" : gap === 0 ? "tie" : `${gap > 0 ? "+" : ""}${gap.toFixed(3)}`}
      </td>
      <td className={`tabular ${gap != null && gap > 0 ? "font-semibold text-accent" : "text-zinc-300"}`}>{y != null ? lapTime(y) : <span className="text-zinc-600">–</span>}</td>
    </>
  );
}
