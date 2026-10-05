-- Automatic track surface (white lines) per track, computed from the team's laps (and, for the
-- tracks of the TUM racetrack database, its measured widths), so nobody has to drive edge laps.
-- Recomputed when a newer valid lap with car positions exists. Edge laps (track_edge) still win.
create table track_outline (
    track_id     bigint primary key references track on delete cascade,
    source       text not null check (source in ('laps', 'tumftm')),
    laps         int not null,                -- distinct laps used
    last_lap_id  bigint,                      -- newest lap used
    points       jsonb not null,              -- { "left": {x, z}, "right": {x, z} } in game coordinates (m)
    computed_at  timestamptz not null default now()
);
