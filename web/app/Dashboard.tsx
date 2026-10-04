import { ArrowUpRight, Crown, Download, Flag, Gauge, Medal, Sparkles, Timer, TrendingDown, TrendingUp, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { Avatar, Chip, delay, SectionTitle } from "@/components/ui";
import type { Driver } from "@/lib/auth";
import { coachSession } from "@/lib/coaching";
import { sql } from "@/lib/db";
import { carShortName, lapTime, prettyKey } from "@/lib/format";
import { PROVISIONAL_SESSIONS } from "@/lib/ratings";
import { recentSessions, timeOfDay, dayLabel, type SessionRow } from "@/lib/sessions";

// Home page of a signed-in driver: their numbers, the coach's focus, the team ranking, their recent
// sessions and what the team has been doing.
export default async function Dashboard({ me }: { me: Driver }) {
  const [[stats], ratings, ranking, mine, team, [coached]] = await Promise.all([
    sql<{ sessions: number; week: number; laps: number; wins: number; tracks: number }[]>`
      select (select count(*) from session where driver_id = ${me.id})::int as sessions,
             (select count(*) from session where driver_id = ${me.id}
                and coalesce(recorded_at, uploaded_at) > now() - interval '7 days')::int as week,
             (select count(*) from lap l join session s on s.id = l.session_id where s.driver_id = ${me.id} and l.comparable)::int as laps,
             (select count(*) from lap_ranking where driver_id = ${me.id} and position = 1)::int as wins,
             (select count(distinct track_id) from lap_ranking where driver_id = ${me.id})::int as tracks`,
    sql<{ rating: number }[]>`select rating from driver_rating where driver_id = ${me.id} order by id desc limit ${PROVISIONAL_SESSIONS}`,
    sql<{ id: string; display_name: string; avatar_url: string | null; rating: number }[]>`
      select d.id, d.display_name, d.avatar_url, r.rating
      from driver d join lateral (select rating from driver_rating where driver_id = d.id order by id desc limit 1) r on true
      order by r.rating desc limit 5`,
    recentSessions({ driverId: me.id, limit: 5 }),
    recentSessions({ limit: 8 }),
    sql<{ id: string; track: string; at: Date }[]>`
      select s.id, t.key as track, coalesce(s.recorded_at, s.uploaded_at) as at
      from session s join track t on t.id = s.track_id
      where s.driver_id = ${me.id} and exists (select 1 from lap l where l.session_id = s.id and l.comparable)
      order by coalesce(s.recorded_at, s.uploaded_at) desc limit 1`,
  ]);
  const coaching = coached ? await coachSession(coached.id) : null;
  const rating = ratings[0]?.rating ?? null;
  const change = ratings.length >= 2 ? ratings[0].rating - ratings[1].rating : null;
  const first = me.display_name.split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <div className="rise flex flex-wrap items-end gap-4">
        <div>
          <p className="text-sm text-zinc-500">{dayLabel(new Date())}</p>
          <h1 className="display mt-1 text-3xl text-white">Welcome back, <span className="text-accent">{first}</span></h1>
        </div>
        {mine.length === 0 && (
          <Link href="/download" className="ml-auto inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink hover:brightness-110">
            <Download size={16} /> Get the app to record your first session
          </Link>
        )}
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Gauge} label="Overall Driver Rating" d={40}
              value={rating != null ? rating.toFixed(1) : "–"} accent
              foot={rating == null ? "after your first valid lap"
                : ratings.length < PROVISIONAL_SESSIONS ? `provisional (${ratings.length}/${PROVISIONAL_SESSIONS})`
                : change != null && <Trend value={change} />} />
        <Stat icon={Flag} label="Sessions" value={String(stats.sessions)} d={80}
              foot={`${stats.week} in the last 7 days`} />
        <Stat icon={Timer} label="Valid laps" value={String(stats.laps)} d={120} foot="all sessions" />
        <Stat icon={Trophy} label="Track records" value={String(stats.wins)} d={160}
              foot={`fastest of the team on ${stats.wins} of ${stats.tracks} track${stats.tracks === 1 ? "" : "s"}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Coach */}
        <section className="card rise min-w-0 p-5 lg:col-span-2" style={delay(200)}>
          <SectionTitle icon={Sparkles}
                        action={coached && <Link href={`/sessions/${coached.id}`} className="inline-flex items-center gap-1 text-zinc-400 hover:text-white">
                          full summary <ArrowUpRight size={13} /></Link>}>
            Coach&apos;s focus
          </SectionTitle>
          {coaching && coaching.focus.length ? (
            <>
              <p className="text-sm text-zinc-400">
                From your last session: {prettyKey(coached!.track)}, {dayLabel(new Date(coached!.at)).toLowerCase()}.
              </p>
              <p className="mt-2 text-white">{coaching.headline}</p>
              <ol className="mt-3 space-y-2">
                {coaching.focus.map((f, i) => (
                  <li key={f} className="flex gap-3 text-sm text-zinc-300">
                    <span className="display grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/15 text-xs text-accent">{i + 1}</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : coaching ? (
            <>
              <p className="text-white">{coaching.headline}</p>
              <ul className="mt-3 space-y-2">
                {coaching.notes.slice(0, 3).map((n) => (
                  <li key={n.text} className="flex gap-3 text-sm text-zinc-300">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${
                      n.tone === "good" ? "bg-emerald-400/15 text-emerald-300" : n.tone === "warning" ? "bg-race/15 text-red-300" : "bg-accent/15 text-accent"}`}>
                      {n.tone === "good" ? "✓" : n.tone === "warning" ? "!" : "→"}
                    </span>
                    <span>{n.text}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-zinc-400">Your coaching appears here after your first session with a valid lap.</p>
          )}
        </section>

        {/* Team ranking */}
        <section className="card rise min-w-0 p-5" style={delay(240)}>
          <SectionTitle icon={Users} action={<Link href="/drivers" className="text-zinc-400 hover:text-white">all drivers</Link>}>
            Team ranking
          </SectionTitle>
          <ol className="space-y-2.5">
            {ranking.map((d, i) => (
              <li key={d.id}>
                <Link href={`/drivers/${d.id}`} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5 ${d.id === me.id ? "bg-accent/5" : ""}`}>
                  <Position n={i + 1} />
                  <Avatar url={d.avatar_url} name={d.display_name} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{d.display_name}</span>
                  <span className="tabular text-sm font-semibold text-accent">{d.rating.toFixed(1)}</span>
                </Link>
              </li>
            ))}
            {!ranking.length && <li className="text-sm text-zinc-500">No rated driver yet.</li>}
          </ol>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card rise min-w-0 p-5" style={delay(280)}>
          <SectionTitle icon={Flag} action={<Link href="/sessions" className="text-zinc-400 hover:text-white">all sessions</Link>}>
            Your recent sessions
          </SectionTitle>
          <SessionList rows={mine} showDriver={false} empty="No session yet: install the app and drive." />
        </section>
        <section className="card rise min-w-0 p-5" style={delay(320)}>
          <SectionTitle icon={Users}>Team activity</SectionTitle>
          <SessionList rows={team} showDriver empty="Nothing yet." />
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, foot, accent, d }: {
  icon: typeof Gauge; label: string; value: string; foot?: React.ReactNode; accent?: boolean; d: number;
}) {
  return (
    <div className="card rise p-4" style={delay(d)}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
        <Icon size={14} className={accent ? "text-accent" : "text-zinc-400"} /> {label}
      </div>
      <div className={`tabular mt-2 text-3xl font-bold ${accent ? "text-accent" : "text-white"}`}>{value}</div>
      {foot && <div className="mt-1 text-xs text-zinc-500">{foot}</div>}
    </div>
  );
}

function Trend({ value }: { value: number }) {
  if (Math.abs(value) < 0.05) return <span>no change last session</span>;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 ${up ? "text-emerald-400" : "text-red-400"}`}>
      <Icon size={13} /> {up ? "+" : ""}{value.toFixed(1)} last session
    </span>
  );
}

