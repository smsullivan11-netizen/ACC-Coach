import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDriver } from "@/lib/auth";
import { latestMap } from "@/lib/corner-maps";
import { sql } from "@/lib/db";
import { prettyKey } from "@/lib/format";
import { decodeChannel, type EncodedChannel } from "@/lib/trace";
import CornerMapEditor from "./CornerMapEditor";

const MAX_POINTS = 2500;

export default async function CornersPage(props: PageProps<"/tracks/[track]/corners">) {
  const me = await requireDriver();
  const { track } = await props.params;
  const [t] = await sql<{ id: string }[]>`select id from track where key = ${track}`;
  if (!t) notFound();
  const map = await latestMap(sql, t.id);

  // Track outline: the best lap with car positions
  const [lap] = await sql<{ x: EncodedChannel; z: EncodedChannel }[]>`
    select tr.channels->'pos_x_m' as x, tr.channels->'pos_z_m' as z
    from lap l join session s on s.id = l.session_id join lap_trace tr on tr.lap_id = l.id
    where s.track_id = ${t.id} and tr.channels ? 'pos_x_m' and tr.channels ? 'pos_z_m'
    order by l.comparable desc, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) limit 1`;
  let line: { x: number[]; z: number[] } | null = null;
  if (lap) {
    const x = decodeChannel(lap.x), z = decodeChannel(lap.z);
    const k = Math.ceil(x.length / MAX_POINTS);
    line = { x: [], z: [] };
    for (let i = 0; i < x.length; i += k) { line.x.push(Math.round(x[i] * 10) / 10); line.z.push(Math.round(z[i] * 10) / 10); }
  }

  const d = map?.definition;
  const date = d?.built_at ? new Date(String(d.built_at)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null;
  const info = !d
    ? null
    : d.method === "geometry"
      ? `Version ${map.version} · ${d.source}${d.built_by ? ` · rebuilt by ${d.built_by}` : " · built automatically"}${date ? ` · ${date}` : ""}`
      : `Version ${map.version} · from one lap's speed (made by the app at the first upload)`;

  return (
    <div>
      <Link href={`/tracks/${track}`} className="text-sm text-zinc-400 hover:text-white">← {prettyKey(track)} leaderboard</Link>
      <h1 className="mt-2 text-xl font-semibold text-white">{prettyKey(track)} · corners</h1>
      <p className="mt-1 max-w-3xl text-sm text-zinc-400">
        Corners come from the shape of the racing line, averaged over the team&apos;s best clean laps. Each corner runs from
        the fastest point before it to the fastest point after it, so corner times add up to the lap time. Every lap of the
        track is compared on the same corners.
      </p>
      {map && d ? (
        <CornerMapEditor
          track={track}
          isAdmin={me.is_admin}
          info={info!}
          map={{ version: map.version, length_m: d.length_m, corners: d.corners }}
          line={line}
        />
      ) : (
        <p className="mt-6 text-zinc-400">No corner map yet: it is made with the first session uploaded on this track.</p>
      )}
    </div>
  );
}
