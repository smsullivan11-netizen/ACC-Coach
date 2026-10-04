import "server-only";
import { createHash } from "node:crypto";
import type postgres from "postgres";
import { sql } from "./db";
import { buildFromLines, carryNames, cornerMetrics, mapHashKey, scaledCorners, type CornerMap, type Detail, type Proposal } from "./corners";
import type { EncodedTrace } from "./trace";
import { decodeStored } from "./trace-store";

// Team corner maps on the site. The first upload on a track brings a map built by the app from one
// lap's speed; the site replaces it by a map built from the shape of the racing line of the team's
// best clean laps (automatically once, then whenever an admin rebuilds it). Each new map is a new
// version: the app downloads the latest one before processing a session, and the corner results of
// every lap that still has its trace are recomputed with it.

type Sql = postgres.Sql | postgres.TransactionSql;

export const mapHash = (m: Pick<CornerMap, "track" | "length_m" | "corners">) =>
  createHash("sha256").update(mapHashKey(m)).digest("hex").slice(0, 16);

const MAX_LAPS = 10;          // best clean laps used to average the racing line…
const MAX_PER_DRIVER = 4;     // …from several drivers when possible
const RECOMPUTE_BATCH = 40;   // laps decoded at a time

export type SourceLap = { id: string; driver: string; time_ms: number };

/** A map proposal from the team's best clean laps with car positions (null: no such lap). */
export async function proposeMap(trackId: string, detail: Detail): Promise<{ proposal: Proposal; laps: SourceLap[] } | null> {
  const rows = await sql<(SourceLap & { length: number; channels: EncodedTrace["channels"] })[]>`
    select id, driver, time_ms, length, channels from (
      select l.id, d.display_name as driver, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as time_ms,
             tr.length, tr.channels,
             row_number() over (partition by s.driver_id order by coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)) as n
      from lap l join session s on s.id = l.session_id join driver d on d.id = s.driver_id
      join lap_trace tr on tr.lap_id = l.id
      where s.track_id = ${trackId} and l.comparable and tr.channels ? 'pos_x_m' and tr.channels ? 'pos_z_m') best
    where n <= ${MAX_PER_DRIVER}
    order by time_ms limit ${MAX_LAPS}`;
  if (!rows.length) return null;
  // Same distance grid only (a lap measured on another layout or track length would not line up)
  const lengths = rows.map((r) => r.length).sort((a, b) => a - b);
  const mid = lengths[lengths.length >> 1];
  const laps = rows.filter((r) => Math.abs(r.length - mid) <= mid * 0.01);
  const proposal = buildFromLines(
    laps.map((r) => ({ x: decodeStored(r.channels.pos_x_m), z: decodeStored(r.channels.pos_z_m), speed: decodeStored(r.channels.speed_ms) })),
    detail,
  );
  return { proposal, laps: laps.map(({ id, driver, time_ms }) => ({ id, driver, time_ms })) };
}

/** Recomputes the corner results of laps with a trace (all laps of the track, or one session's)
 *  with the given map. */
export async function recomputeCornerResults(tx: Sql, mapId: string, map: CornerMap, trackId: string, sessionId?: string) {
  const ids = await tx<{ id: string }[]>`
    select l.id from lap l join session s on s.id = l.session_id join lap_trace tr on tr.lap_id = l.id
    where s.track_id = ${trackId} and tr.channels is not null ${sessionId ? tx`and s.id = ${sessionId}` : tx``}
    order by l.id`;
  let count = 0;
  for (let i = 0; i < ids.length; i += RECOMPUTE_BATCH) {
    const batch = ids.slice(i, i + RECOMPUTE_BATCH).map((r) => r.id);
    const traces = await tx<{ lap_id: string; step_m: number; length: number; channels: EncodedTrace["channels"] }[]>`
      select lap_id, step_m, length, channels from lap_trace where lap_id in ${tx(batch)}`;
    const usable = traces.filter(({ channels: ch }) => ch.time_s && ch.speed_ms && ch.throttle_clean_pct && ch.brake_clean_pct);
    if (!usable.length) continue;
    const rows = usable.flatMap(({ lap_id, step_m, length, channels: ch }) =>
      cornerMetrics(
        { time: decodeStored(ch.time_s), speed: decodeStored(ch.speed_ms), throttle: decodeStored(ch.throttle_clean_pct), brake: decodeStored(ch.brake_clean_pct) },
        scaledCorners(map, length * step_m),
      ).map(({ corner, ...r }) => ({ lap_id, corner_map_id: mapId, corner_number: corner, ...r })),
    );
    const done = usable.map((t) => t.lap_id);
    await tx`delete from corner_result where lap_id in ${tx(done)}`;
    if (rows.length) await tx`insert into corner_result ${tx(rows)}`;
    await tx`update lap set corner_map_id = ${mapId} where id in ${tx(done)}`;
    count += done.length;
  }
  return count;
}

