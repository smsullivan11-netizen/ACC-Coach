-- Overall Driver Rating, driver profiles, target lap times, admins.

-- Admins set target lap times and manage other admins. The first real driver to have signed in
-- (the site's creator) starts as admin.
alter table driver add column is_admin boolean not null default false;
update driver set is_admin = true
where id = (select min(id) from driver where discord_id is not null and discord_id not like 'dev-%');

-- Target lap time per track and car class. The pace reference of a session is the faster of the
-- target and the team's best valid lap (a target is "beaten" as soon as someone goes faster).
create table track_target (
    track_id   bigint not null references track on delete cascade,
    car_class  text not null,
    target_ms  int not null check (target_ms > 0),
    set_by     bigint references driver on delete set null,
    set_at     timestamptz not null default now(),
    primary key (track_id, car_class)
);

-- One row per rated session: the session's score, its parts, and the driver's rating after it.
-- The latest row of a driver is their current Overall Driver Rating (0-100); the rows are its history.
create table driver_rating (
    id             bigint generated always as identity primary key,
    driver_id      bigint not null references driver on delete cascade,
    session_id     bigint references session on delete set null,
    rating         real not null,        -- Overall Driver Rating after this session
    session_score  real not null,        -- this session's score (0-100)
    pace           real,                 -- parts of the score (0-100), null when not measurable
    consistency    real,
    clean          real,
    smoothness     real,
    laps           int not null,         -- valid flying laps of the session
    created_at     timestamptz not null default now()
);
create index driver_rating_driver_idx on driver_rating (driver_id, id);
