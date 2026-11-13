alter table event add column practice_starts_at timestamptz;
alter table event add column practice_min int not null default 50 check (practice_min between 1 and 240);
alter table event add column briefing_starts_at timestamptz;
alter table event add column briefing_min int not null default 10 check (briefing_min between 1 and 240);
alter table event add column qualifying_starts_at timestamptz;
alter table event add column qualifying_min int not null default 25 check (qualifying_min between 1 and 240);
alter table event add column timing_revision int not null default 0;
alter table event_car add column qualifying_driver_id bigint references driver on delete set null;

-- Apply the owner's November 14 schedule once. Keep every existing stint's
-- duration, driver and note; shift the future race plan by the green-flag delta.
do $$
declare race record; delta interval;
begin
  for race in select * from event where status = 'upcoming' and archived_at is null
    and starts_at >= '2026-11-14T00:00:00Z'::timestamptz and starts_at < '2026-11-15T00:00:00Z'::timestamptz for update
  loop
    if exists(select 1 from event_car_stint s join event_car c on c.id=s.event_car_id
      where c.event_id=race.id and s.starts_at <= now()) then
      raise exception 'Cannot shift a race with started stints';
    end if;
    if race.duration_min<>1440 and exists(select 1 from event_car_stint s join event_car c on c.id=s.event_car_id where c.event_id=race.id) then
      raise exception 'Review existing plan before changing the race duration';
    end if;
    delta := '2026-11-14T10:30:00Z'::timestamptz - race.starts_at;
    update event_car_stint s set starts_at=s.starts_at+delta, ends_at=s.ends_at+delta
      from event_car c where c.id=s.event_car_id and c.event_id=race.id;
    update event set starts_at='2026-11-14T10:30:00Z', duration_min=1440,
      practice_starts_at='2026-11-14T09:00:00Z',practice_min=50,
      briefing_starts_at='2026-11-14T09:50:00Z',briefing_min=10,
      qualifying_starts_at='2026-11-14T10:00:00Z',qualifying_min=25,
      timing_revision=timing_revision+1,updated_at=now() where id=race.id;
    update event_car set schedule_status='draft',schedule_revision=schedule_revision+1 where event_id=race.id;
    insert into event_update(event_id,kind,body) values(race.id,'official',
      'November 14 UTC schedule: practice 09:00 (50m), briefing 09:50 (10m), qualifying 10:00 (25m), race 10:30 (24h). Existing race stints shifted with their assignments preserved. Review each car’s qualifying driver and reopen booking.');
  end loop;
end $$;

-- Certification accounts are not race participants. Keep the driver, telemetry
-- and all started/historical assignments; remove only upcoming participation.
update event_car c set roster_confirmed=false,schedule_status='draft',schedule_revision=schedule_revision+1
  where exists(select 1 from event e join event_car_driver r on r.event_id=e.id join driver d on d.id=r.driver_id
    where e.id=c.event_id and r.event_car_id=c.id and e.status='upcoming' and e.starts_at>now()
      and e.archived_at is null and d.discord_id='review-store');
update event_car_stint s set driver_id=null from event_car c,event e,driver d
  where s.event_car_id=c.id and c.event_id=e.id and d.id=s.driver_id and d.discord_id='review-store'
    and e.status='upcoming' and e.archived_at is null and s.starts_at>now();
delete from event_car_driver r using event e,driver d
  where r.event_id=e.id and r.driver_id=d.id and d.discord_id='review-store'
    and e.status='upcoming' and e.starts_at>now() and e.archived_at is null;
delete from event_signup s using event e,driver d
  where s.event_id=e.id and s.driver_id=d.id and d.discord_id='review-store'
    and e.status='upcoming' and e.starts_at>now() and e.archived_at is null;