/** Publishes a proposal as the track's next map version (names carried over from the previous
 *  version when a corner's apex moved by less than 30 m) and recomputes every lap's corners.
 *  Nothing happens when the corners are the same as the latest version's. */
export async function publishMap(trackId: string, proposal: Proposal, info: { detail: Detail; laps: SourceLap[]; by: string | null }) {
  return sql.begin(async (tx) => {
    const [track] = await tx<{ key: string }[]>`select key from track where id = ${trackId} for update`;
    const [old] = await tx<{ version: number; hash: string; definition: CornerMap | null }[]>`
      select version, hash, definition from corner_map where track_id = ${trackId} order by version desc limit 1`;
    const k = old?.definition ? proposal.length_m / old.definition.length_m : 1;
    const definition: CornerMap = {
      track: track.key,
      length_m: proposal.length_m,
      version: (old?.version ?? 0) + 1,
      source: `racing line of ${info.laps.length} lap${info.laps.length > 1 ? "s" : ""} (${[...new Set(info.laps.map((l) => l.driver))].join(", ")})`,
      method: "geometry",
      detail: info.detail,
      built_by: info.by,
      built_at: new Date().toISOString(),
      corners: carryNames(proposal.corners, old?.definition?.corners, k),
    };
    const hash = mapHash(definition);
    if (old?.hash === hash && old.definition?.method === "geometry")   // same corners: nothing to publish
      return { version: old.version, corners: definition.corners.length, recomputed: 0, unchanged: true };
    const [map] = await tx<{ id: string }[]>`
      insert into corner_map (track_id, version, hash, length_m, source, definition)
      values (${trackId}, ${definition.version}, ${hash}, ${definition.length_m}, ${definition.source}, ${tx.json(definition as never)})
      returning id`;
    if (definition.corners.length)
      await tx`insert into corner ${tx(definition.corners.map((c) => ({
        corner_map_id: map.id, number: c.id, name: c.name, start_m: c.start_m, apex_m: c.apex_m, end_m: c.end_m,
      })))}`;
    const recomputed = await recomputeCornerResults(tx, map.id, definition, trackId);
    return { version: definition.version, corners: definition.corners.length, recomputed, unchanged: false };
  });
}

/** The track's latest map with its id. */
export async function latestMap(db: Sql, trackId: string) {
  const [m] = await db<{ id: string; version: number; definition: CornerMap | null }[]>`
    select id, version, definition from corner_map where track_id = ${trackId} order by version desc limit 1`;
  return m ?? null;
}

/** After an upload: the first time a track has laps with car positions and its map still comes
 *  from the app (one lap's speed), the site builds its own from the racing line. Otherwise, a
 *  session processed with an older map version gets the latest one. Never fails the upload. */
export async function afterUpload(sessionId: string) {
  try {
    const [{ track_id: trackId }] = await sql<{ track_id: string }[]>`select track_id from session where id = ${sessionId}`;
    const latest = await latestMap(sql, trackId);
    if (latest?.definition?.method !== "geometry") {
      const built = await proposeMap(trackId, "normal");
      if (built?.proposal.corners.length) {
        await publishMap(trackId, built.proposal, { detail: "normal", laps: built.laps, by: null });
        return;
      }
    }
    if (latest?.definition) {
      const [stale] = await sql`
        select 1 from lap l where l.session_id = ${sessionId} and l.corner_map_id is distinct from ${latest.id} limit 1`;
      if (stale) await sql.begin((tx) => recomputeCornerResults(tx, latest.id, latest.definition!, trackId, sessionId));
    }
  } catch (e) {
    console.error("corner map update after upload failed", e);
  }
}

/** Renames corners of the track's latest map (names are not part of the fingerprint). */
export async function renameCorners(trackId: string, names: Record<string, string | null>) {
  return sql.begin(async (tx) => {
    const m = await latestMap(tx, trackId);
    if (!m?.definition) return false;
    const clean = (s: string | null | undefined) => (s ?? "").trim().slice(0, 40) || null;
    const corners = m.definition.corners.map((c) => (String(c.id) in names ? { ...c, name: clean(names[String(c.id)]) } : c));
    await tx`update corner_map set definition = ${tx.json({ ...m.definition, corners } as never)} where id = ${m.id}`;
    for (const c of corners) await tx`update corner set name = ${c.name} where corner_map_id = ${m.id} and number = ${c.id}`;
    return true;
  });
}
