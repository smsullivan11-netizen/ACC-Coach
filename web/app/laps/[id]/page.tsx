import { ArrowLeft, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { lapTime, prettyKey } from "@/lib/format";
import LapView, { type Candidate } from "./LapView";

export const metadata: Metadata = { title: "Lap analysis" };

export default async function LapPage(props: PageProps<"/laps/[id]">) {
  await requireDriver();
  const { id } = await props.params;
  const { vs, corner } = await props.searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const [lap] = await sql<{ number: number; session_id: string; track_id: string; track: string; driver: string }[]>`
    select l.number, l.session_id, s.track_id, t.key as track, d.display_name as driver
    from lap l join session s on s.id = l.session_id join track t on t.id = s.track_id
    join driver d on d.id = s.driver_id
    where l.id = ${id}`;
  if (!lap) notFound();

  // Laps to compare with: each driver's best on this track, then the other laps of this session
  const rows = await sql<{ id: string; driver: string; number: number; time_ms: number; best: boolean }[]>`
    select l.id, d.display_name as driver, l.number, b.lap_time_ms as time_ms, true as best
    from best_lap b join lap l on l.id = b.lap_id join driver d on d.id = b.driver_id
    where b.track_id = ${lap.track_id} and l.id <> ${id}
    union all
    select l.id, d.display_name, l.number,
           coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms), false
    from lap l join session s on s.id = l.session_id join driver d on d.id = s.driver_id
    where l.session_id = ${lap.session_id} and l.id <> ${id}
      and exists (select 1 from lap_trace tr where tr.lap_id = l.id)
    order by best desc, time_ms`;
  const seen = new Set<string>();
  const candidates: Candidate[] = rows
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .map((r) => ({
      id: r.id,
      label: `${r.driver} · L${r.number} · ${lapTime(r.time_ms)}${r.best ? " (their best)" : " (this session)"}`,
    }));
  const vsId = typeof vs === "string" && /^\d+$/.test(vs) && vs !== id ? vs : null;

  return (
    <div>
      <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
        <Link href={`/sessions/${lap.session_id}`} className="inline-flex items-center gap-1.5 hover:text-white"><ArrowLeft size={15} /> {lap.driver}&apos;s session</Link>
        <Link href={`/tracks/${lap.track}`} className="inline-flex items-center gap-1.5 hover:text-white"><Trophy size={14} className="text-race" /> {prettyKey(lap.track)} leaderboard</Link>
      </p>
      <LapView lapId={id} vsId={vsId} candidates={candidates}
               corner={typeof corner === "string" && /^\d+$/.test(corner) ? Number(corner) : null} />
    </div>
  );
}
