-- Website: Discord sign-in, browser sessions, exact corner map definitions.

alter table driver add column discord_id text unique;      -- Discord user id (sign-in)
alter table driver add column avatar_url text;
alter table driver add column last_seen_at timestamptz;

create table web_session (                                  -- signed-in browsers
    id_hash     text primary key,                           -- sha256 of the cookie value, never the value
    driver_id   bigint not null references driver on delete cascade,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null
);
create index web_session_driver_idx on web_session (driver_id);

alter table session add column session_type text;           -- practice, qualify, race… (bundle)

-- Rankings use the most official lap time available: server results, else the game's, else ours
create or replace view best_lap as
select distinct on (s.track_id, c.class, s.driver_id)
       s.track_id, c.class as car_class, s.driver_id, s.car_id,
       l.id as lap_id, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as lap_time_ms,
       s.recorded_at
from lap l
join session s on s.id = l.session_id
left join car c on c.id = s.car_id
where l.comparable
order by s.track_id, c.class, s.driver_id, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms);

-- The corner map exactly as the first agent sent it, served back verbatim: every agent must
-- compute the same fingerprint, and the real columns of `corner` would round the boundaries.
alter table corner_map add column definition jsonb;
