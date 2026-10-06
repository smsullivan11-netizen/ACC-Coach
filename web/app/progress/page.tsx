import { TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ratingHistory } from "@/lib/ratings";
import ProgressView, { type TrackSession } from "./ProgressView";

export const metadata: Metadata = { title: "Your progression" };

// The signed-in driver's progression (opened from the Dashboard's "Your progression"): the rating
// after each session with the rank bands, the four sub-ratings of the current form, and per track
// and class each session's best lap with the PB line and the team best.
export default async function ProgressPage() {
  const me = await requireDriver();
  const [history, sessions, team] = await Promise.all([
    ratingHistory(sql, me.id),
    sql<TrackSession[]>`
      select s.id, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon YY') as date, t.key as track, c.class as car_class,
             min(coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)) filter (where l.comparable) as best_ms
      from session s join track t on t.id = s.track_id left join car c on c.id = s.car_id join lap l on l.session_id = s.id
      where s.driver_id = ${me.id}
      group by s.id, t.key, c.class
      having min(coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)) filter (where l.comparable) is not null
      order by coalesce(s.recorded_at, s.uploaded_at), s.id`,
    sql<{ track: string; car_class: string | null; ms: number }[]>`
      select t.key as track, b.car_class, min(b.lap_time_ms) as ms from best_lap b join track t on t.id = b.track_id group by 1, 2`,
  ]);
  const dates = await sql<{ id: string; date: string }[]>`
    select r.id, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon YY') as date
    from driver_rating r join session s on s.id = r.session_id where r.driver_id = ${me.id}`;
  const dateOf = new Map(dates.map((d) => [String(d.id), d.date]));

  return (
    <div>
      <PageTitle icon={TrendingUp} sub="Your rating, its four parts and your lap times, session by session.">
        Your progression
      </PageTitle>
      <ProgressView
        history={history.map((h) => ({ ...h, date: dateOf.get(h.id) ?? "" }))}
        sessions={sessions.map((s) => ({ ...s, id: String(s.id) }))}
        teamBest={team.map((t) => ({ key: `${t.track}|${t.car_class ?? ""}`, ms: t.ms }))}
      />
    </div>
  );
}
