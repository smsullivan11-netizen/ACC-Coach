alter table event_car add column if not exists roster_confirmed boolean not null default false;
create unique index if not exists event_car_event_id_id_idx on event_car (event_id, id);

create table event_car_driver (
  event_id bigint not null references event on delete cascade,
  event_car_id bigint not null,
  driver_id bigint not null references driver on delete cascade,
  sort_order int not null default 0,
  primary key (event_id, driver_id),
  foreign key (event_id, event_car_id) references event_car (event_id, id) on delete cascade
);

create table event_car_strategy (
  event_car_id bigint primary key references event_car on delete cascade,
  stint_min int not null default 65 check (stint_min between 10 and 240),
  starting_fuel_l numeric check (starting_fuel_l between 0 and 200),
  refuel_l numeric check (refuel_l between 0 and 200),
  reserve_l numeric check (reserve_l between 0 and 50),
  tyre_plan text check (tyre_plan in ('every_stop', 'as_needed', 'no_change')),
  min_pit_stops int check (min_pit_stops between 0 and 100),
  pit_window text check (char_length(pit_window) <= 300),
  notes text check (char_length(notes) <= 4000)
);

insert into event_car_strategy (event_car_id) select id from event_car;

-- Preserve all old schedules. Import only unambiguous car assignments; shared
-- drivers stay unassigned so a lead can resolve them without guessing.
insert into event_car_driver (event_id, event_car_id, driver_id)
select c.event_id, min(c.id), s.driver_id
from event_car_stint s join event_car c on c.id = s.event_car_id
where s.driver_id is not null
group by c.event_id, s.driver_id having count(distinct c.id) = 1;
