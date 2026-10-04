-- Track edges (white lines) for drawing the track surface on maps. ACC does not publish them:
-- they come from two "edge laps" driven with the left / right wheels on the white line, chosen by
-- an admin. Points = the lap's line moved outward by half the car's width, every 2 m.
create table track_edge (
    track_id  bigint not null references track on delete cascade,
    side      text not null check (side in ('left', 'right')),
    lap_id    bigint references lap on delete set null,
    points    jsonb not null,                 -- { "x": [...], "z": [...] } in game coordinates (m)
    set_by    bigint references driver on delete set null,
    set_at    timestamptz not null default now(),
    primary key (track_id, side)
);
