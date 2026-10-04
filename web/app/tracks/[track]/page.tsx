import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { gap, lapTime, prettyKey } from "@/lib/format";

type Row = {
  position: number;
  gap_ms: number;
  lap_time_ms: number;
  lap_id: string;
  car_class: string | null;
  driver_id: string;
  driver: string;
  car: string | null;
  session_id: string;
  date: string | null;
  theoretical_ms: number | null;
};

export default async function TrackPage(props: PageProps<"/tracks/[track]">) {
  const me = await requireDriver();
  const { track } = await props.params;
  const [t] = await sql<{ id: string; length_m: number }[]>`select id, length_m from track where key = ${track}`;
  if (!t) notFound();

  // Best valid lap per driver and class; theoretical best = sum of the driver's best corners on the
  // track's latest corner map
  const rows = await sql<Row[]>`
    with map as (select id from corner_map where track_id = ${t.id} order by version desc limit 1)
    select r.position::int, r.gap_ms, r.lap_time_ms, r.lap_id, r.car_class, r.driver_id, d.display_name as driver,
           c.key as car, l.session_id, to_char(r.recorded_at, 'DD Mon YYYY') as date,
           round(tb.theoretical_s * 1000)::int as theoretical_ms
    from lap_ranking r
    join driver d on d.id = r.driver_id
    join lap l on l.id = r.lap_id
    left join car c on c.id = r.car_id
    left join theoretical_best tb on tb.driver_id = r.driver_id and tb.car_class is not distinct from r.car_class
                                  and tb.corner_map_id = (select id from map)
    where r.track_id = ${t.id}
    order by r.car_class nulls last, r.position`;
  const classes = [...new Set(rows.map((r) => r.car_class ?? "Other"))];

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">{prettyKey(track)}</h1>
      <p className="mt-1 text-sm text-zinc-400">{Math.round(t.length_m)} m · best valid lap of each driver</p>
      {rows.length === 0 && <p className="mt-6 text-zinc-400">No valid lap yet.</p>}
      {classes.map((cls) => (
        <section key={cls} className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">{cls}</h2>
          <table className="tabular mt-2 w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr className="border-b border-white/10">
                <th className="w-10 py-2 font-normal">#</th>
                <th className="font-normal">Driver</th>
                <th className="font-normal">Car</th>
                <th className="text-right font-normal">Lap</th>
                <th className="text-right font-normal">Gap</th>
                <th className="text-right font-normal" title="Sum of the driver's best corners">Theoretical</th>
                <th className="pl-6 font-normal">Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => (r.car_class ?? "Other") === cls)
                .map((r, k, list) => (
                  <tr key={r.driver_id} className={`border-b border-white/5 ${r.driver_id === me.id ? "bg-white/5" : ""}`}>
                    <td className="py-2 text-zinc-400">{r.position}</td>
                    <td className="text-white">{r.driver}</td>
                    <td className="text-zinc-300">{prettyKey(r.car)}</td>
                    <td className="text-right font-medium text-white">
                      <Link href={`/laps/${r.lap_id}`} className="hover:underline">{lapTime(r.lap_time_ms)}</Link>
                    </td>
                    <td className="text-right text-zinc-400">{gap(r.gap_ms)}</td>
                    <td className="text-right text-zinc-400">{lapTime(r.theoretical_ms)}</td>
                    <td className="pl-6 text-zinc-500">{r.date}</td>
                    <td className="text-right">
                      {k > 0 && (
                        <Link href={`/laps/${r.lap_id}?vs=${list[0].lap_id}`} className="text-zinc-400 underline hover:text-white">
                          vs leader
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
