import "server-only";
import { sql } from "./db";

// Driving-style description of a driver, from data (no AI): their corner results compared with
// their teammates' on the same corners, plus the parts of their recent session scores.

export type Trait = { label: string; detail: string; tone: "strength" | "neutral" | "work" };

type Corners = { braking: number | null; min_speed: number | null; pickup: number | null; coasting: number | null; corners: number };
type Parts = { consistency: number | null; clean: number | null; smoothness: number | null; sessions: number; laps: number };

export async function drivingStyle(driverId: string, name: string): Promise<{ traits: Trait[]; summary: string }> {
  // Median per corner for this driver vs the other drivers, then averaged over the shared corners
  const [c] = await sql<Corners[]>`
    with r as (
      select cr.corner_map_id, cr.corner_number, s.driver_id = ${driverId} as me,
             cr.braking_point_m, cr.min_speed_kmh, cr.throttle_pickup_m, cr.coasting_s
      from corner_result cr join lap l on l.id = cr.lap_id join session s on s.id = l.session_id
      where l.comparable),
    m as (
      select corner_map_id, corner_number, me,
             percentile_cont(0.5) within group (order by braking_point_m) as bp,
             percentile_cont(0.5) within group (order by min_speed_kmh) as ms,
             percentile_cont(0.5) within group (order by throttle_pickup_m) as tp,
             percentile_cont(0.5) within group (order by coasting_s) as co
      from r group by corner_map_id, corner_number, me)
    select avg(a.bp - b.bp) as braking, avg(a.ms - b.ms) as min_speed, avg(a.tp - b.tp) as pickup,
           avg(a.co - b.co) as coasting, count(*)::int as corners
    from m a join m b on a.corner_map_id = b.corner_map_id and a.corner_number = b.corner_number
    where a.me and not b.me`;
  const [p] = await sql<Parts[]>`
    select avg(consistency) as consistency, avg(clean) as clean, avg(smoothness) as smoothness, count(*)::int as sessions,
           coalesce(sum(laps), 0)::int as laps
    from (select * from driver_rating where driver_id = ${driverId} order by id desc limit 5) recent`;

  const traits: Trait[] = [];
  const f = (x: number) => Math.abs(x).toFixed(0);
  if (c.corners >= 3) {
    if (c.braking != null && c.braking > 4)
      traits.push({ label: "Late braker", detail: `brakes ${f(c.braking)} m later than teammates on average`, tone: "neutral" });
    if (c.braking != null && c.braking < -4)
      traits.push({ label: "Early braker", detail: `brakes ${f(c.braking)} m earlier than teammates on average`, tone: "work" });
    if (c.min_speed != null && c.min_speed > 2)
      traits.push({ label: "Carries corner speed", detail: `is ${f(c.min_speed)} km/h faster at the apex than teammates`, tone: "strength" });
    if (c.min_speed != null && c.min_speed < -2)
      traits.push({ label: "Slow mid-corner", detail: `is ${f(c.min_speed)} km/h slower at the apex than teammates (room to carry more speed)`, tone: "work" });
    if (c.pickup != null && c.pickup < -5)
      traits.push({ label: "Early on the throttle", detail: `gets back on the throttle ${f(c.pickup)} m earlier than teammates`, tone: "strength" });
    if (c.pickup != null && c.pickup > 5)
      traits.push({ label: "Late on the throttle", detail: `gets back on the throttle ${f(c.pickup)} m later than teammates`, tone: "work" });
    if (c.coasting != null && c.coasting > 0.1)
      traits.push({ label: "Coasts into corners", detail: `coasts ${c.coasting.toFixed(2)} s longer per corner than teammates`, tone: "work" });
  }
  if (p.laps >= 8) {                         // too few laps: no verdict on consistency or cleanliness
    if (p.consistency != null && p.consistency >= 80)
      traits.push({ label: "Consistent", detail: "keeps very regular lap times", tone: "strength" });
    if (p.consistency != null && p.consistency <= 40)
      traits.push({ label: "Irregular", detail: "has irregular lap times within a session", tone: "work" });
    if (p.clean != null && p.clean >= 95)
      traits.push({ label: "Clean", detail: "almost never exceeds track limits", tone: "strength" });
    if (p.clean != null && p.clean <= 75)
      traits.push({ label: "Track limits", detail: "often loses laps to track limits", tone: "work" });
    if (p.smoothness != null && p.smoothness >= 80)
      traits.push({ label: "Smooth", detail: "stays calm on the steering wheel", tone: "strength" });
    if (p.smoothness != null && p.smoothness <= 40)
      traits.push({ label: "Busy hands", detail: "makes many steering corrections", tone: "work" });
  }

  let summary: string;
  if (p.laps < 8 && c.corners < 3) summary = `Not enough laps yet to describe ${name}'s driving.`;
  else if (!traits.length) summary = `${name} drives close to the team average everywhere: no strong trait stands out yet.`;
  else {
    const sentences = traits.slice(0, 3).map((t) => t.detail);
    summary = `${name} ${sentences.length > 1 ? `${sentences.slice(0, -1).join(", ")} and ${sentences.at(-1)}` : sentences[0]}.`;
    if (c.corners < 3) summary += " Corner-by-corner traits appear once teammates have laps on the same tracks.";
  }
  return { traits, summary };
}
