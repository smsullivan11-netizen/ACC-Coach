-- Planning identities are event-scoped, never login accounts or telemetry drivers.
create table event_planning_driver (
  id bigint generated always as identity primary key,
  event_id bigint not null references event on delete cascade,
  event_car_id bigint not null,
  name text not null check(char_length(name) between 1 and 80),
  created_by bigint references driver on delete set null,
  created_at timestamptz not null default now(),
  linked_driver_id bigint references driver on delete restrict,
  linked_at timestamptz,
  removed_at timestamptz,
  foreign key(event_id,event_car_id) references event_car(event_id,id) on delete cascade,
  check(linked_at is null or linked_driver_id is not null)
);
create unique index event_planning_driver_name_idx on event_planning_driver(event_car_id,lower(name))
  where linked_driver_id is null and removed_at is null;
alter table event_car_stint add column planning_driver_id bigint references event_planning_driver on delete restrict;
alter table event_car_stint add constraint event_car_stint_one_driver check(driver_id is null or planning_driver_id is null);
alter table event_car add column qualifying_planning_driver_id bigint references event_planning_driver on delete restrict;
alter table event_car add constraint event_car_one_qualifier check(qualifying_driver_id is null or qualifying_planning_driver_id is null);
