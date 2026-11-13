import "server-only";
import type { TransactionSql } from "postgres";

/** Explicitly requested plan generation; callers hold the event lock. */
export async function generateCarPlan(tx: TransactionSql, carId: string, startsAt: string, duration: number, stintMin: number, drivers: (string | { planning_driver_id: string })[]) {
  await tx`delete from event_car_stint where event_car_id = ${carId}`;
  const start = new Date(startsAt).getTime();
  for (let offset = 0, n = 1; offset < duration; offset += stintMin, n++) {
    const person = drivers[Math.floor((n - 1) / 2) % drivers.length];
    const driver = typeof person==="string"?person:null, planning=typeof person==="string"?null:person.planning_driver_id;
    await tx`insert into event_car_stint (event_car_id, n, driver_id, planning_driver_id, starts_at, ends_at)
      values (${carId}, ${n}, ${driver}, ${planning}, ${new Date(start + offset * 60000).toISOString()},
        ${new Date(start + Math.min(duration, offset + stintMin) * 60000).toISOString()})`;
  }
}
