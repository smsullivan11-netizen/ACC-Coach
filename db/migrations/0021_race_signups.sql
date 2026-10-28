-- Race Day HQ sign-ups: one availability response per team member and event.
-- Responses remain with archived races so the roster and timing preferences stay useful history.

create table if not exists event_signup (
    event_id          bigint not null references event on delete cascade,
    driver_id         bigint not null references driver on delete cascade,
    status            text not null check (status in ('in', 'maybe', 'out')),
    timing_preference text check (char_length(timing_preference) <= 500),
    updated_at        timestamptz not null default now(),
    primary key (event_id, driver_id)
);

create index if not exists event_signup_event_status_idx
    on event_signup (event_id, status, updated_at);

