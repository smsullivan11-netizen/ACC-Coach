-- Postgres schema of the team site — v1 (Neon or any Postgres ≥ 14).
--
-- Flow: the local agent uploads a session bundle (bundle.py, format acc-coach/session v1);
-- the import creates 1 session row, N lap rows, and their corner_result and lap_trace rows.
-- Server results .json files are imported separately (server_session, official_lap): they cover
-- every driver, with or without telemetry.
-- Reference implementation of the import: tests/test_db.py (import_bundle).

-- --- People -------------------------------------------------------------------

create table driver (
    id            bigint generated always as identity primary key,
    display_name  text not null,
    steam_id      text unique,              -- playerId in ACC .json files ("S7656…")
    created_at    timestamptz not null default now()
);

create table agent_token (                  -- one token per agent installation
    id            bigint generated always as identity primary key,
    driver_id     bigint not null references driver on delete cascade,
    token_hash    text not null unique,     -- sha256 of the token; never the token itself
    label         text,                     -- "Xhanet's PC"
    created_at    timestamptz not null default now(),
    last_used_at  timestamptz,
    revoked_at    timestamptz
);

-- --- Reference data -----------------------------------------------------------

create table track (
    id         bigint generated always as identity primary key,
    simulator  text not null default 'acc',
    key        text not null,               -- .ld venue = .json trackName: 'brands_hatch'
    name       text,                        -- "Brands Hatch"
    length_m   real not null,
    unique (simulator, key)
);

create table car (
    id            bigint generated always as identity primary key,
    simulator     text not null default 'acc',
    key           text not null,            -- from the MoTeC file name: 'ford_mustang_gt3'
    name          text,
    class         text,                     -- 'GT3', 'GT4'…: rankings are per class
    acc_model_id  int,                      -- carModel in ACC .json files (36 = Mustang GT3)
    unique (simulator, key)
);

-- Corner map: a track's current version is the reference for the whole team.
-- The agent downloads it; a bundle computed with another map (different fingerprint) is refused.
create table corner_map (
    id          bigint generated always as identity primary key,
    track_id    bigint not null references track,
    version     int not null,
    hash        text not null,              -- corners.map_hash
    length_m    real not null,
    source      text,                       -- reference file and lap
    created_at  timestamptz not null default now(),
    unique (track_id, version)
);

create table corner (
    corner_map_id  bigint not null references corner_map on delete cascade,
    number         int not null,            -- T1, T2… stable within a version
    name           text,                    -- "Druids", filled in by the team
    start_m        real not null,
    apex_m         real not null,
    end_m          real not null,
    primary key (corner_map_id, number)
);

-- --- Server results (.json) -----------------------------------------------------

create table server_session (
    id            bigint generated always as identity primary key,
    track_id      bigint not null references track,
    server_name   text not null default '',
    file_name     text not null,            -- SessionFile: '261003_215956_Q'
    session_type  text,                     -- 'P', 'Q', 'R'
    ended_at      timestamptz,              -- Date in the .json
    raw           jsonb,                    -- full .json, for reprocessing
    unique (server_name, file_name)
);

create table official_lap (
    id                 bigint generated always as identity primary key,
    server_session_id  bigint not null references server_session on delete cascade,
    car_number_id      int not null,        -- carId in the .json (1001…), specific to the session
    lap_index          int not null,        -- lap order for this car (1…)
    steam_id           text,
    driver_id          bigint references driver,
    lap_time_ms        int not null,
    valid              boolean not null,    -- isValidForBest
    splits_ms          int[],
    unique (server_session_id, car_number_id, lap_index)
);

-- --- Telemetry ------------------------------------------------------------------

create table session (                      -- one session = one processed .ld file
    id                 bigint generated always as identity primary key,
    driver_id          bigint not null references driver,
    track_id           bigint not null references track,
    car_id             bigint references car,
    server_session_id  bigint references server_session,
    source_kind        text not null,       -- 'motec' (later 'shared_memory')
    source_file        text not null,
    source_sha256      text not null unique, -- the same file uploaded twice = refused
    recorded_at        timestamp,           -- PC local time (≈ end of the recording)
    bundle_version     int not null,
    agent_version      text,
    uploaded_at        timestamptz not null default now()
);

