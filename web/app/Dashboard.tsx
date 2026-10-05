import { Activity, ArrowUpRight, Crown, Gauge, Medal, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import { Avatar, Chip, delay, Position, RankBadge, RankIcon, SectionTitle } from "@/components/ui";
import type { Driver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { carShortName, lapTime, prettyKey } from "@/lib/format";
import { formParts, PROVISIONAL_SESSIONS, WEIGHTS } from "@/lib/ratings";
import { recentSessions, timeOfDay, dayLabel, type SessionRow } from "@/lib/sessions";

// Home page of a signed-in driver, four blocks only (the user wants it simple): their rating, their
// progression, the team ranking and the team's activity.
export default async function Dashboard({ me }: { me: Driver }) {
  const [history, [parts], ranking, mine, team] = await Promise.all([
    sql<{ rating: number; date: string }[]>`
      select rating, to_char(created_at, 'DD Mon') as date from driver_rating where driver_id = ${me.id} order by id`,
    formParts(sql, me.id).then((p) => [p]),
    sql<{ id: string; display_name: string; avatar_url: string | null; rating: number; sessions: number }[]>`
      select d.id, d.display_name, d.avatar_url, r.rating, (select count(*) from driver_rating where driver_id = d.id)::int as sessions
      from driver d join lateral (select rating from driver_rating where driver_id = d.id order by id desc limit 1) r on true
      order by r.rating desc limit 8`,
    recentSessions({ driverId: me.id, limit: 60 }),
    recentSessions({ limit: 7 }),
  ]);
  const rating = history.at(-1)?.rating ?? null;
  const change = history.length >= 2 ? history.at(-1)!.rating - history.at(-2)!.rating : null;
  const pbs = mine.filter((s) => s.position != null);
  const first = me.display_name.split(/\s+/)[0];

  return (
    <div>
      <div className="rise mb-6">
        <p className="text-sm text-zinc-500">{dayLabel(new Date())}</p>
        <h1 className="display mt-1 text-3xl text-white">Welcome back, <span className="text-accent">{first}</span></h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1. Rating */}
        <section className="card card-red rise min-w-0 p-5" style={delay(40)}>
          <SectionTitle icon={Gauge} action={<Link href={`/drivers/${me.id}`} className="inline-flex items-center gap-1 text-zinc-400 hover:text-white">your profile <ArrowUpRight size={13} /></Link>}>
            Your rating
          </SectionTitle>
          <div className="flex items-end gap-4">
            <div className="tabular text-6xl font-bold leading-none text-accent">{rating != null ? rating.toFixed(1) : "–"}</div>
            <div className="pb-1 text-sm text-zinc-400">
              <div className="flex items-center gap-2">Overall Driver Rating <RankBadge rating={rating} /></div>
              <div className="mt-0.5">
                {rating == null ? "after your first valid lap"
                  : history.length < PROVISIONAL_SESSIONS ? `provisional (${history.length}/${PROVISIONAL_SESSIONS} sessions)`
                  : change != null && <Trend value={change} />}
              </div>
            </div>
          </div>
          <div className="mt-5 space-y-2.5">
            {(Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((k, i) => {
              const v = parts?.[k];
              return (
                <div key={k} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-sm">
                  <span className="capitalize text-zinc-300">{k === "clean" ? "Clean driving" : k}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    {v != null && <div className="fill h-full rounded-full bg-gradient-to-r from-race to-accent" style={{ width: `${v}%`, ...delay(150 + i * 60) }} />}
                  </div>
                  <span className="tabular text-right text-zinc-400">{v != null ? Math.round(v) : "–"}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-500">Your best session on each track in the last 60 days (5+ valid laps), averaged over the tracks.</p>
        </section>

        {/* 2. Progression */}
        <section className="card card-red rise min-w-0 p-5" style={delay(90)}>
          <SectionTitle icon={TrendingUp}>Your progression</SectionTitle>
          <RatingLine points={history.map((h) => h.rating)} labels={history.map((h) => h.date)} />
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <Figure label="since your first session" value={history.length >= 2 ? signed(history.at(-1)!.rating - history[0].rating) : "–"} />
            <Figure label="PBs in 30 days" value={String(lastDays(pbs, 30).length)} />
            <Figure label="tracks with a PB" value={String(new Set(pbs.map((s) => s.track)).size)} />
          </div>
          {pbs.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-sm">
              {pbs.slice(0, 3).map((s) => (
                <li key={s.id}>
                  <Link href={`/sessions/${s.id}`} className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/5">
                    {s.position === 1 ? <Crown size={14} className="shrink-0 text-accent" /> : <Medal size={14} className="shrink-0 text-emerald-400" />}
                    <span className="truncate text-zinc-300">{prettyKey(s.track)}</span>
                    <span className="hidden truncate text-xs text-zinc-500 sm:inline">{s.car ? carShortName(s.car) : ""} · {dayLabel(new Date(s.at))}</span>
                    <span className="tabular ml-auto font-semibold text-white">{lapTime(s.best_ms)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3. Team ranking */}
        <section className="card card-red rise min-w-0 p-5" style={delay(140)}>
          <SectionTitle icon={Trophy} action={<Link href="/drivers" className="text-zinc-400 hover:text-white">all drivers</Link>}>
            Team ranking
          </SectionTitle>
          <ol className="space-y-1">
            {ranking.map((d, i) => (
              <li key={d.id}>
                <Link href={`/drivers/${d.id}`} className={`flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5 ${d.id === me.id ? "bg-accent/[0.06] ring-1 ring-accent/20" : ""}`}>
                  <Position n={i + 1} />
                  <Avatar url={d.avatar_url} name={d.display_name} size={28} />
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-white"><span className="truncate">{d.display_name}</span><RankIcon rating={d.rating} size={14} /></span>
                  <span className="hidden md:inline"><RankBadge rating={d.rating} /></span>
                  {d.sessions < PROVISIONAL_SESSIONS && <span className="hidden text-[11px] text-zinc-500 sm:inline">provisional</span>}
                  <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white/5 sm:block">
                    <div className="fill h-full rounded-full bg-gradient-to-r from-race to-accent" style={{ width: `${d.rating}%`, ...delay(200 + i * 50) }} />
                  </div>
                  <span className="tabular w-10 text-right text-sm font-semibold text-accent">{d.rating.toFixed(1)}</span>
                </Link>
              </li>
            ))}
            {!ranking.length && <li className="text-sm text-zinc-500">No rated driver yet.</li>}
          </ol>
        </section>

        {/* 4. Team activity */}
        <section className="card card-red rise min-w-0 p-5" style={delay(190)}>
          <SectionTitle icon={Activity} action={<Link href="/sessions" className="text-zinc-400 hover:text-white">all sessions</Link>}>
            Team activity
          </SectionTitle>
          <SessionList rows={team} />
        </section>
      </div>
    </div>
  );
}

/** Sessions of the last n days (server render: the time of the request). */
function lastDays(rows: SessionRow[], n: number) {
  const since = Date.now() - n * 86_400_000;
  return rows.filter((s) => new Date(s.at).getTime() > since);
}

const signed = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-2 py-2.5">
      <div className="tabular text-xl font-bold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">{label}</div>
    </div>
  );
}

/** The rating after each session: a line with its area, the last point marked. */
function RatingLine({ points, labels }: { points: number[]; labels: string[] }) {
  if (points.length < 2)
    return <p className="rounded-lg bg-white/[0.03] px-3 py-8 text-center text-sm text-zinc-500">Your rating curve appears after two rated sessions.</p>;
  const shown = points.slice(-20), names = labels.slice(-20);
  const lo = Math.max(0, Math.floor(Math.min(...shown) - 5)), hi = Math.min(100, Math.ceil(Math.max(...shown) + 5));
  const x = (i: number) => 4 + (i * 292) / (shown.length - 1), y = (v: number) => 92 - ((v - lo) / (hi - lo || 1)) * 84;
  const line = shown.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <div>
      <svg viewBox="0 0 300 100" className="h-28 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="rating-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd200" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#e10600" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line}L${x(shown.length - 1)},100L${x(0)},100Z`} fill="url(#rating-area)" />
        <path d={line} fill="none" stroke="#ffd200" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <circle cx={x(shown.length - 1)} cy={y(shown.at(-1)!)} r={3} fill="#e10600" stroke="#ffd200" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
        <span>{names[0]}</span><span>{lo}–{hi}</span><span>{names.at(-1)}</span>
      </div>
    </div>
  );
}

function Trend({ value }: { value: number }) {
  if (Math.abs(value) < 0.05) return <span>no change last session</span>;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 ${up ? "text-emerald-400" : "text-red-400"}`}>
      <Icon size={13} /> {signed(value)} last session
    </span>
  );
}

function SessionList({ rows }: { rows: SessionRow[] }) {
  if (!rows.length) return <p className="text-sm text-zinc-500">Nothing yet.</p>;
  return (
    <ul className="divide-y divide-white/5">
      {rows.map((s) => (
        <li key={s.id}>
          <Link href={`/sessions/${s.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-white/5">
            <Avatar url={s.avatar_url} name={s.driver} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm text-white">
                <span className="truncate">{s.driver} <span className="text-zinc-500">at</span> {prettyKey(s.track)}</span>
                {s.position === 1 ? <Chip tone="yellow" icon={Crown}>Team best</Chip> : s.position != null && <Chip tone="green" icon={Medal}>PB</Chip>}
              </div>
              <div className="mt-0.5 truncate text-xs text-zinc-500">
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
