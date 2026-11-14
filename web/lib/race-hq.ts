import "server-only";
import { sql } from "./db";
import type { Driver } from "./auth";
import {raceClock} from "./race-clock";

export type RaceEvent = {
  id: string; title: string; track_key: string; starts_at: string; duration_min: number;
  league: string | null; server: string | null; notes: string | null;
  status: "upcoming" | "live" | "finished";
  clock_mode:"auto"|"manual";clock_manual_remaining_s:number|null;clock_manual_updated_at:string|null;
  clock_remaining_s: number | null; clock_updated_at: string | null;
  practice_starts_at: string | null; practice_min: number; briefing_starts_at: string | null; briefing_min: number; qualifying_starts_at: string | null; qualifying_min: number; timing_revision: number;
  clock_source: "schedule" | "manual" | "acc" | null; archived_at: string | null; server_now: string;
};
export type RaceCar = { id: string; number: string; name: string; car_key: string | null; sort_order: number; roster_confirmed: boolean; schedule_status: "draft" | "open" | "confirmed"; schedule_revision: number; qualifying_driver_id: string | null; qualifying_planning_driver_id: string | null; qualifying_driver: string | null };
export type RaceStint = {
  id: string; event_car_id: string; n: number; driver_id: string | null; planning_driver_id: string | null; driver: string | null;
  avatar_url: string | null; starts_at: string; ends_at: string; note: string | null;
};
export type RaceUpdate = {
  id: string; event_car_id: string | null; car_number: string | null; author_id: string | null;
  author: string | null; avatar_url: string | null; kind: "comment" | "official" | "system";
  body: string; created_at: string;
};
export type RaceSignup = { driver_id: string; display_name: string };

export type CarRosterDriver = { event_car_id: string; driver_id: string; display_name: string; sort_order: number };
export type CarStrategy = {
  event_car_id: string; stint_min: number; starting_fuel_l: string | null; refuel_l: string | null;
  reserve_l: string | null; tyre_plan: "every_stop" | "as_needed" | "no_change" | null;
  min_pit_stops: number | null; pit_window: string | null; notes: string | null;
};

export type StintTrade = {
  id: string; event_car_id: string; from_driver_id: string; to_driver_id: string; from_driver: string; to_driver: string;
  give_stint_id: string | null; take_stint_id: string | null; give_n: number | null; take_n: number | null;
  give_starts_at: string | null; give_ends_at: string | null; take_starts_at: string | null; take_ends_at: string | null;
};

export type PlanningDriver = { id:string;event_car_id:string;name:string };
export type RaceHQData = {
  planning_drivers: PlanningDriver[];
  trades: StintTrade[];
  preferences: { stint_id: string; driver_id: string; display_name: string }[];
  rosters: CarRosterDriver[]; strategies: CarStrategy[];
  signups: RaceSignup[];
  event: RaceEvent; cars: RaceCar[]; stints: RaceStint[]; updates: RaceUpdate[];
  leads: { id: string; display_name: string }[];
  readiness: { driver_id: string; ready: boolean; updated_at: string }[];
  can_lead: boolean; me: Driver;
};

export async function canLead(eventId: string, driver: Driver): Promise<boolean> {
  if (driver.is_admin) return true;
  const [row] = await sql`select 1 from event_role where event_id = ${eventId} and driver_id = ${driver.id} and role = 'lead'`;
  return Boolean(row);
}