create table lap (
    id                    bigint generated always as identity primary key,
    session_id            bigint not null references session on delete cascade,
    number                int not null,
    lap_time_ms           int not null,
    official_lap_time_ms  int,
    official_lap_id       bigint references official_lap,
    game_lap_time_ms      int,              -- lap time published by the game (recorder sessions)
    game_valid            boolean,          -- the game's isValidLap flag (recorder sessions)
    valid                 boolean not null,
    comparable            boolean not null,  -- valid and not a pit lap: only these are ranked
    excluded_reasons      text[] not null default '{}', -- distance, server_invalid, game_invalid, pit_out, pit_in
    distance_m            real,
    metrics               jsonb,            -- lap metrics (still evolving: no fixed columns)
    corner_map_id         bigint references corner_map, -- map used for corner_result
    unique (session_id, number)
);
create index lap_comparable_idx on lap (session_id) where comparable;

create table corner_result (
    lap_id             bigint not null references lap on delete cascade,
    corner_map_id      bigint not null,
    corner_number      int not null,
    time_s             real not null,
    entry_speed_kmh    real,
    lift_point_m       real,
    braking_point_m    real,
    brake_release_m    real,
    max_brake_pct      real,
    min_speed_kmh      real,
    apex_m             real,
    throttle_pickup_m  real,
    full_throttle_m    real,
    coasting_s         real,
    exit_speed_kmh     real,
    primary key (lap_id, corner_number),
    foreign key (corner_map_id, corner_number) references corner
);

-- Resampled traces, as received (base64 channels, see bundle.py; recorder sessions add the car
-- position pos_x_m / pos_y_m / pos_z_m for racing lines).
-- If the database grows too large: external file (R2/S3) and storage_key instead of channels.
create table lap_trace (
    lap_id       bigint primary key references lap on delete cascade,
    step_m       real not null,
    length       int not null,
    channels     jsonb,
    storage_key  text,
    check (channels is not null or storage_key is not null)
);

-- --- Rankings -------------------------------------------------------------------

-- Each driver's best comparable lap, per track and car class
create view best_lap as
select distinct on (s.track_id, c.class, s.driver_id)
       s.track_id, c.class as car_class, s.driver_id, s.car_id,
       l.id as lap_id, l.lap_time_ms, s.recorded_at
from lap l
join session s on s.id = l.session_id
left join car c on c.id = s.car_id
where l.comparable
order by s.track_id, c.class, s.driver_id, l.lap_time_ms;

create view lap_ranking as
select b.*,
       rank() over w as position,
       b.lap_time_ms - min(b.lap_time_ms) over w as gap_ms
from best_lap b
window w as (partition by b.track_id, b.car_class order by b.lap_time_ms);

-- Each driver's best pass through each corner (per map version and class)
create view corner_best as
select distinct on (cr.corner_map_id, cr.corner_number, c.class, s.driver_id)
       cr.corner_map_id, cr.corner_number, c.class as car_class, s.driver_id,
       cr.lap_id, cr.time_s, cr.min_speed_kmh, cr.braking_point_m, cr.throttle_pickup_m
from corner_result cr
join lap l on l.id = cr.lap_id
join session s on s.id = l.session_id
left join car c on c.id = s.car_id
where l.comparable
order by cr.corner_map_id, cr.corner_number, c.class, s.driver_id, cr.time_s;

create view corner_ranking as
select cb.*,
       rank() over w as position,
       cb.time_s - min(cb.time_s) over w as gap_s
from corner_best cb
window w as (partition by cb.corner_map_id, cb.corner_number, cb.car_class order by cb.time_s);

-- Theoretical best lap: sum of best corners (only when every corner is covered)
create view theoretical_best as
select cb.corner_map_id, cb.car_class, cb.driver_id,
       round(sum(cb.time_s)::numeric, 3) as theoretical_s
from corner_best cb
group by cb.corner_map_id, cb.car_class, cb.driver_id
having count(*) = (select count(*) from corner k where k.corner_map_id = cb.corner_map_id);
