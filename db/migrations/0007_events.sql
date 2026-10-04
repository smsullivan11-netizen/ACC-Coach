-- Race preparation: events, sign-ups, the stint plan (line-up), and server results attached to events.

-- In-game name from each session (bundle session.driver_name): matches drivers in server results
alter table session add column acc_driver_name text;

create table event (
    id             bigint generated always as identity primary key,
    title          text not null,
    track_key      text not null,              -- lowercase ACC track key ("spa")
    car_class      text not null default 'GT3',
    starts_at      timestamptz not null,
    duration_min   int not null check (duration_min > 0),
    kind           text not null default 'sprint' check (kind in ('sprint', 'endurance')),
    league         text,                       -- "LFM", "team practice"…
    server         text,                       -- server name or how to join
    notes          text,
    min_pit_stops  int not null default 0,
    max_stint_min  int,                        -- league rule (endurance), null = no limit
    created_by     bigint references driver on delete set null,
    created_at     timestamptz not null default now()
);
create index event_starts_idx on event (starts_at);

create table event_entry (
    event_id    bigint not null references event on delete cascade,
    driver_id   bigint not null references driver on delete cascade,
    status      text not null check (status in ('yes', 'maybe', 'no')),
    car_key     text,                          -- the car they plan to drive
    note        text,
    updated_at  timestamptz not null default now(),
    primary key (event_id, driver_id)
);

-- Endurance line-up: stints in order
create table event_stint (
    event_id   bigint not null references event on delete cascade,
    n          int not null,
    driver_id  bigint references driver on delete set null,
    minutes    int not null check (minutes > 0),
    primary key (event_id, n)
);

-- Server results (.json of the ACC server, LFM…) attached to an event; one row per car
alter table server_session add column event_id bigint references event on delete set null;
alter table server_session add column uploaded_by bigint references driver on delete set null;
create table server_result (
    server_session_id  bigint not null references server_session on delete cascade,
    position           int not null,
    car_number_id      int not null,           -- carId in the .json
    race_number        int,
    car_model          int,
    car_group          text,
    team_name          text,
    drivers            jsonb not null,         -- [{name, short, steam_id, driver_id}]
    laps               int not null,
    best_lap_ms        int,
    total_time_ms      bigint,
    primary key (server_session_id, car_number_id)
);
