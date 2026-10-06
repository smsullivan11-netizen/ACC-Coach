import "server-only";
import { sql } from "./db";
import type { EncodedChannel } from "./trace";
import { packChannels } from "./trace-store";

// Import of a session bundle (format acc-coach/session v1, written by bundle.py).
// Port of the reference implementation tests/test_db.py:import_bundle — keep both in step.
// All or nothing: one transaction; refusals throw Rejected.

export class Rejected extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

type Corner = { id: number; name: string | null; start_m: number; apex_m: number; end_m: number };
type CornerResult = Record<string, number | null> & { corner: number };
type BundleLap = {
  number: number;
  lap_time_ms: number;
  official_lap_time_ms: number | null;
  game_lap_time_ms?: number | null;
  game_valid?: boolean | null;
  valid: boolean;
  comparable: boolean;
  excluded_reasons: string[];
  distance_m: number;
  metrics: Record<string, number> | null;
  corners: CornerResult[] | null;
  trace: { step_m: number; length: number; channels: Record<string, unknown> } | null;
};
export type Bundle = {
  format: string;
  version: number;
  simulator: string;
  agent: { name: string; version: string };
  source: { kind: string; file: string; sha256: string };
  session: {
    track: string;
    track_length_m: number;
    car: string | null;
    type?: string | null;
    recorded_at: string;
    driver_name: string | null;
    conditions?: Record<string, unknown> | null;
    official: { session_file: string; server_name: string | null; car_id: number; car_model: number | null } | null;
  };
  corner_map: { track: string; version: number; length_m: number; provisional: boolean; hash: string; corners: Corner[] };
  laps: BundleLap[];
};

/** Ranking class from the ACC car key (rankings are per class). */
export function carClass(key: string): string {
  if (/gt4/.test(key)) return "GT4";
  if (/cup|challenge|huracan_st|m2_cs/.test(key)) return "Cup";
  if (/gt2/.test(key)) return "GT2";
  if (/gt3|amg_gt3|nsx|r8_lms|m4_gt3|m6_gt3|720s|650s|gallardo|g3/.test(key)) return "GT3";
  return "Other";
}

const CORNER_COLUMNS = [
  "time_s", "entry_speed_kmh", "lift_point_m", "braking_point_m", "brake_release_m", "max_brake_pct",
  "min_speed_kmh", "apex_m", "throttle_pickup_m", "full_throttle_m", "coasting_s", "exit_speed_kmh",
] as const;

