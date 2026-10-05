import { Award, Fingerprint, Flag, Gauge, Shield, Sparkles, Swords, TrendingUp, Trophy } from "lucide-react";
import Achievements, { type EarnedRow } from "@/components/Achievements";
import { ACHIEVEMENTS } from "@/lib/achievements";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, delay, Position, RankBadge, SectionTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { carShortName, lapTime, prettyKey } from "@/lib/format";
import { formParts, PROVISIONAL_SESSIONS } from "@/lib/ratings";
import { drivingStyle } from "@/lib/style";
import { coachSession } from "@/lib/coaching";

type Point = { rating: number; session_score: number; date: string };
type Parts = { pace: number | null; consistency: number | null; clean: number | null; smoothness: number | null };

const PARTS: { key: keyof Parts; label: string; help: string }[] = [
  { key: "pace", label: "Pace", help: "best lap vs the reference lap" },
  { key: "consistency", label: "Consistency", help: "spread of valid laps" },
  { key: "clean", label: "Clean driving", help: "laps not lost to track limits" },
  { key: "smoothness", label: "Smoothness", help: "steering corrections vs the team" },
];

export async function generateMetadata(props: PageProps<"/drivers/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const [d] = /^\d+$/.test(id) ? await sql<{ display_name: string }[]>`select display_name from driver where id = ${id}` : [];
  return { title: d?.display_name ?? "Driver" };
}

