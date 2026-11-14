-- Additive only: existing events, drivers and telemetry are unchanged.
create table if not exists event_signup (
  event_id bigint not null references event on delete cascade,
  driver_id bigint not null references driver on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, driver_id)
);