export async function importBundle(b: Bundle, driverId: string): Promise<{ sessionId: string; laps: number }> {
  if (b?.format !== "acc-coach/session" || b.version !== 1) throw new Rejected("unsupported bundle format", 422);
  const s = b.session;
  const cm = b.corner_map;

  return sql.begin(async (tx) => {
    const [dup] = await tx`select 1 from session where source_sha256 = ${b.source.sha256}`;
    if (dup) throw new Rejected("session already uploaded");

    const [track] = await tx<{ id: string }[]>`
      insert into track (simulator, key, length_m) values (${b.simulator}, ${s.track}, ${s.track_length_m})
      on conflict (simulator, key) do update set key = excluded.key
      returning id`;
    // The stored length comes from the track's first session: a session with valid laps corrects it
    // when it is more than 3 % off (a broken first session must not stick)
    const valid = b.laps.filter((l) => l.comparable).map((l) => l.distance_m).sort((x, y) => x - y);
    if (valid.length) {
      const len = valid[valid.length >> 1];
      await tx`update track set length_m = ${len} where id = ${track.id} and abs(length_m - ${len}) > 0.03 * ${len}`;
    }

    let carId: string | null = null;
    if (s.car) {
      const [car] = await tx<{ id: string }[]>`
        insert into car (simulator, key, class, acc_model_id)
        values (${b.simulator}, ${s.car}, ${carClass(s.car)}, ${s.official?.car_model ?? null})
        on conflict (simulator, key) do update set acc_model_id = coalesce(car.acc_model_id, excluded.acc_model_id)
        returning id`;
      carId = car.id;
    }

    // Corner map: the first non-provisional version becomes the team's reference; afterwards the
    // same version must have the same fingerprint (agents download the site's map).
    let mapId: string | null = null;
    if (!cm.provisional) {
      const [existing] = await tx<{ id: string; hash: string }[]>`
        select id, hash from corner_map where track_id = ${track.id} and version = ${cm.version}`;
      if (existing && existing.hash !== cm.hash)
        throw new Rejected(`corner map v${cm.version} differs from the site's: update the app and process again`);
      if (existing) {
        mapId = existing.id;
      } else {
        const [created] = await tx<{ id: string }[]>`
          insert into corner_map (track_id, version, hash, length_m, definition)
          values (${track.id}, ${cm.version}, ${cm.hash}, ${cm.length_m}, ${tx.json(cm)})
          returning id`;
        mapId = created.id;
        await tx`insert into corner ${tx(
          cm.corners.map((c) => ({ corner_map_id: mapId, number: c.id, name: c.name, start_m: c.start_m, apex_m: c.apex_m, end_m: c.end_m })),
        )}`;
      }
    }

    let serverSessionId: string | null = null;
    if (s.official) {
      const [row] = await tx<{ id: string }[]>`
        select id from server_session where server_name = ${s.official.server_name ?? ""} and file_name = ${s.official.session_file}`;
      serverSessionId = row?.id ?? null;
    }

    const [session] = await tx<{ id: string }[]>`
      insert into session (driver_id, track_id, car_id, server_session_id, source_kind, source_file, source_sha256,
                           recorded_at, session_type, bundle_version, agent_version, acc_driver_name, conditions)
      values (${driverId}, ${track.id}, ${carId}, ${serverSessionId}, ${b.source.kind}, ${b.source.file}, ${b.source.sha256},
              ${s.recorded_at}::timestamp, ${s.type ?? null}, ${b.version}, ${b.agent?.version ?? null}, ${s.driver_name?.trim() || null}, ${s.conditions ? tx.json(s.conditions as never) : null})
      returning id`;

    for (const l of b.laps) {
      let officialLapId: string | null = null;
      if (serverSessionId && l.official_lap_time_ms != null) {
        const [o] = await tx<{ id: string }[]>`
          select id from official_lap where server_session_id = ${serverSessionId}
            and car_number_id = ${s.official!.car_id} and lap_time_ms = ${l.official_lap_time_ms}`;
        officialLapId = o?.id ?? null;
      }
      const [lap] = await tx<{ id: string }[]>`
        insert into lap (session_id, number, lap_time_ms, official_lap_time_ms, official_lap_id, game_lap_time_ms,
                         game_valid, valid, comparable, excluded_reasons, distance_m, metrics, corner_map_id)
        values (${session.id}, ${l.number}, ${l.lap_time_ms}, ${l.official_lap_time_ms}, ${officialLapId},
                ${l.game_lap_time_ms ?? null}, ${l.game_valid ?? null}, ${l.valid}, ${l.comparable},
                ${tx.array(l.excluded_reasons)}, ${l.distance_m}, ${l.metrics ? tx.json(l.metrics) : null},
                ${mapId && l.corners ? mapId : null})
        returning id`;
      if (mapId && l.corners?.length) {
        await tx`insert into corner_result ${tx(
          l.corners.map((c) => ({
            lap_id: lap.id,
            corner_map_id: mapId,
            corner_number: c.corner,
            ...Object.fromEntries(CORNER_COLUMNS.map((k) => [k, c[k] ?? null])),
          })),
        )}`;
      }
      if (l.trace) {
        await tx`insert into lap_trace (lap_id, step_m, length, channels)
                 values (${lap.id}, ${l.trace.step_m}, ${l.trace.length}, ${tx.json(packChannels(l.trace.channels as Record<string, EncodedChannel>) as never)})`;   // stored compressed (lib/trace-store.ts)
      }
    }
    return { sessionId: session.id, laps: b.laps.length };
  }) as Promise<{ sessionId: string; laps: number }>;
}