export default async function DriverPage(props: PageProps<"/drivers/[id]">) {
  await requireDriver();
  const { id } = await props.params;
  if (!/^\d+$/.test(id)) notFound();
  const [d] = await sql<{ id: string; display_name: string; avatar_url: string | null; since: string; is_admin: boolean }[]>`
    select id, display_name, avatar_url, to_char(created_at, 'Mon YYYY') as since, is_admin from driver where id = ${id}`;
  if (!d) notFound();

  const [history, [parts], best, recent, style] = await Promise.all([
    sql<Point[]>`select rating, session_score, to_char(created_at, 'DD Mon') as date
                 from driver_rating where driver_id = ${id} order by id`,
    formParts(sql, id).then((p): Parts[] => [p]),
    sql<{ track: string; car_class: string | null; car: string | null; lap_id: string; lap_time_ms: number; position: number; drivers: number }[]>`
      select t.key as track, r.car_class, c.key as car, r.lap_id, r.lap_time_ms, r.position::int,
             (select count(*) from lap_ranking x where x.track_id = r.track_id and x.car_class is not distinct from r.car_class)::int as drivers
      from lap_ranking r join track t on t.id = r.track_id left join car c on c.id = r.car_id
      where r.driver_id = ${id} order by t.key`,
    sql<{ id: string; date: string; track: string; laps: number; best_ms: number | null }[]>`
      select s.id, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon YYYY') as date, t.key as track,
             count(l.id)::int as laps,
             min(coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)) filter (where l.comparable) as best_ms
      from session s join track t on t.id = s.track_id left join lap l on l.session_id = s.id
      where s.driver_id = ${id} group by s.id, t.key order by coalesce(s.recorded_at, s.uploaded_at) desc limit 8`,
    drivingStyle(id, d.display_name),
  ]);
  const earned = await sql<EarnedRow[]>`
    select code, scope, detail, to_char(earned_at, 'DD Mon YYYY') as date from achievement where driver_id = ${id} order by earned_at`.catch(() => [] as EarnedRow[]);
  // The coach's focus from the latest session with a valid lap
  const [coached] = await sql<{ id: string; track: string; date: string }[]>`
    select s.id, t.key as track, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon YYYY') as date
    from session s join track t on t.id = s.track_id
    where s.driver_id = ${id} and exists (select 1 from lap l where l.session_id = s.id and l.comparable)
    order by coalesce(s.recorded_at, s.uploaded_at) desc limit 1`;
  const coaching = coached ? await coachSession(coached.id) : null;
  const rating = history.at(-1)?.rating ?? null;
  const allTime = history.length >= PROVISIONAL_SESSIONS ? Math.max(...history.slice(PROVISIONAL_SESSIONS - 1).map((h) => h.rating)) : null;
  const change = history.length >= 2 ? history.at(-1)!.rating - history.at(-2)!.rating : null;
  const avatar = d.avatar_url?.replace("size=64", "size=256");

  return (
    <div>
      {/* Header: picture, name, rating */}
      <div className="card card-red rise relative overflow-hidden p-6">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-race/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-6">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-24 w-24 rounded-2xl ring-2 ring-accent/80" />
          ) : (
            <div className="grid h-24 w-24 place-items-center rounded-2xl bg-raised text-3xl font-bold text-zinc-300 ring-2 ring-accent/80">
              {d.display_name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="display text-3xl text-white">{d.display_name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              Team member since {d.since}
              {d.is_admin && <Chip tone="red" icon={Shield}>admin</Chip>}
            </p>
            <Link href={`/drivers/compare?b=${d.id}`} className="btn btn-ghost mt-3 px-3 py-1.5 text-xs"><Swords size={14} /> Head to head</Link>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs uppercase tracking-wider text-zinc-500">Overall Driver Rating</div>
            <div className="tabular text-6xl font-bold leading-none text-accent">{rating != null ? rating.toFixed(1) : "–"}</div>
            <div className="mt-2 flex justify-end"><RankBadge rating={rating} size="md" /></div>
            <div className="mt-1 text-sm text-zinc-400">
              {rating == null
                ? "no rated session yet"
                : history.length < PROVISIONAL_SESSIONS
                  ? `provisional (${history.length}/${PROVISIONAL_SESSIONS} sessions)`
                  : change != null && (
                    <span className={change >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {change >= 0 ? "+" : ""}{change.toFixed(1)} last session
                    </span>
                  )}
            </div>
            {allTime != null && <div className="mt-0.5 text-sm text-zinc-500">All-time best <span className="tabular font-semibold text-zinc-300">{allTime.toFixed(1)}</span></div>}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {coaching && coaching.focus.length > 0 && (
          <section className="card rise p-5 lg:col-span-2" style={delay(60)}>
            <SectionTitle icon={Sparkles} action={
              <Link href={`/sessions/${coached.id}`} className="text-zinc-400 hover:text-white">
                from the last session ({prettyKey(coached.track)}, {coached.date})
              </Link>}>
              Coach&apos;s focus
            </SectionTitle>
            <ol className="space-y-2">
              {coaching.focus.map((f, i) => (
                <li key={f} className="flex gap-3 text-sm text-zinc-300">
                  <span className="display grid h-6 w-6 shrink-0 place-items-center rounded-md bg-race/15 text-xs text-red-300">{i + 1}</span>
                  <span>{f}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="card rise p-5 lg:col-span-2" style={delay(100)}>
          <SectionTitle icon={Fingerprint}>Driving style</SectionTitle>
          <p className="text-white">{style.summary}</p>
          {style.traits.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {style.traits.map((t) => (
                <span key={t.label} title={t.detail}
                      className={`rounded-full px-3 py-1 text-sm ${t.tone === "strength" ? "bg-accent font-medium text-ink" : t.tone === "work" ? "border border-race/60 text-red-300" : "bg-white/10 text-zinc-200"}`}>
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="card rise p-5 lg:col-span-2" style={delay(120)}>
          <SectionTitle icon={Award} action={<span className="text-zinc-500">{new Set(earned.map((e) => e.code).filter((c) => ACHIEVEMENTS.some((a) => a.code === c))).size} of {ACHIEVEMENTS.length}</span>}>
            Achievements
          </SectionTitle>
          <Achievements earned={earned} />
        </section>

        <section className="card rise p-5" style={delay(140)}>
          <SectionTitle icon={Gauge}>Rating breakdown</SectionTitle>
          <div className="space-y-3.5">
            {PARTS.map((p, i) => {
              const v = parts?.[p.key];
              return (
                <div key={p.key}>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-200">{p.label} <span className="text-zinc-500">· {p.help}</span></span>
                    <span className="tabular font-semibold text-white">{v != null ? Math.round(v) : "–"}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                    {v != null && <div className="fill h-full rounded-full bg-gradient-to-r from-race to-accent" style={{ width: `${v}%`, ...delay(200 + i * 60) }} />}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-zinc-500">Best session on each track in the last 60 days (5+ valid laps), averaged over the tracks. Weights depend on the session type (practice, qualifying, race, mixed running).</p>
        </section>
        <section className="card rise p-5" style={delay(180)}>
          <SectionTitle icon={TrendingUp}>Rating over time</SectionTitle>
          <RatingChart points={history} />
        </section>

        <section className="card rise overflow-hidden" style={delay(220)}>
          <div className="p-5 pb-0"><SectionTitle icon={Trophy}>Best laps</SectionTitle></div>
          {best.length === 0 ? <p className="px-5 pb-5 text-sm text-zinc-500">No valid lap yet.</p> : (
            <table className="data-table">
              <thead><tr><th>Track</th><th>Car</th><th className="text-right">Lap</th><th className="text-right">Team</th></tr></thead>
              <tbody>
                {best.map((b) => (
                  <tr key={`${b.track}-${b.car_class}`}>
                    <td><Link href={`/tracks/${b.track}`} className="text-white hover:underline">{prettyKey(b.track)}</Link></td>
                    <td className="text-zinc-400">{b.car ? carShortName(b.car) : "–"}</td>
                    <td className="text-right"><Link href={`/laps/${b.lap_id}`} className="font-semibold text-accent hover:underline">{lapTime(b.lap_time_ms)}</Link></td>
                    <td className="text-right"><span className="inline-flex items-center gap-1.5 text-zinc-400"><Position n={b.position} /> / {b.drivers}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card rise overflow-hidden" style={delay(260)}>
          <div className="p-5 pb-0"><SectionTitle icon={Flag}>Recent sessions</SectionTitle></div>
          {recent.length === 0 ? <p className="px-5 pb-5 text-sm text-zinc-500">No session yet.</p> : (
            <table className="data-table">
              <thead><tr><th>Date</th><th>Track</th><th className="text-right">Laps</th><th className="text-right">Best</th></tr></thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap"><Link href={`/sessions/${s.id}`} className="text-zinc-300 hover:underline">{s.date}</Link></td>
                    <td className="text-white">{prettyKey(s.track)}</td>
                    <td className="text-right text-zinc-400">{s.laps}</td>
                    <td className="text-right font-semibold text-white">{lapTime(s.best_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function RatingChart({ points }: { points: Point[] }) {
  if (points.length < 2) return <p className="rounded-lg bg-white/[0.03] px-3 py-10 text-center text-sm text-zinc-500">The chart appears after two rated sessions.</p>;
  const w = 600, h = 180, pad = 26;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v: number) => h - pad - (v / 100) * (h - 2 * pad);
  const line = (k: "rating" | "session_score") => points.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <linearGradient id="profile-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd200" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#e10600" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={pad} x2={w - pad} y1={y(v)} y2={y(v)} stroke="#ffffff10" />
          <text x={2} y={y(v) + 4} fontSize="10" fill="#71717a">{v}</text>
        </g>
      ))}
      <polygon points={`${x(0)},${y(0)} ${line("rating")} ${x(points.length - 1)},${y(0)}`} fill="url(#profile-area)" />
      <polyline points={line("session_score")} fill="none" stroke="#e10600" strokeOpacity="0.7" strokeWidth="1.2" strokeDasharray="4 4" />
      <polyline points={line("rating")} fill="none" stroke="#ffd200" strokeWidth="2.2" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.rating)} r="3.2" fill="#0b0b0d" stroke="#ffd200" strokeWidth="1.8"><title>{`${p.date}: ${p.rating.toFixed(1)} (session ${p.session_score.toFixed(0)})`}</title></circle>)}
      <text x={w - pad} y={h - 6} fontSize="10" fill="#71717a" textAnchor="end">yellow: rating · red dashed: session score</text>
    </svg>
  );
}
