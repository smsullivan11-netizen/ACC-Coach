alter table event_car add column stint_timer_started_at timestamptz;
alter table event_car add column stint_timer_duration_min int check(stint_timer_duration_min between 1 and 240);
alter table event_car add column stint_timer_revision int not null default 0;
alter table event_car add constraint event_car_timer_pair check((stint_timer_started_at is null)=(stint_timer_duration_min is null));
