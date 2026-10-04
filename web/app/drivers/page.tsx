import Link from "next/link";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PROVISIONAL_SESSIONS } from "@/lib/ratings";

type Row = { id: string; display_name: string; avatar_url: string | null; rating: number | null; change: number | null; sessions: number };

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
      <h1 className="text-xl font-semibold text-white">Drivers</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Overall Driver Rating (0-100): pace against the reference lap, consistency, clean driving and smoothness,
        updated after every session.
      </p>
      <table className="tabular mt-6 w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr className="border-b border-white/10">
            <th className="w-10 py-2 font-normal">#</th>
            <th className="font-normal">Driver</th>
            <th className="w-1/3 font-normal">Rating</th>
            <th className="text-right font-normal">Last session</th>
            <th className="text-right font-normal">Sessions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-b border-white/5 ${r.id === me.id ? "bg-accent/10" : ""}`}>
              <td className="py-2.5 text-zinc-400">{r.rating != null ? ++rank : ""}</td>
              <td>
                <Link href={`/drivers/${r.id}`} className="flex items-center gap-2 text-white hover:underline">
                  {r.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatar_url} alt="" className="h-7 w-7 rounded-full" />
                  ) : (
                    <span className="h-7 w-7 rounded-full bg-white/10" />
                  )}
                  {r.display_name}
                </Link>
              </td>
              <td>
                {r.rating != null ? (
                  <div className="flex items-center gap-3">
                    <span className="w-12 text-lg font-semibold text-accent">{r.rating.toFixed(1)}</span>
                    <div className="h-1.5 flex-1 rounded bg-white/10">
                      <div className="h-1.5 rounded bg-accent" style={{ width: `${r.rating}%` }} />
                    </div>
                    {r.sessions < PROVISIONAL_SESSIONS && <span className="text-xs text-zinc-500">provisional</span>}
                  </div>
                ) : (
                  <span className="text-zinc-500">not rated yet</span>
                )}
              </td>
              <td className={`text-right ${r.change == null || Math.abs(r.change) < 0.05 ? "text-zinc-500" : r.change > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {r.change == null ? "–" : Math.abs(r.change) < 0.05 ? "0.0" : `${r.change > 0 ? "+" : ""}${r.change.toFixed(1)}`}
              </td>
              <td className="text-right text-zinc-400">{r.sessions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
