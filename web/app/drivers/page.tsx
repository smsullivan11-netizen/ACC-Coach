import { TrendingDown, TrendingUp, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, Chip, delay, PageTitle, Position } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PROVISIONAL_SESSIONS } from "@/lib/ratings";

type Row = { id: string; display_name: string; avatar_url: string | null; rating: number | null; change: number | null; sessions: number };

export const metadata: Metadata = { title: "Drivers" };

export default async function DriversPage() {
  const me = await requireDriver();
  const rows = await sql<Row[]>`
    with r as (select driver_id, rating, row_number() over (partition by driver_id order by id desc) as n,
                      count(*) over (partition by driver_id) as sessions
               from driver_rating)
    select d.id, d.display_name, d.avatar_url, cur.rating, cur.rating - prev.rating as change,
           coalesce(cur.sessions, 0)::int as sessions
    from driver d
    left join r cur on cur.driver_id = d.id and cur.n = 1
    left join r prev on prev.driver_id = d.id and prev.n = 2
    order by cur.rating desc nulls last, d.display_name`;
  let rank = 0;

  return (
    <div>
      <PageTitle icon={Users} sub="Overall Driver Rating (0-100): pace against the reference lap, consistency, clean driving and smoothness, updated after every session.">
        Drivers
      </PageTitle>
      <div className="card card-red rise overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-12">#</th>
              <th>Driver</th>
              <th className="w-1/3">Rating</th>
              <th className="text-right">Last session</th>
              <th className="text-right">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const n = r.rating != null ? ++rank : null;
              return (
                <tr key={r.id} className={r.id === me.id ? "bg-accent/[0.06]" : ""}>
                  <td>{n != null ? <Position n={n} /> : null}</td>
                  <td>
                    <Link href={`/drivers/${r.id}`} className="flex items-center gap-3 text-white hover:underline">
                      <Avatar url={r.avatar_url} name={r.display_name} size={32} />
                      <span className="font-medium">{r.display_name}</span>
                    </Link>
                  </td>
                  <td>
                    {r.rating != null ? (
                      <div className="flex items-center gap-3">
                        <span className="tabular w-12 text-lg font-bold text-accent">{r.rating.toFixed(1)}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                          <div className="fill h-full rounded-full bg-gradient-to-r from-race to-accent" style={{ width: `${r.rating}%`, ...delay(150 + i * 50) }} />
                        </div>
                        {r.sessions < PROVISIONAL_SESSIONS && <Chip>provisional</Chip>}
                      </div>
                    ) : (
                      <span className="text-zinc-500">not rated yet</span>
                    )}
                  </td>
                  <td className="text-right">
                    {r.change == null ? <span className="text-zinc-600">–</span>
                      : Math.abs(r.change) < 0.05 ? <span className="text-zinc-500">0.0</span>
                      : (
                        <span className={`inline-flex items-center gap-1 ${r.change > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {r.change > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {r.change > 0 ? "+" : ""}{r.change.toFixed(1)}
                        </span>
                      )}
                  </td>
                  <td className="text-right text-zinc-400">{r.sessions}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
