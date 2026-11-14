-- Keep manual anchors separate: the original host may still write legacy ACC fields.
alter table event add column clock_mode text not null default 'auto' check(clock_mode in ('auto','manual'));
alter table event add column clock_manual_remaining_s int check(clock_manual_remaining_s between 0 and 86400);
alter table event add column clock_manual_updated_at timestamptz;
alter table event add constraint event_manual_clock_pair
  check((clock_manual_remaining_s is null)=(clock_manual_updated_at is null));
update event set clock_mode='manual',clock_manual_remaining_s=clock_remaining_s,clock_manual_updated_at=clock_updated_at
  where clock_source='manual' and clock_remaining_s between 0 and 86400 and clock_updated_at is not null;
