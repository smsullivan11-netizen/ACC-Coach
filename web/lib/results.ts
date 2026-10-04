import "server-only";
import { sql } from "./db";

// Server results: the .json an ACC server (or LFM) writes per session ("261003_215956_R.json",
// UTF-16 or UTF-8). Stored in server_session (raw kept), server_result (one row per car) and
// official_lap (every lap). Team drivers are recognised by Steam ID (playerId), then by the in-game
// name their own sessions carry; a match by name remembers the Steam ID for next time.

type RDriver = { firstName?: string; lastName?: string; shortName?: string; playerId?: string };
type RLine = {
  car: { carId: number; carModel?: number; carGroup?: string; raceNumber?: number; teamName?: string; drivers: RDriver[] };
  timing: { bestLap?: number; lapCount?: number; totalTime?: number };
};
type RLap = { carId: number; driverIndex: number; laptime: number; isValidForBest?: boolean; splits?: number[] };
type Results = {
  sessionType?: string; trackName?: string; serverName?: string; Date?: string; SessionFile?: string;
  sessionResult?: { leaderBoardLines?: RLine[] };
  laps?: RLap[];
};

const NO_TIME = 2147483647;   // ACC's "no time"
const name = (d: RDriver) => `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim();

/** The file's text: ACC servers write UTF-16 LE with a byte order mark. */
export function readResultsFile(buf: Buffer): Results {
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.subarray(2).toString("utf16le")
    : buf[0] === 0xfe && buf[1] === 0xff ? Buffer.from(buf.subarray(2)).swap16().toString("utf16le")
    : buf.toString("utf8").replace(/^﻿/, "");
  const r = JSON.parse(text) as Results;
  if (!r.sessionResult?.leaderBoardLines || !Array.isArray(r.laps)) throw new Error("not an ACC results file (sessionResult / laps missing)");
  return r;
}

/** Team drivers by Steam ID and by in-game name (from their sessions). */
async function driverIndex() {
  const rows = await sql<{ id: string; steam_id: string | null; display_name: string; names: string[] | null }[]>`
    select d.id, d.steam_id, d.display_name,
           array_remove(array_agg(distinct lower(s.acc_driver_name)), null) as names
    from driver d left join session s on s.driver_id = d.id group by d.id`;
  const bySteam = new Map<string, string>(), byName = new Map<string, string>();
  for (const r of rows) {
    if (r.steam_id) bySteam.set(r.steam_id, r.id);
    for (const n of r.names ?? []) byName.set(n, r.id);
  }
  return { bySteam, byName };
}

export async function importResults(buf: Buffer, opts: { eventId: string | null; by: string }) {
  const r = readResultsFile(buf);
  const trackKey = (r.trackName ?? "").toLowerCase();
  if (!trackKey) throw new Error("no track in the file");
  const lines = r.sessionResult!.leaderBoardLines!;
  const { bySteam, byName } = await driverIndex();
  const learned: { driver: string; steam: string }[] = [];
  const match = (d: RDriver) => {
    const steam = d.playerId?.trim() || null;
    let id = steam ? bySteam.get(steam) : undefined;
    if (!id) {
      id = byName.get(name(d).toLowerCase());
      if (id && steam && !bySteam.has(steam)) { learned.push({ driver: id, steam }); bySteam.set(steam, id); }
    }
    return id ?? null;
  };

  return sql.begin(async (tx) => {
    const [track] = await tx<{ id: string }[]>`
      insert into track (simulator, key, length_m) values ('acc', ${trackKey}, 0)
      on conflict (simulator, key) do update set key = excluded.key returning id`;
    const file = r.SessionFile ?? `upload-${Date.now()}`;
    const [dup] = await tx`select 1 from server_session where server_name = ${r.serverName ?? ""} and file_name = ${file}`;
    if (dup) throw new Error("these results are already imported");
    const [ss] = await tx<{ id: string }[]>`
      insert into server_session (track_id, server_name, file_name, session_type, ended_at, raw, event_id, uploaded_by)
      values (${track.id}, ${r.serverName ?? ""}, ${file}, ${r.sessionType ?? null}, ${r.Date ? new Date(r.Date) : null},
              ${tx.json(r as never)}, ${opts.eventId}, ${opts.by})
      returning id`;
    let teamCars = 0;
    const rows = lines.map((l, i) => {
      const drivers = l.car.drivers.map((d) => ({ name: name(d), short: d.shortName ?? null, steam_id: d.playerId ?? null, driver_id: match(d) }));
      if (drivers.some((d) => d.driver_id)) teamCars++;
      return {
        server_session_id: ss.id, position: i + 1, car_number_id: l.car.carId, race_number: l.car.raceNumber ?? null,
        car_model: l.car.carModel ?? null, car_group: l.car.carGroup ?? null, team_name: l.car.teamName || null,
        drivers: tx.json(drivers as never), laps: l.timing.lapCount ?? 0,
        best_lap_ms: l.timing.bestLap && l.timing.bestLap !== NO_TIME ? l.timing.bestLap : null,
        total_time_ms: l.timing.totalTime && l.timing.totalTime !== NO_TIME ? l.timing.totalTime : null,
      };
    });
    if (rows.length) await tx`insert into server_result ${tx(rows)}`;

    // Every lap, with the driver who drove it
    const cars = new Map(lines.map((l) => [l.car.carId, l.car.drivers]));
    const count = new Map<number, number>();
    const laps = r.laps!.map((x) => {
      const n = (count.get(x.carId) ?? 0) + 1;
      count.set(x.carId, n);
      const d = cars.get(x.carId)?.[x.driverIndex];
      return { server_session_id: ss.id, car_number_id: x.carId, lap_index: n, steam_id: d?.playerId ?? null,
               driver_id: d ? match(d) : null, lap_time_ms: x.laptime, valid: x.isValidForBest !== false, splits_ms: x.splits ?? null };
    });
    for (let i = 0; i < laps.length; i += 500) await tx`insert into official_lap ${tx(laps.slice(i, i + 500))}`;
    for (const l of learned) await tx`update driver set steam_id = ${l.steam} where id = ${l.driver} and steam_id is null`;
    return { id: ss.id, cars: rows.length, laps: laps.length, teamCars };
  });
}

/** Admin: link a result entry (by Steam ID) to a team driver, in every imported result. */
export async function linkSteamId(steamId: string, driverId: string) {
  await sql.begin(async (tx) => {
    await tx`update driver set steam_id = null where steam_id = ${steamId}`;
    await tx`update driver set steam_id = ${steamId} where id = ${driverId}`;
    await tx`update official_lap set driver_id = ${driverId} where steam_id = ${steamId}`;
    await tx`
      update server_result set drivers = (
        select jsonb_agg(case when d->>'steam_id' = ${steamId} then jsonb_set(d, '{driver_id}', to_jsonb(${driverId}::text)) else d end)
        from jsonb_array_elements(drivers) d)
      where drivers @> ${tx.json([{ steam_id: steamId }] as never)}`;
  });
}

// ACC car model ids (results files) → names, for the classification
export const CAR_MODELS: Record<number, string> = {
  0: "Porsche 991 GT3 R", 1: "Mercedes-AMG GT3", 2: "Ferrari 488 GT3", 3: "Audi R8 LMS", 4: "Lamborghini Huracán GT3",
  5: "McLaren 650S GT3", 6: "Nissan GT-R GT3 2018", 7: "BMW M6 GT3", 8: "Bentley Continental GT3 2018", 9: "Porsche 991 II GT3 Cup",
  10: "Nissan GT-R GT3 2017", 11: "Bentley Continental GT3 2016", 12: "Aston Martin V12 Vantage GT3", 13: "Lamborghini Gallardo R-EX",
  14: "Jaguar G3", 15: "Lexus RC F GT3", 16: "Lamborghini Huracán GT3 Evo", 17: "Honda NSX GT3", 18: "Lamborghini Huracán ST",
  19: "Audi R8 LMS Evo", 20: "Aston Martin V8 Vantage GT3", 21: "Honda NSX GT3 Evo", 22: "McLaren 720S GT3", 23: "Porsche 991 II GT3 R",
  24: "Ferrari 488 GT3 Evo", 25: "Mercedes-AMG GT3 2020", 26: "Ferrari 488 Challenge Evo", 27: "BMW M2 CS Racing", 28: "Porsche 992 GT3 Cup",
  29: "Lamborghini Huracán ST Evo2", 30: "BMW M4 GT3", 31: "Audi R8 LMS GT3 Evo II", 32: "Ferrari 296 GT3", 33: "Lamborghini Huracán GT3 Evo2",
  34: "Porsche 992 GT3 R", 35: "McLaren 720S GT3 Evo", 36: "Ford Mustang GT3",
};
