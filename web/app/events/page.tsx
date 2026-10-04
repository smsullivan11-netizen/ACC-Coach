import { CalendarDays, Clock, Flag, Plus, Trophy, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import { Avatar, Chip, delay, PageTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { hasPhoto, photoUrl, trackInfo, TRACKS } from "@/lib/tracks";
import EventForm from "./EventForm";
import SignUp from "./SignUp";

export const metadata: Metadata = { title: "Events" };

type Row = {
  id: string; title: string; track_key: string; car_class: string; starts_at: Date; duration_min: number; kind: string; league: string | null;
  upcoming: boolean; me: string | null; yes: { name: string; avatar: string | null }[]; maybe: number; best_position: number | null; cars: number | null;
};

// The team's races: upcoming ones with sign-ups, then past ones with the team's best result.
export default async function EventsPage() {
  const me = await requireDriver();
  const rows = await sql<Row[]>`
    select e.id, e.title, e.track_key, e.car_class, e.starts_at, e.duration_min, e.kind, e.league,
           e.starts_at + make_interval(mins => e.duration_min) > now() as upcoming,
           (select status from event_entry where event_id = e.id and driver_id = ${me.id}) as me,
           coalesce((select jsonb_agg(jsonb_build_object('name', d.display_name, 'avatar', d.avatar_url) order by d.display_name)
                     from event_entry en join driver d on d.id = en.driver_id where en.event_id = e.id and en.status = 'yes'), '[]') as yes,
           (select count(*) from event_entry where event_id = e.id and status = 'maybe')::int as maybe,
           (select min(r.position) from server_result r join server_session ss on ss.id = r.server_session_id
            where ss.event_id = e.id and ss.session_type = 'R' and r.drivers @? '$[*] ? (@.driver_id != null)') as best_position,
           (select count(*) from server_result r join server_session ss on ss.id = r.server_session_id
            where ss.event_id = e.id and ss.session_type = 'R')::int as cars
    from event e order by e.starts_at`;
  const upcoming = rows.filter((r) => r.upcoming);
  const past = rows.filter((r) => !r.upcoming).reverse();
  const tracks = Object.entries(TRACKS).map(([k, t]) => [k, t.name] as [string, string]).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div>
      <PageTitle icon={CalendarDays} sub="The races the team enters: sign up, see who is ready, plan the line-up, then import the results.">
        Events
      </PageTitle>
      {me.is_admin && (
        <details className="card rise mb-6 p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-white"><Plus size={16} className="text-race" /> New event</summary>
          <div className="mt-4"><EventForm tracks={tracks} /></div>
        </details>
      )}

      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Upcoming</h2>
      {upcoming.length === 0 && <p className="card p-6 text-sm text-zinc-400">No event planned yet.{me.is_admin ? " Create one above." : ""}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        {upcoming.map((e, i) => (
          <div key={e.id} className="card card-hover rise group flex min-w-0 flex-col overflow-hidden" style={delay(i * 50)}>
            <Link href={`/events/${e.id}`} className="relative block h-36 w-full overflow-hidden">
              {hasPhoto(e.track_key) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl(e.track_key)} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              <div className="stripe absolute inset-x-0 bottom-0 h-[2px]" />
              <div className="absolute bottom-3 left-4 right-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={e.kind === "endurance" ? "red" : "yellow"}>{e.kind}</Chip>
                  {e.league && <Chip>{e.league}</Chip>}
                </div>
                <div className="display mt-1.5 truncate text-xl text-white">{e.title}</div>
              </div>
            </Link>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-300">
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-race" /><LocalTime iso={new Date(e.starts_at).toISOString()} countdown /></span>
                <span className="inline-flex items-center gap-1.5 text-zinc-400"><Clock size={14} /> {e.duration_min} min</span>
                <span className="inline-flex items-center gap-1.5 text-zinc-400"><Flag size={14} /> {trackInfo(e.track_key)?.name ?? e.track_key} · {e.car_class}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Users size={14} />
                <div className="flex -space-x-2">{e.yes.slice(0, 8).map((d) => <span key={d.name} title={d.name} className="rounded-full ring-2 ring-panel"><Avatar url={d.avatar} name={d.name} size={24} /></span>)}</div>
                <span>{e.yes.length} in{e.maybe ? ` · ${e.maybe} maybe` : ""}</span>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-3">
                <SignUp eventId={e.id} status={e.me} />
                <Link href={`/events/${e.id}`} className="ml-auto text-xs text-zinc-400 hover:text-accent">Details →</Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-xs font-medium uppercase tracking-wider text-zinc-500">Past</h2>
          <div className="card divide-y divide-white/5 overflow-hidden">
            {past.map((e) => (
              <Link key={e.id} href={`/events/${e.id}`} className="flex flex-wrap items-center gap-4 px-4 py-3 hover:bg-white/[0.03]">
                {hasPhoto(e.track_key) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl(e.track_key)} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
                ) : <div className="h-10 w-16 shrink-0 rounded bg-white/5" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{e.title}</div>
                  <div className="text-xs text-zinc-500"><LocalTime iso={new Date(e.starts_at).toISOString()} short /> · {trackInfo(e.track_key)?.name ?? e.track_key}</div>
                </div>
                {e.best_position != null ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-zinc-300"><Trophy size={14} className="text-accent" /> P{e.best_position}<span className="text-zinc-500">/{e.cars}</span></span>
                ) : <span className="text-xs text-zinc-600">no results</span>}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
