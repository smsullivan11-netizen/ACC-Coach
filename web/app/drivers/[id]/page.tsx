import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { lapTime, prettyKey } from "@/lib/format";
import { PROVISIONAL_SESSIONS, WEIGHTS } from "@/lib/ratings";
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
    sql<Parts[]>`select avg(pace) as pace, avg(consistency) as consistency, avg(clean) as clean, avg(smoothness) as smoothness
                 from (select * from driver_rating where driver_id = ${id} order by id desc limit 5) recent`,
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
  // The coach's focus from the latest session with a valid lap
  const [coached] = await sql<{ id: string; track: string; date: string }[]>`
    select s.id, t.key as track, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon YYYY') as date
    from session s join track t on t.id = s.track_id
    where s.driver_id = ${id} and exists (select 1 from lap l where l.session_id = s.id and l.comparable)
    order by coalesce(s.recorded_at, s.uploaded_at) desc limit 1`;
  const coaching = coached ? await coachSession(coached.id) : null;
  const rating = history.at(-1)?.rating ?? null;
  const change = history.length >= 2 ? history.at(-1)!.rating - history.at(-2)!.rating : null;
  const avatar = d.avatar_url?.replace("size=64", "size=256");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-6">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-24 w-24 rounded-full border-2 border-accent" />
        ) : (
          <div className="h-24 w-24 rounded-full border-2 border-accent bg-white/5" />
        )}
        <div>
          <h1 className="text-2xl font-semibold text-white">{d.display_name}</h1>
          <p className="text-sm text-zinc-400">Team member since {d.since}{d.is_admin && " · admin"}</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs uppercase tracking-wide text-zinc-400">Overall Driver Rating</div>
          <div className="text-5xl font-bold text-accent tabular">{rating != null ? rating.toFixed(1) : "–"}</div>
          <div className="text-sm text-zinc-400">
            {rating == null
              ? "no rated session yet"
              : history.length < PROVISIONAL_SESSIONS
                ? `provisional (${history.length}/${PROVISIONAL_SESSIONS} sessions)`
                : change != null && `${change >= 0 ? "+" : ""}${change.toFixed(1)} last session`}
          </div>
        </div>
      </div>

      {coaching && coaching.focus.length > 0 && (
        <section className="mt-8 rounded-lg border border-accent/30 bg-panel p-5">
          <div className="flex flex-wrap items-baseline gap-x-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">Coach&apos;s focus</h2>
            <Link href={`/sessions/${coached.id}`} className="text-xs text-zinc-400 underline hover:text-white">
              from the last session ({prettyKey(coached.track)}, {coached.date})
            </Link>
          </div>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-zinc-200">
            {coaching.focus.map((f) => <li key={f}>{f}</li>)}
          </ol>
        </section>
      )}

      <section className="mt-8 rounded-lg border border-white/10 bg-panel p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">Driving style</h2>
        <p className="mt-2 text-white">{style.summary}</p>
        {style.traits.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {style.traits.map((t) => (
              <span key={t.label} title={t.detail}
                    className={`rounded-full px-3 py-1 text-sm ${t.tone === "strength" ? "bg-accent text-ink" : t.tone === "work" ? "border border-accent/60 text-accent" : "bg-white/10 text-zinc-200"}`}>
                {t.label}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-panel p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">Rating breakdown (last 5 sessions)</h2>
          <div className="mt-4 space-y-3">
            {PARTS.map((p) => {
              const v = parts?.[p.key];
              return (
                <div key={p.key}>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-200">{p.label} <span className="text-zinc-500">· {WEIGHTS[p.key]} % · {p.help}</span></span>
                    <span className="tabular text-white">{v != null ? Math.round(v) : "–"}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-white/10">
                    <div className="h-1.5 rounded bg-accent" style={{ width: `${v ?? 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-lg border border-white/10 bg-panel p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">Rating over time</h2>
          <RatingChart points={history} />
        </section>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="font-medium text-white">Best laps</h2>
          {best.length === 0 && <p className="mt-2 text-sm text-zinc-500">No valid lap yet.</p>}
          <table className="tabular mt-2 w-full text-sm">
            <tbody>
              {best.map((b) => (
                <tr key={`${b.track}-${b.car_class}`} className="border-b border-white/5">
                  <td className="py-2"><Link href={`/tracks/${b.track}`} className="text-white hover:underline">{prettyKey(b.track)}</Link></td>
                  <td className="text-zinc-400">{prettyKey(b.car)}</td>
                  <td className="text-right"><Link href={`/laps/${b.lap_id}`} className="font-medium text-accent hover:underline">{lapTime(b.lap_time_ms)}</Link></td>
                  <td className="text-right text-zinc-400">P{b.position}/{b.drivers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="font-medium text-white">Recent sessions</h2>
          <table className="tabular mt-2 w-full text-sm">
            <tbody>
              {recent.map((s) => (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="py-2"><Link href={`/sessions/${s.id}`} className="text-zinc-300 hover:underline">{s.date}</Link></td>
                  <td>{prettyKey(s.track)}</td>
                  <td className="text-right text-zinc-400">{s.laps} laps</td>
                  <td className="text-right text-white">{lapTime(s.best_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function RatingChart({ points }: { points: Point[] }) {
  if (points.length < 2) return <p className="mt-4 text-sm text-zinc-500">The chart appears after two rated sessions.</p>;
  const w = 600, h = 160, pad = 24;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v: number) => h - pad - (v / 100) * (h - 2 * pad);
  const line = (k: "rating" | "session_score") => points.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full">
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={pad} x2={w - pad} y1={y(v)} y2={y(v)} stroke="#ffffff14" />
          <text x={2} y={y(v) + 4} fontSize="10" fill="#71717a">{v}</text>
        </g>
      ))}
      <polyline points={line("session_score")} fill="none" stroke="#71717a" strokeWidth="1" strokeDasharray="3 3" />
      <polyline points={line("rating")} fill="none" stroke="#ffd200" strokeWidth="2" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.rating)} r="3" fill="#ffd200"><title>{`${p.date}: ${p.rating.toFixed(1)} (session ${p.session_score.toFixed(0)})`}</title></circle>)}
      <text x={w - pad} y={h - 4} fontSize="10" fill="#71717a" textAnchor="end">yellow: rating · dashed: session score</text>
    </svg>
  );
}
