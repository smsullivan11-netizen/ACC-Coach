-- Race Day HQ: one active event, multiple team cars, shared stint plans and race updates.
-- The older event/event_stint tables remain available for historical data. New plans use
-- event_car and event_car_stint so two or more team cars can run in the same race.

alter table event add column if not exists status text not null default 'upcoming'
    check (status in ('upcoming', 'live', 'finished'));
alter table event add column if not exists clock_remaining_s int check (clock_remaining_s >= 0);
alter table event add column if not exists clock_updated_at timestamptz;
alter table event add column if not exists clock_source text
    check (clock_source in ('schedule', 'manual', 'acc'));
alter table event add column if not exists archived_at timestamptz;
alter table event add column if not exists updated_at timestamptz not null default now();

create table if not exists event_car (
    id          bigint generated always as identity primary key,
    event_id    bigint not null references event on delete cascade,
    number      text not null,
    name        text not null,
    car_key     text,
    sort_order  int not null default 0,
    unique (event_id, number)
);

create table if not exists event_car_stint (
    id          bigint generated always as identity primary key,
    event_car_id bigint not null references event_car on delete cascade,
    n           int not null check (n > 0),
    driver_id   bigint references driver on delete set null,
    starts_at   timestamptz not null,
    ends_at     timestamptz not null,
    note        text,
    check (ends_at > starts_at),
    unique (event_car_id, n)
);
create index if not exists event_car_stint_time_idx on event_car_stint (event_car_id, starts_at);

create table if not exists event_role (
    event_id   bigint not null references event on delete cascade,
    driver_id  bigint not null references driver on delete cascade,
    role       text not null check (role in ('lead')),
    primary key (event_id, driver_id, role)
);

create table if not exists event_update (
    id           bigint generated always as identity primary key,
    event_id     bigint not null references event on delete cascade,
    event_car_id bigint references event_car on delete cascade,
    author_id    bigint references driver on delete set null,
    kind         text not null default 'comment' check (kind in ('comment', 'official', 'system')),
    body         text not null check (char_length(body) between 1 and 1200),
    created_at   timestamptz not null default now()
);
create index if not exists event_update_event_idx on event_update (event_id, created_at desc);

create table if not exists event_readiness (
    event_id    bigint not null references event on delete cascade,
    driver_id   bigint not null references driver on delete cascade,
    ready       boolean not null default true,
    updated_at  timestamptz not null default now(),
    primary key (event_id, driver_id)
);

-- Events created by the retired one-car planner predate Race Day HQ. Preserve them in the
-- archive instead of treating every legacy row as a currently active race (which would also make
-- the one-active-race index below impossible to create on an existing database).
update event
set status = 'finished',
    archived_at = coalesce(archived_at, starts_at + make_interval(mins => duration_min)),
    updated_at = now()
where status = 'upcoming'
  and not exists (select 1 from event_car where event_car.event_id = event.id);

create unique index if not exists event_one_active_idx on event ((true))
    where status in ('upcoming', 'live') and archived_at is null;
