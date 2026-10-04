import { ChevronRight, Crown, Target, Trophy, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, delay, PageTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { carShortName, lapTime, prettyKey } from "@/lib/format";
import CREDITS from "@/lib/track-photo-credits.json";
import { trackOutlines, TRACKS } from "@/lib/tracks";

export const metadata: Metadata = { title: "Leaderboards" };

type Best = { track: string; car_class: string | null; driver_id: string; driver: string; avatar_url: string | null;
              car: string | null; lap_time_ms: number; drivers: number; laps: number };

const PHOTOS = new Set((process.env.TRACK_PHOTOS ?? "").split(",").filter(Boolean));

// The tracks the team has driven as cards (most recent first): photo or outline, the team's best
// lap per class and the targets. The other ACC tracks below, compact, with their targets.
export default async function TracksPage() {
  await requireDriver();
  const [best, recent, targets, outlines] = await Promise.all([
    sql<Best[]>`
      select t.key as track, r.car_class, d.id as driver_id, d.display_name as driver, d.avatar_url, c.key as car, r.lap_time_ms,
             (select count(*) from lap_ranking x where x.track_id = r.track_id and x.car_class is not distinct from r.car_class)::int as drivers,
             (select count(*) from lap l join session s on s.id = l.session_id left join car cc on cc.id = s.car_id
              where s.track_id = r.track_id and l.comparable and cc.class is not distinct from r.car_class)::int as laps
      from lap_ranking r join track t on t.id = r.track_id join driver d on d.id = r.driver_id left join car c on c.id = r.car_id
      where r.position = 1 order by r.lap_time_ms`,
    sql<{ key: string; last: Date }[]>`
      select t.key, max(coalesce(s.recorded_at, s.uploaded_at)) as last from session s join track t on t.id = s.track_id group by t.key`,
    sql<{ track: string; car: string; target_ms: number }[]>`select track_key as track, car_key as car, target_ms from car_target`,
    trackOutlines(),
  ]);
  const last = new Map(recent.map((r) => [r.key, new Date(r.last).getTime()]));
  const keys = [...new Set([...Object.keys(TRACKS), ...recent.map((r) => r.key)])]
    .sort((a, b) => (last.get(b) ?? 0) - (last.get(a) ?? 0) || (TRACKS[a]?.name ?? a).localeCompare(TRACKS[b]?.name ?? b));

  return (
    <div>
      <PageTitle icon={Trophy} sub="The team's fastest lap on every track, per class, and the target lap times. Open a track for its full leaderboard.">
        Leaderboards
      </PageTitle>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {keys.filter((k) => last.has(k)).map((key, i) => {
          const info = TRACKS[key] ?? { name: prettyKey(key), country: "" };
          // One team best per class (the first to set it when two drivers share the time)
          const rows = best.filter((b, j) => b.track === key && best.findIndex((o) => o.track === key && o.car_class === b.car_class) === j);
          const goals = targets.filter((t) => t.track === key);
          const driven = last.has(key);
          const body = (
            <>
              <TrackImage trackKey={key} outline={outlines[key]} />
              <div className="relative -mt-5 px-4">
                <span className="inline-flex max-w-full items-center gap-2 rounded-md bg-accent px-2.5 py-1 text-sm font-semibold text-ink shadow-lg shadow-black/40">
                  {info.country && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/flags/${info.country}.svg`} alt="" width={20} height={14} className="h-3.5 w-5 rounded-[2px] object-cover" />
                  )}
                  <span className="truncate">{info.name}</span>
                </span>
              </div>
              <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
                {rows.length ? rows.map((b) => (
                  <div key={b.car_class ?? "other"} className="mt-1">
                    <div className="display text-lg text-white">{b.car_class ?? "Other"}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
                      <Crown size={12} className="text-race" /> Team best
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <Avatar url={b.avatar_url} name={b.driver} size={30} />
                      <div className="min-w-0">
                        <div className="tabular text-xl font-bold text-white">{lapTime(b.lap_time_ms)}</div>
                        <div className="truncate text-xs text-zinc-400">{b.driver} · {b.car ? carShortName(b.car) : "–"}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
                      <Users size={12} /> {b.drivers} driver{b.drivers === 1 ? "" : "s"} · {b.laps} valid lap{b.laps === 1 ? "" : "s"}
                    </div>
                  </div>
                )) : (
                  <p className="mt-1 text-sm text-zinc-500">{driven ? "No valid lap yet." : "Not driven by the team yet."}</p>
                )}
                {goals.length > 0 && (
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/5 pt-3 text-xs text-zinc-400">
                    <Target size={13} className="text-race" />
                    {goals.map((g) => (
                      <span key={g.car}>{carShortName(g.car)} <span className="tabular text-zinc-200">{lapTime(g.target_ms)}</span></span>
                    ))}
                  </div>
                )}
                {driven && (
                  <span className="mt-3 inline-flex items-center gap-1 self-end text-xs text-zinc-500 transition group-hover:text-accent">
                    Leaderboard <ChevronRight size={14} />
                  </span>
                )}
              </div>
            </>
          );
          return driven ? (
            <Link key={key} href={`/tracks/${key}`} className="card card-hover rise group flex min-w-0 flex-col overflow-hidden" style={delay(Math.min(i, 9) * 40)}>
              {body}
            </Link>
          ) : (
            <div key={key} className="card rise flex min-w-0 flex-col overflow-hidden opacity-55" style={delay(Math.min(i, 9) * 40)}>
              {body}
            </div>
          );
        })}
      </div>
      {keys.some((k) => !last.has(k)) && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Not driven by the team yet</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {keys.filter((k) => !last.has(k)).map((key) => {
              const info = TRACKS[key] ?? { name: prettyKey(key), country: "" };
              const goals = targets.filter((t) => t.track === key);
              return (
                <div key={key} className="card flex min-w-0 items-center gap-3 overflow-hidden p-0 pr-3">
                  {PHOTOS.has(key) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/tracks/${key}.jpg`} alt="" loading="lazy" className="h-14 w-24 shrink-0 object-cover opacity-80" />
                  ) : <div className="h-14 w-24 shrink-0 bg-white/5" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate text-sm text-zinc-200">
                      {info.country && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/flags/${info.country}.svg`} alt="" width={18} height={12} className="h-3 w-[18px] shrink-0 rounded-[2px] object-cover" />
                      )}
                      <span className="truncate">{info.name}</span>
                    </div>
                    <div className="tabular truncate text-[11px] text-zinc-500">
                      {goals.length ? goals.map((g) => `${carShortName(g.car)} ${lapTime(g.target_ms)}`).join(" · ") : "no target"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** The track's photo (credit in the corner; all credits on /credits), or for a track without one,
 *  its outline on a dark background. */
function TrackImage({ trackKey, outline }: { trackKey: string; outline?: string }) {
  const credit = (CREDITS as Record<string, { author: string; license: string }>)[trackKey];
  if (PHOTOS.has(trackKey))
    return (
      <div className="relative aspect-[2/1] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/tracks/${trackKey}.jpg`} alt="" loading="lazy"
             className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="stripe absolute inset-x-0 bottom-0 h-[2px]" />
        {credit && <span className="absolute bottom-1.5 right-2 text-[9px] text-white/50">Photo: {credit.author} · {credit.license}</span>}
      </div>
    );
  return (
    <div className="relative aspect-[2/1] w-full overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#26262b_0%,#0d0d10_70%)]">
      <div className="stripe absolute inset-x-0 bottom-0 h-[2px] opacity-70" />
      {outline ? (
        <svg viewBox="0 0 100 60" className="absolute inset-0 h-full w-full p-3">
          <path d={outline} fill="none" stroke="#ffd200" strokeWidth={1.1} strokeLinejoin="round" />
        </svg>
      ) : (
        <Trophy size={40} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/10" />
      )}
    </div>
  );
}
