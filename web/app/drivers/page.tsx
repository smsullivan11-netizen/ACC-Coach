import { Swords, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle, RankScale } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { allTimeBest, formParts, PROVISIONAL_SESSIONS } from "@/lib/ratings";
import DriversTable, { type DriverRow } from "./DriversTable";

type Row = { id: string; display_name: string; avatar_url: string | null; rating: number | null; change: number | null; sessions: number; km: number };

export const metadata: Metadata = { title: "Drivers" };

export default async function DriversPage() {
  const me = await requireDriver();
  const rows = await sql<Row[]>`
    with r as (select driver_id, rating, row_number() over (partition by driver_id order by id desc) as n,
                      count(*) over (partition by driver_id) as sessions
               from driver_rating)
    select d.id, d.display_name, d.avatar_url, cur.rating, cur.rating - prev.rating as change,
           coalesce(cur.sessions, 0)::int as sessions,
           coalesce((select sum(l.distance_m) from lap l join session s on s.id = l.session_id where s.driver_id = d.id), 0)::float8 / 1000 as km
    from driver d
    left join r cur on cur.driver_id = d.id and cur.n = 1
    left join r prev on prev.driver_id = d.id and prev.n = 2
    order by cur.rating desc nulls last, d.display_name`;
  const best = await allTimeBest(sql);
  const parts = await Promise.all(rows.map((r) => (r.rating != null ? formParts(sql, r.id) : null)));
  const table: DriverRow[] = rows.map((r, i) => ({
    id: r.id, name: r.display_name, avatar: r.avatar_url, rating: r.rating, best: best.get(r.id) ?? null, change: r.change,
    sessions: r.sessions, provisional: r.rating != null && r.sessions < PROVISIONAL_SESSIONS, km: r.km,
    pace: parts[i]?.pace ?? null, consistency: parts[i]?.consistency ?? null, clean: parts[i]?.clean ?? null, smoothness: parts[i]?.smoothness ?? null,
  }));

  return (
    <div className="bleed bleed-lg">
      <PageTitle icon={Users} sub="Rating: current form / all-time best, out of 100.">
        Drivers
      </PageTitle>
      <Link href="/drivers/compare" className="btn btn-ghost -mt-2 mb-5"><Swords size={15} /> Head to head</Link>
      <div className="mb-5"><RankScale /></div>
      <DriversTable rows={table} me={me.id} />
    </div>
  );
}
