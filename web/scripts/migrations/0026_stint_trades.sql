create table event_stint_trade (
  id bigint generated always as identity primary key,
  event_id bigint not null references event on delete cascade,
  event_car_id bigint not null references event_car on delete cascade,
  from_driver_id bigint not null references driver on delete cascade,
  to_driver_id bigint not null references driver on delete cascade,
  give_stint_id bigint references event_car_stint on delete cascade,
  take_stint_id bigint references event_car_stint on delete cascade,
  give_starts_at timestamptz, give_ends_at timestamptz,
  take_starts_at timestamptz, take_ends_at timestamptz,
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check(from_driver_id<>to_driver_id),
  check(give_stint_id is not null or take_stint_id is not null),
  check(give_stint_id is null or take_stint_id is null or give_stint_id<>take_stint_id),
  check((give_stint_id is null) = (give_starts_at is null)),
  check((give_stint_id is null) = (give_ends_at is null)),
  check((take_stint_id is null) = (take_starts_at is null)),
  check((take_stint_id is null) = (take_ends_at is null))
);
create index event_stint_trade_pending_idx on event_stint_trade(event_id,event_car_id) where status='pending';

-- Preferences express interest only; they never change the assigned driver.
create table event_stint_preference (
  stint_id bigint not null references event_car_stint on delete cascade,
  driver_id bigint not null references driver on delete cascade,
  created_at timestamptz not null default now(),
  primary key(stint_id,driver_id)
);