function Position({ n }: { n: number }) {
  const style = n === 1 ? "bg-accent text-ink" : n === 2 ? "bg-zinc-300 text-ink" : n === 3 ? "bg-amber-700 text-white" : "bg-white/5 text-zinc-400";
  return <span className={`tabular grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${style}`}>{n}</span>;
}

function SessionList({ rows, showDriver, empty }: { rows: SessionRow[]; showDriver: boolean; empty: string }) {
  if (!rows.length) return <p className="text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="divide-y divide-white/5">
      {rows.map((s) => (
        <li key={s.id}>
          <Link href={`/sessions/${s.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-white/5">
            {showDriver && <Avatar url={s.avatar_url} name={s.driver} size={30} />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm text-white">
                <span className="truncate">{showDriver ? <>{s.driver} <span className="text-zinc-500">at</span> {prettyKey(s.track)}</> : prettyKey(s.track)}</span>
                {s.position === 1 ? <Chip tone="yellow" icon={Crown}>Team best</Chip> : s.position != null && <Chip tone="green" icon={Medal}>PB</Chip>}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {dayLabel(new Date(s.at))}, {timeOfDay(new Date(s.at))} · {s.car ? carShortName(s.car) : "–"} · {s.valid_laps}/{s.laps} valid laps
              </div>
            </div>
            <span className={`tabular text-sm font-semibold ${s.best_ms ? "text-white" : "text-zinc-600"}`}>{lapTime(s.best_ms)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