export async function raceHQ(eventId: string | null, me: Driver): Promise<RaceHQData | null> {
  return sql.begin(async (tx) => {
    await tx`set transaction isolation level repeatable read, read only`;
  const rows = eventId
    ? await tx<RaceEvent[]>`select id, title, track_key,
        to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at, duration_min,
        league, server, notes, status, clock_remaining_s,clock_mode,clock_manual_remaining_s,
        to_char(clock_manual_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as clock_manual_updated_at, practice_min, briefing_min, qualifying_min, timing_revision,
        to_char(practice_starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as practice_starts_at,
        to_char(briefing_starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as briefing_starts_at,
        to_char(qualifying_starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as qualifying_starts_at,
        to_char(clock_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as clock_updated_at,
        clock_source, to_char(archived_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as archived_at,
        to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as server_now
        from event where id = ${eventId}`
    : await tx<RaceEvent[]>`select id, title, track_key,
        to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at, duration_min,
        league, server, notes, status, clock_remaining_s,clock_mode,clock_manual_remaining_s,
        to_char(clock_manual_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as clock_manual_updated_at, practice_min, briefing_min, qualifying_min, timing_revision,
        to_char(practice_starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as practice_starts_at,
        to_char(briefing_starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as briefing_starts_at,
        to_char(qualifying_starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as qualifying_starts_at,
        to_char(clock_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as clock_updated_at,
        clock_source, to_char(archived_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as archived_at,
        to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as server_now
        from event
        where status in ('upcoming', 'live') and archived_at is null order by starts_at limit 1`;
  const event = rows[0];
  if (!event) return null;
  const clock=raceClock(event,Date.parse(event.server_now));
  event.status=clock.phase==="finished"?"finished":clock.phase==="upcoming"?"upcoming":"live";
  const [cars, stints, updates, leads, readiness, lead, signups, rosters, strategies, trades, preferences, planningDrivers] = await Promise.all([
    tx<RaceCar[]>`select c.id, c.number, c.name, c.car_key, c.sort_order, c.roster_confirmed, c.schedule_status, c.schedule_revision, c.qualifying_driver_id,c.qualifying_planning_driver_id,coalesce(d.display_name,p.name) as qualifying_driver from event_car c left join driver d on d.id=c.qualifying_driver_id left join event_planning_driver p on p.id=c.qualifying_planning_driver_id where c.event_id = ${event.id} order by c.sort_order, c.id`,
    tx<RaceStint[]>`select s.id, s.event_car_id, s.n, s.driver_id,s.planning_driver_id,coalesce(d.display_name,p.name) as driver, d.avatar_url,
        to_char(s.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at,
        to_char(s.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ends_at, s.note
        from event_car_stint s left join driver d on d.id = s.driver_id left join event_planning_driver p on p.id=s.planning_driver_id
        join event_car c on c.id = s.event_car_id where c.event_id = ${event.id}
        order by c.sort_order, s.n`,
    tx<RaceUpdate[]>`select u.id, u.event_car_id, c.number as car_number, u.author_id,
        d.display_name as author, d.avatar_url, u.kind, u.body,
        to_char(u.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
        from event_update u left join event_car c on c.id = u.event_car_id
        left join driver d on d.id = u.author_id where u.event_id = ${event.id}
        order by u.created_at desc limit 200`,
    tx<{ id: string; display_name: string }[]>`select d.id, d.display_name from event_role r
        join driver d on d.id = r.driver_id where r.event_id = ${event.id} and r.role = 'lead'
        order by d.display_name`,
    tx<{ driver_id: string; ready: boolean; updated_at: string }[]>`select driver_id, ready,
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
        from event_readiness where event_id = ${event.id}`,
    me.is_admin ? Promise.resolve(true) : tx`select 1 from event_role where event_id = ${event.id} and driver_id = ${me.id} and role = 'lead'`.then((rows) => Boolean(rows.length)),
    tx<RaceSignup[]>`select s.driver_id, d.display_name from event_signup s
      join driver d on d.id = s.driver_id where s.event_id = ${event.id} and d.discord_id is distinct from 'review-store'
      order by s.created_at, s.driver_id`,
    tx<CarRosterDriver[]>`select r.event_car_id, r.driver_id, d.display_name, r.sort_order from event_car_driver r
      join driver d on d.id = r.driver_id where r.event_id = ${event.id} and d.discord_id is distinct from 'review-store' order by r.event_car_id, r.sort_order, r.driver_id`,
    tx<CarStrategy[]>`select s.* from event_car_strategy s join event_car c on c.id = s.event_car_id where c.event_id = ${event.id}`,
    tx<StintTrade[]>`select t.id,t.event_car_id,t.from_driver_id,t.to_driver_id,f.display_name as from_driver,d.display_name as to_driver,
      t.give_stint_id,t.take_stint_id,g.n as give_n,k.n as take_n,
      to_char(t.give_starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as give_starts_at,
      to_char(t.give_ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as give_ends_at,
      to_char(t.take_starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as take_starts_at,
      to_char(t.take_ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as take_ends_at
      from event_stint_trade t join driver f on f.id=t.from_driver_id join driver d on d.id=t.to_driver_id
      left join event_car_stint g on g.id=t.give_stint_id left join event_car_stint k on k.id=t.take_stint_id
      where t.event_id=${event.id} and t.status='pending' and (t.from_driver_id=${me.id} or t.to_driver_id=${me.id})
      order by t.created_at desc limit 100`,
    tx<{ stint_id:string;driver_id:string;display_name:string }[]>`select p.stint_id,p.driver_id,d.display_name
      from event_stint_preference p join event_car_stint s on s.id=p.stint_id join event_car c on c.id=s.event_car_id
      join driver d on d.id=p.driver_id where c.event_id=${event.id} and d.discord_id is distinct from 'review-store'
      order by p.created_at,p.driver_id`,
    tx<PlanningDriver[]>`select id,event_car_id,name from event_planning_driver where event_id=${event.id} and linked_driver_id is null and removed_at is null order by id`,

  ]);
  return { event, cars, stints, updates, leads, readiness, signups, rosters, strategies, trades, preferences, planning_drivers:planningDrivers, can_lead: lead, me };
  });
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
    select id, display_name, avatar_url from driver where discord_id is distinct from 'review-store' order by display_name`;
}


