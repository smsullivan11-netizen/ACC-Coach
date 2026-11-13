-- Preserve existing schedules; new controls begin in draft until a lead opens booking.
alter table event_car add column schedule_status text not null default 'draft'
  check (schedule_status in ('draft', 'open', 'confirmed'));
alter table event_car add column schedule_revision int not null default 0 check (schedule_revision >= 0);
