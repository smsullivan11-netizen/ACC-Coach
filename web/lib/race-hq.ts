import "server-only";
import { sql } from "./db";
import type { Driver } from "./auth";

export type RaceEvent = {
  id: string; title: string; track_key: string; starts_at: string; duration_min: number;
  league: string | null; server: string | null; notes: string | null;
  status: "upcoming" | "live" | "finished";
  clock_remaining_s: number | null; clock_updated_at: string | null;
  clock_source: "schedule" | "manual" | "acc" | null; archived_at: string | null; server_now: string;
};
export type RaceCar = { id: string; number: string; name: string; car_key: string | null; sort_order: number };
export type RaceStint = {
  id: string; event_car_id: string; n: number; driver_id: string | null; driver: string | null;
  avatar_url: string | null; starts_at: string; ends_at: string; note: string | null;
};
export type RaceUpdate = {
  id: string; event_car_id: string | null; car_number: string | null; author_id: string | null;
  author: string | null; avatar_url: string | null; kind: "comment" | "official" | "system";
  body: string; created_at: string;
};
export type RaceSignup = {
  driver_id: string; display_name: string; avatar_url: string | null;
  status: "in" | "maybe" | "out"; timing_preference: string | null; updated_at: string;
};
export type RaceHQData = {
  event: RaceEvent; cars: RaceCar[]; stints: RaceStint[]; updates: RaceUpdate[];
  leads: { id: string; display_name: string }[];
  readiness: { driver_id: string; ready: boolean; updated_at: string }[];
  signups: RaceSignup[];
  can_lead: boolean; me: Driver;
};

export async function canLead(eventId: string, driver: Driver): Promise<boolean> {
  if (driver.is_admin) return true;
  const [row] = await sql`select 1 from event_role where event_id = ${eventId} and driver_id = ${driver.id} and role = 'lead'`;
  return Boolean(row);
}

export async function raceHQ(eventId: string | null, me: Driver): Promise<RaceHQData | null> {
  const rows = eventId
    ? await sql<RaceEvent[]>`select id, title, track_key,
        to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at, duration_min,
        league, server, notes, status, clock_remaining_s,
        to_char(clock_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as clock_updated_at,
        clock_source, to_char(archived_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as archived_at,
        to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as server_now
        from event where id = ${eventId}`
    : await sql<RaceEvent[]>`select id, title, track_key,
        to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at, duration_min,
        league, server, notes, status, clock_remaining_s,
        to_char(clock_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as clock_updated_at,
        clock_source, to_char(archived_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as archived_at,
        to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as server_now
        from event
        where status in ('upcoming', 'live') and archived_at is null order by starts_at limit 1`;
  const event = rows[0];
  if (!event) return null;
  const [cars, stints, updates, leads, readiness, signups, lead] = await Promise.all([
    sql<RaceCar[]>`select id, number, name, car_key, sort_order from event_car where event_id = ${event.id} order by sort_order, id`,
    sql<RaceStint[]>`select s.id, s.event_car_id, s.n, s.driver_id, d.display_name as driver, d.avatar_url,
        to_char(s.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at,
        to_char(s.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ends_at, s.note
        from event_car_stint s left join driver d on d.id = s.driver_id
        join event_car c on c.id = s.event_car_id where c.event_id = ${event.id}
        order by c.sort_order, s.n`,
    sql<RaceUpdate[]>`select u.id, u.event_car_id, c.number as car_number, u.author_id,
        d.display_name as author, d.avatar_url, u.kind, u.body,
        to_char(u.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
        from event_update u left join event_car c on c.id = u.event_car_id
        left join driver d on d.id = u.author_id where u.event_id = ${event.id}
        order by u.created_at desc limit 200`,
    sql<{ id: string; display_name: string }[]>`select d.id, d.display_name from event_role r
        join driver d on d.id = r.driver_id where r.event_id = ${event.id} and r.role = 'lead'
        order by d.display_name`,
    sql<{ driver_id: string; ready: boolean; updated_at: string }[]>`select driver_id, ready,
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
        from event_readiness where event_id = ${event.id}`,
    sql<RaceSignup[]>`select s.driver_id, d.display_name, d.avatar_url, s.status, s.timing_preference,
        to_char(s.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
        from event_signup s join driver d on d.id = s.driver_id
        where s.event_id = ${event.id}
        order by case s.status when 'in' then 1 when 'maybe' then 2 else 3 end,
                 s.updated_at, d.display_name`,
    canLead(event.id, me),
  ]);
  return { event, cars, stints, updates, leads, readiness, signups, can_lead: lead, me };
}

export async function raceArchive() {
  return sql<{ id: string; title: string; track_key: string; starts_at: string; duration_min: number; cars: number }[]>`
    select e.id, e.title, e.track_key,
           to_char(e.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at,
           e.duration_min,
           count(c.id)::int as cars
    from event e left join event_car c on c.event_id = e.id
    where e.status = 'finished' or e.archived_at is not null
    group by e.id order by e.starts_at desc limit 30`;
}

export async function raceMembers() {
  return sql<{ id: string; display_name: string; avatar_url: string | null }[]>`
    select id, display_name, avatar_url from driver order by display_name`;
}
