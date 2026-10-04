import { ArrowLeft, CalendarDays, Car, CircleCheck, Crown, LineChart, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Chip, delay, SectionTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { coachSession } from "@/lib/coaching";
import { sql } from "@/lib/db";
import { lapTime, prettyKey, REASONS } from "@/lib/format";
import { hasPhoto, photoUrl, trackInfo } from "@/lib/tracks";
import Coach from "./Coach";

type Session = {
  id: string;
  recorded: string | null;
  driver: string;
  driver_id: string;
  avatar_url: string | null;
  track: string;
  car: string | null;
  car_class: string | null;
  session_type: string | null;
  source_kind: string;
  source_file: string;
};
type Lap = {
  id: string;
  number: number;
  lap_time_ms: number;
  game_lap_time_ms: number | null;
  official_lap_time_ms: number | null;
  comparable: boolean;
  excluded_reasons: string[];
  metrics: Record<string, number> | null;
};

export const metadata: Metadata = { title: "Session" };

export default async function SessionPage(props: PageProps<"/sessions/[id]">) {
  await requireDriver();
  const { id } = await props.params;
  if (!/^\d+$/.test(id)) notFound();
  const [session] = await sql<Session[]>`
    select s.id, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon YYYY, HH24:MI') as recorded,
           d.display_name as driver, d.id as driver_id, d.avatar_url, t.key as track, c.key as car, c.class as car_class,
           s.session_type, s.source_kind, s.source_file
    from session s join driver d on d.id = s.driver_id join track t on t.id = s.track_id
    left join car c on c.id = s.car_id
    where s.id = ${id}`;
  if (!session) notFound();
  const laps = await sql<Lap[]>`
    select l.id, l.number, l.lap_time_ms, l.game_lap_time_ms, l.official_lap_time_ms, l.comparable,
           l.excluded_reasons, l.metrics
    from lap l where l.session_id = ${id} order by l.number`;
  // The most official time available: server results, else the game's, else our own measurement
  const time = (l: Lap) => l.official_lap_time_ms ?? l.game_lap_time_ms ?? l.lap_time_ms;
  const best = Math.min(...laps.filter((l) => l.comparable).map(time));
  const coaching = await coachSession(id);

  const info = trackInfo(session.track);
  const photo = hasPhoto(session.track);

  return (
    <div>
      <Link href="/sessions" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft size={15} /> All sessions
      </Link>
      <div className="card rise relative overflow-hidden">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(session.track)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/30" />
        <div className="stripe absolute inset-x-0 bottom-0 h-[2px]" />
        <div className="relative flex flex-wrap items-center gap-5 p-6">
          <Avatar url={session.avatar_url} name={session.driver} size={56} ring />
          <div className="min-w-0">
            <h1 className="display text-2xl text-white sm:text-3xl">{info?.name ?? prettyKey(session.track)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-300">
              <Link href={`/drivers/${session.driver_id}`} className="font-medium text-white hover:underline">{session.driver}</Link>
              <span className="inline-flex items-center gap-1 text-zinc-400"><CalendarDays size={14} /> {session.recorded}</span>
              <span className="inline-flex items-center gap-1 text-zinc-400"><Car size={14} /> {prettyKey(session.car)}{session.car_class && ` (${session.car_class})`}</span>
              {session.session_type && <Chip tone={session.session_type === "race" ? "red" : "grey"}>{session.session_type}</Chip>}
            </p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs uppercase tracking-wider text-zinc-500">Best lap</div>
            <div className="tabular text-3xl font-bold text-accent">{Number.isFinite(best) ? lapTime(best) : "–"}</div>
            <div className="text-xs text-zinc-500">{laps.filter((l) => l.comparable).length}/{laps.length} valid laps</div>
          </div>
        </div>
      </div>

      {coaching && <Coach c={coaching} />}

      <section className="card rise mt-5 overflow-hidden" style={delay(120)}>
        <div className="p-5 pb-0"><SectionTitle icon={Timer}>Laps</SectionTitle></div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lap</th>
                <th className="text-right">Time</th>
                <th className="text-right">Gap</th>
                <th>Status</th>
                <th className="text-right">Full throttle</th>
                <th className="text-right">Braking</th>
                <th className="text-right">Top speed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {laps.map((l) => {
                const m = l.metrics ?? {};
                const isBest = l.comparable && time(l) === best;
                return (
                  <tr key={l.id} className={isBest ? "bg-accent/[0.06]" : ""}>
                    <td className="font-medium text-zinc-300">L{l.number}</td>
                    <td className={`text-right ${isBest ? "font-bold text-accent" : l.comparable ? "font-medium text-white" : "text-zinc-500"}`}>
                      <span className="inline-flex items-center gap-1.5">{isBest && <Crown size={13} />}{lapTime(time(l))}</span>
                    </td>
                    <td className="text-right text-zinc-400">
                      {l.comparable && Number.isFinite(best) && !isBest ? `+${((time(l) - best) / 1000).toFixed(3)}` : ""}
                    </td>
                    <td>
                      {l.comparable ? <Chip tone="green" icon={CircleCheck}>valid</Chip> : (
                        <span className="flex flex-wrap gap-1">
                          {l.excluded_reasons.map((r) => (
                            <Chip key={r} tone={r === "game_invalid" || r === "server_invalid" ? "red" : r === "track_edges" ? "blue" : "grey"}>{REASONS[r] ?? r}</Chip>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="text-right">{m.full_throttle_pct != null ? `${m.full_throttle_pct.toFixed(1)} %` : "–"}</td>
                    <td className="text-right">{m.braking_pct != null ? `${m.braking_pct.toFixed(1)} %` : "–"}</td>
                    <td className="text-right">{m.max_speed_kmh != null ? `${m.max_speed_kmh.toFixed(0)} km/h` : "–"}</td>
                    <td className="text-right">
                      <Link href={`/laps/${l.id}`} className="btn btn-ghost px-2.5 py-1 text-xs font-medium"><LineChart size={13} /> Analyse</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-xs text-zinc-500">
          Lap times are the game&apos;s when recorded live ({session.source_kind === "shared_memory" ? "recorder" : "MoTeC"}, {session.source_file}).
        </p>
      </section>
    </div>
  );
}
