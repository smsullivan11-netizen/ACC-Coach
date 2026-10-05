import { ArrowLeft, ChevronRight, Crown, Flag, GitCompareArrows, MapPin, Medal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Conditions from "@/components/Conditions";
import { Avatar, Chip, delay, PageTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { carShortName, lapTime, prettyKey } from "@/lib/format";
import { dayLabel, recentSessions, timeOfDay, type SessionRow } from "@/lib/sessions";

export const metadata: Metadata = { title: "Sessions" };

const TYPE_TONE: Record<string, "yellow" | "red" | "blue" | "grey"> = { race: "red", qualify: "yellow", qualifying: "yellow", practice: "grey", hotlap: "blue" };

// Every session of the team, newest first, grouped by day. With ?track=…&compare=<lap id> (from a
// lap page's "Choose another lap…"): only that track's sessions (any car or class), each opening
// with Compare buttons that bring the chosen lap back to the lap page as the reference.
export default async function SessionsPage(props: PageProps<"/sessions">) {
  await requireDriver();
  const { track, compare } = await props.searchParams;
  const trackKey = typeof track === "string" && /^[\w-]+$/.test(track) ? track : undefined;
  const [picking] = typeof compare === "string" && /^\d+$/.test(compare)
    ? await sql<{ id: string; driver: string; number: number }[]>`
        select l.id, d.display_name as driver, l.number
        from lap l join session s on s.id = l.session_id join driver d on d.id = s.driver_id where l.id = ${compare}`
    : [];
  const sessions = await recentSessions({ trackKey, limit: 200 });
  const days: { label: string; rows: SessionRow[] }[] = [];
  for (const s of sessions) {
    const label = dayLabel(new Date(s.at));
    if (days.at(-1)?.label !== label) days.push({ label, rows: [] });
    days.at(-1)!.rows.push(s);
  }

  return (
    <div>
      {picking && (
        <Link href={`/laps/${picking.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft size={15} /> Back to {picking.driver}&apos;s L{picking.number}
        </Link>
      )}
      <PageTitle icon={picking ? GitCompareArrows : Flag}
                 sub={picking ? `Pick a session, then the lap to compare ${picking.driver}'s L${picking.number} with. Every car and class on this track.`
                   : trackKey ? "Every session of the team on this track, newest first." : "Every session of the team, newest first. Open one for its laps and the coach's summary."}>
        {trackKey ? `Sessions at ${prettyKey(trackKey)}` : "Sessions"}
      </PageTitle>
      {trackKey && !picking && <Link href="/sessions" className="-mt-3 mb-4 inline-block text-sm text-zinc-400 underline hover:text-white">All tracks</Link>}
      {sessions.length === 0 && (
        <p className="card p-6 text-zinc-400">
          No session yet. <Link href="/download" className="text-accent underline">Get the app</Link>: it uploads every session you drive.
        </p>
      )}
      <div className="space-y-6">
        {days.map((day, k) => (
          <section key={day.label} className="rise" style={delay(Math.min(k, 6) * 50)}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">{day.label}</h2>
            <div className="card divide-y divide-white/5 overflow-hidden">
              {day.rows.map((s) => (
                <Link key={s.id} href={picking ? `/sessions/${s.id}?compare=${picking.id}` : `/sessions/${s.id}`}
                      className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-white/[0.03] md:grid-cols-[34px_10rem_minmax(0,1fr)_14rem_5.5rem_7.5rem]">
                  <Avatar url={s.avatar_url} name={s.driver} size={34} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{s.driver}</div>
                    <div className="text-xs text-zinc-500">{timeOfDay(new Date(s.at))}</div>
                  </div>
                  <div className="col-span-3 flex min-w-0 items-center gap-2 text-sm text-zinc-300 md:col-span-1">
                    <MapPin size={14} className="shrink-0 text-zinc-500" />
                    <span className="truncate">{prettyKey(s.track)}</span>
                    <span className="truncate text-zinc-500">· {s.car ? carShortName(s.car) : "–"}</span>
                    <Conditions c={s.conditions} compact />
                  </div>
                  <div className="hidden items-center justify-end gap-1.5 md:flex">
                    {s.session_type && <Chip tone={TYPE_TONE[s.session_type] ?? "grey"}>{s.session_type}</Chip>}
                    {s.position === 1 ? <Chip tone="yellow" icon={Crown}>Team best</Chip> : s.position != null && <Chip tone="green" icon={Medal}>PB</Chip>}
                  </div>
                  <div className="hidden text-right text-xs text-zinc-500 md:block">
                    <span className="text-zinc-300">{s.valid_laps}</span>/{s.laps} valid
                  </div>
                  <div className="row-start-1 flex items-center justify-end gap-2 md:row-auto">
                    <span className={`tabular text-sm font-semibold ${s.best_ms ? "text-accent" : "text-zinc-600"}`}>{lapTime(s.best_ms)}</span>
                    <ChevronRight size={16} className="text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
