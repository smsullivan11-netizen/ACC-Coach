import { ArrowLeft, CalendarDays, Clock, Flag, Gauge, Info, ListOrdered, Pencil, Server, Trophy, Users, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LocalTime from "@/components/LocalTime";
import { Avatar, Chip, delay, Position, RankBadge, SectionTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { eventResults, getEvent, readiness, savedLineup, suggestLineup } from "@/lib/events";
import { carShortName, lapTime } from "@/lib/format";
import { CAR_MODELS } from "@/lib/results";
import { hasPhoto, photoUrl, trackInfo, TRACKS } from "@/lib/tracks";
import EventForm from "../EventForm";
import SignUp from "../SignUp";
import Lineup from "./Lineup";
import { LinkDriver, RemoveResults, ResultsImport } from "./ResultsAdmin";

export const metadata: Metadata = { title: "Event" };

const PIT_LOSS_S = 60;   // time lost per pit stop (drive-through + driver swap), for the laps estimate
const LEVEL = { ready: { tone: "green", label: "Ready" }, building: { tone: "yellow", label: "Building up" }, none: { tone: "red", label: "Not practised" } } as const;
const SESSION = { P: "Practice", Q: "Qualifying", R: "Race" } as Record<string, string>;

export default async function EventPage(props: PageProps<"/events/[id]">) {
  const me = await requireDriver();
  const { id } = await props.params;
  if (!/^\d+$/.test(id)) notFound();
  const e = await getEvent(id);
  if (!e) notFound();
  const [entries, saved, results, members, cars] = await Promise.all([
    readiness(e), savedLineup(id), eventResults(id),
    sql<{ id: string; display_name: string }[]>`select id, display_name from driver order by display_name`,
    sql<{ car_key: string }[]>`select car_key from car_target where track_key = ${e.track_key} order by car_key`,
  ]);
  const mine = entries.find((x) => x.driver_id === me.id);
  const yes = entries.filter((x) => x.status === "yes");
  const info = trackInfo(e.track_key);
  const tracks = Object.entries(TRACKS).map(([k, t]) => [k, t.name] as [string, string]).sort((a, b) => a[1].localeCompare(b[1]));
  const carOptions = [...new Set([...cars.map((c) => c.car_key), "ford_mustang_gt3", "mclaren_720s_gt3_evo"])].map((k) => [k, carShortName(k)] as [string, string]);
  const iso = new Date(e.starts_at).toISOString();
  const unmatched = [...new Map(results.lines.flatMap((l) => l.drivers).filter((d) => !d.driver_id && d.steam_id).map((d) => [d.steam_id!, d.name])).entries()];

  return (
    <div>
      <Link href="/events" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"><ArrowLeft size={15} /> All events</Link>
      <div className="card rise relative overflow-hidden">
        {hasPhoto(e.track_key) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(e.track_key)} alt="" className="h-52 w-full object-cover" />
        ) : <div className="h-52 w-full bg-raised" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <div className="stripe absolute inset-x-0 bottom-0 h-[2px]" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="flex flex-wrap gap-2">
            <Chip tone={e.kind === "endurance" ? "red" : "yellow"}>{e.kind}</Chip>
            {e.league && <Chip>{e.league}</Chip>}
            <Chip>{e.car_class}</Chip>
          </div>
          <h1 className="display mt-2 text-3xl text-white">{e.title}</h1>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-300">
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-race" /><LocalTime iso={iso} countdown /></span>
            <span className="inline-flex items-center gap-1.5"><Clock size={14} /> {e.duration_min} min</span>
            <span className="inline-flex items-center gap-1.5"><Flag size={14} /> {info?.name ?? e.track_key}</span>
            {e.min_pit_stops > 0 && <span className="inline-flex items-center gap-1.5"><Wrench size={14} /> {e.min_pit_stops} mandatory stop{e.min_pit_stops > 1 ? "s" : ""}</span>}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="card card-red rise p-5" style={delay(60)}>
          <SectionTitle icon={Users}>Are you racing?</SectionTitle>
          <SignUp eventId={id} status={mine?.status ?? null} car={mine?.car_key} cars={carOptions} />
          <p className="mt-2 text-xs text-zinc-500">Answer even if you can&apos;t: it helps plan the line-up.</p>
        </section>
        {(e.server || e.notes) && (
          <section className="card rise p-5" style={delay(90)}>
            <SectionTitle icon={Info}>Briefing</SectionTitle>
            {e.server && <p className="flex gap-2 text-sm text-zinc-300"><Server size={14} className="mt-0.5 shrink-0 text-zinc-500" /> {e.server}</p>}
            {e.notes && <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">{e.notes}</p>}
          </section>
        )}
      </div>

      {/* Readiness */}
      <section className="card rise mt-5 overflow-hidden" style={delay(120)}>
        <div className="p-5 pb-0">
          <SectionTitle icon={Gauge}>Who&apos;s ready</SectionTitle>
          <p className="-mt-1 text-xs text-zinc-500">Practice on {info?.name ?? e.track_key} in {e.car_class}: valid laps in the last 30 days, best lap, race pace (average of the 5 best laps of the last 60 days) and the gap to the car&apos;s target.</p>
        </div>
        {entries.length === 0 ? <p className="p-5 text-sm text-zinc-500">No one has answered yet.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Driver</th><th>Answer</th><th>Car</th><th className="text-right">Laps (30 d)</th><th className="text-right">Best</th><th className="text-right">Race pace</th><th className="text-right">vs target</th><th>Readiness</th></tr></thead>
              <tbody>
                {entries.map((r) => {
                  const vs = r.best_ms != null && r.target_ms ? ((r.best_ms - r.target_ms) / r.target_ms) * 100 : null;
                  return (
                    <tr key={r.driver_id} className={r.status === "no" ? "opacity-50" : ""}>
                      <td>
                        <Link href={`/drivers/${r.driver_id}`} className="flex items-center gap-2.5 text-white hover:underline">
                          <Avatar url={r.avatar_url} name={r.driver} size={26} /> {r.driver} <RankBadge rating={r.rating} />
                        </Link>
                        {r.note && <div className="mt-0.5 text-xs text-zinc-500">{r.note}</div>}
                      </td>
                      <td><Chip tone={r.status === "yes" ? "green" : r.status === "maybe" ? "yellow" : "red"}>{r.status}</Chip></td>
                      <td className="text-zinc-300">{r.car_key ? carShortName(r.car_key) : "–"}</td>
                      <td className="text-right">{r.laps_30d}</td>
                      <td className="text-right font-semibold text-white">{lapTime(r.best_ms)}</td>
                      <td className="text-right text-zinc-300">{lapTime(r.pace_ms)}</td>
                      <td className={`text-right ${vs == null ? "text-zinc-600" : vs <= 0 ? "text-emerald-400" : vs <= 1 ? "text-accent" : "text-red-400"}`}>
                        {vs == null ? "–" : `${vs > 0 ? "+" : ""}${vs.toFixed(1)} %`}
                      </td>
                      <td><Chip tone={LEVEL[r.level].tone}>{LEVEL[r.level].label}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Line-up */}
      {e.kind === "endurance" && (
        <section className="card card-red rise mt-5 p-5" style={delay(150)}>
          <SectionTitle icon={ListOrdered}>Line-up</SectionTitle>
          {yes.length === 0 && !saved.length ? <p className="text-sm text-zinc-500">The line-up is suggested once drivers answer &quot;I&apos;m in&quot;.</p> : (
            <Lineup eventId={id} startIso={iso} duration={e.duration_min} saved={saved} suggested={suggestLineup(e, entries)}
                    drivers={members.filter((m) => yes.some((y) => y.driver_id === m.id) || saved.some((s) => s.driver_id === m.id))
                      .map((m) => ({ id: m.id, name: m.display_name, pace_ms: entries.find((x) => x.driver_id === m.id)?.pace_ms ?? null }))}
                    pitLossS={PIT_LOSS_S} editable={me.is_admin} />
          )}
          <p className="mt-3 text-xs text-zinc-500">
            {e.max_stint_min ? `Max stint ${e.max_stint_min} min. ` : ""}Laps per stint from each driver&apos;s race pace, minus about {PIT_LOSS_S} s per pit stop.
          </p>
        </section>
      )}

      {/* Results */}
      <section className="card rise mt-5 p-5" style={delay(180)}>
        <SectionTitle icon={Trophy}>Results</SectionTitle>
        {me.is_admin && <div className="mb-4"><ResultsImport eventId={id} /></div>}
        {results.sessions.length === 0 && <p className="text-sm text-zinc-500">No results imported yet.</p>}
        {results.sessions.map((s) => {
          const lines = results.lines.filter((l) => l.server_session_id === s.id);
          const leader = lines[0];
          const pace = results.pace.filter((p) => p.server_session_id === s.id);
          return (
            <div key={s.id} className="mt-4 first:mt-0">
              <div className="mb-2 flex items-center gap-3">
                <h3 className="display text-lg text-white">{SESSION[s.session_type ?? ""] ?? s.session_type ?? "Session"}</h3>
                <span className="text-xs text-zinc-500">{s.server_name || s.file_name}</span>
                {me.is_admin && <span className="ml-auto"><RemoveResults eventId={id} sessionId={s.id} /></span>}
              </div>
              <div className="overflow-x-auto rounded-lg border border-white/5">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Car</th><th>Drivers</th><th className="text-right">Laps</th><th className="text-right">Best lap</th><th className="text-right">{s.session_type === "R" ? "Gap" : "Gap to best"}</th></tr></thead>
                  <tbody>
                    {lines.map((l) => {
                      const team = l.drivers.some((d) => d.driver_id);
                      const gap = s.session_type === "R"
                        ? (l.laps < leader.laps ? `+${leader.laps - l.laps} lap${leader.laps - l.laps > 1 ? "s" : ""}` : l.total_time_ms != null && leader.total_time_ms != null && l !== leader ? `+${((l.total_time_ms - leader.total_time_ms) / 1000).toFixed(3)}` : "")
                        : l.best_lap_ms != null && leader.best_lap_ms != null && l !== leader ? `+${((l.best_lap_ms - leader.best_lap_ms) / 1000).toFixed(3)}` : "";
                      return (
                        <tr key={l.car_number_id} className={team ? "bg-accent/[0.07]" : ""}>
                          <td><Position n={l.position} /></td>
                          <td className="whitespace-nowrap text-zinc-300">{l.race_number != null && <span className="text-zinc-500">#{l.race_number} </span>}{CAR_MODELS[l.car_model ?? -1] ?? "–"}</td>
                          <td>
                            {l.drivers.map((d, k) => (
                              <span key={k} className="mr-2">
                                {d.driver_id ? <Link href={`/drivers/${d.driver_id}`} className="font-medium text-accent hover:underline">{d.name}</Link>
                                  : <span className={team ? "text-zinc-300" : "text-zinc-400"}>{d.name}</span>}
                              </span>
                            ))}
                            {l.team_name && <span className="text-xs text-zinc-600">{l.team_name}</span>}
                          </td>
                          <td className="text-right">{l.laps}</td>
                          <td className="text-right font-medium text-white">{lapTime(l.best_lap_ms)}</td>
                          <td className="text-right text-zinc-400">{gap}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pace.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {pace.map((p) => (
                    <div key={p.driver_id} className="rounded-lg border border-white/10 bg-raised/50 px-3 py-2 text-sm">
                      <div className="font-medium text-white">{members.find((m) => m.id === p.driver_id)?.display_name}</div>
                      <div className="tabular text-xs text-zinc-400">
                        {p.laps} laps ({p.valid} valid) · pace <span className="text-white">{lapTime(p.median_ms)}</span>
                        {p.spread_ms != null && <> · ±{(p.spread_ms / 1000).toFixed(2)} s</>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {me.is_admin && unmatched.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">A team driver was not recognised? Link them ({unmatched.length} names)</summary>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {unmatched.map(([steam, nm]) => (
                <div key={steam} className="flex items-center text-zinc-400">{nm}<LinkDriver steamId={steam} members={members.map((m) => [m.id, m.display_name])} /></div>
              ))}
            </div>
          </details>
        )}
      </section>

      {me.is_admin && (
        <details className="card mt-5 p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-zinc-300"><Pencil size={14} className="text-race" /> Edit event</summary>
          <div className="mt-4">
            <EventForm tracks={tracks} init={{ ...e, starts_at: iso }} />
          </div>
        </details>
      )}
    </div>
  );
}
