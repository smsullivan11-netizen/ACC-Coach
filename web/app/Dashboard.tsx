import { Activity, Crown, Gauge, Medal, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import Link from "next/link";
import BackgroundVideo from "@/components/BackgroundVideo";
import TrendChart from "@/components/TrendChart";
import WelcomeHero from "@/components/WelcomeHero";
import { ratingDomain } from "@/lib/chart";
import { Avatar, Chip, delay, NextRank, PartBar, Position, RankBadge, RankIcon, ScaleNumber, SectionTitle } from "@/components/ui";
import type { Driver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { carShortName, lapTime, prettyKey } from "@/lib/format";
import { pickQuote } from "@/lib/quotes";
import { rankFor } from "@/lib/ranks";
import { formParts, PROVISIONAL_SESSIONS, WEIGHTS } from "@/lib/ratings";
import { recentSessions, timeOfDay, dayLabel, type SessionRow } from "@/lib/sessions";

// Home page of a signed-in driver, four blocks only (the user wants it simple): their rating, their
// progression, the team ranking and the team's activity.
export default async function Dashboard({ me }: { me: Driver }) {
  const [history, [parts], ranking, mine, team] = await Promise.all([
    sql<{ rating: number; date: string; track: string }[]>`
      select r.rating, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon') as date, t.key as track
      from driver_rating r join session s on s.id = r.session_id join track t on t.id = s.track_id
      where r.driver_id = ${me.id} order by r.id`,
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
  const recent = history.slice(-30);   // the preview: the last 30 sessions (all of them on /progress)
  const first = me.display_name.split(/\s+/)[0];

  return (
    // The team video behind the page; the cards turn to frosted glass over it (globals.css .glass)
    <div className="glass">
      <BackgroundVideo src="/media/dashboard-bg.mp4" poster="/media/dashboard-bg.jpg" />
      <WelcomeHero day={dayLabel(new Date())} name={first} quote={pickQuote()} />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1. Rating */}
        <section className="card card-red rise min-w-0 p-5" style={delay(40)}>
          <SectionTitle icon={Gauge} href={`/drivers/${me.id}`}>
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
          <NextRank rating={rating} className="mt-4" />
          <div className="mt-5 space-y-2.5">
            {(Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((k, i) => {
              const v = parts?.[k];
              return (
                <div key={k} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-sm">
                  <span className="capitalize text-zinc-300">{k === "clean" ? "Clean driving" : k}</span>
                  {v != null ? <PartBar v={v} style={delay(150 + i * 60)} /> : <div className="h-1.5 rounded-full bg-white/5" />}
                  <ScaleNumber v={v} className="text-right font-semibold" />
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-500">Your best session on each track in the last 60 days (5+ valid laps), averaged over the tracks.</p>
        </section>

        {/* 2. Progression */}
        <section className="card card-red rise min-w-0 p-5" style={delay(90)}>
          <SectionTitle icon={TrendingUp} href="/progress">Your progression</SectionTitle>
          <TrendChart values={recent.map((h) => h.rating)} labels={recent.map((h) => h.date)} details={recent.map((h) => prettyKey(h.track))}
                      domain={ratingDomain(recent.map((h) => h.rating))} bands height={170} name="Rating" />
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
          <SectionTitle icon={Trophy} href="/drivers">
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
                  <PartBar v={d.rating} className="hidden h-1.5 w-24 sm:block" style={delay(200 + i * 50)} />
                  <span className="tabular w-10 text-right text-sm font-semibold" style={{ color: rankFor(d.rating).color }}>{d.rating.toFixed(1)}</span>
                </Link>
              </li>
            ))}
            {!ranking.length && <li className="text-sm text-zinc-500">No rated driver yet.</li>}
          </ol>
        </section>

        {/* 4. Team activity */}
        <section className="card card-red rise min-w-0 p-5" style={delay(190)}>
          <SectionTitle icon={Activity} href="/sessions">
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
