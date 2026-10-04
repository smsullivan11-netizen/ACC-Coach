-- Achievements earned by drivers (lib/achievements.ts lists them and checks them after each upload).
-- `scope` is the track key for per-track achievements ("" otherwise), so "Target beaten" can be
-- earned once per track.
create table achievement (
    driver_id   bigint not null references driver on delete cascade,
    code        text not null,
    scope       text not null default '',
    session_id  bigint references session on delete set null,
    earned_at   timestamptz not null default now(),
    detail      text,
    primary key (driver_id, code, scope)
);
create index achievement_recent_idx on achievement (earned_at desc);
