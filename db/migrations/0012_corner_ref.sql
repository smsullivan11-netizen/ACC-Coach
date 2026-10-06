-- Each corner's reference point for distances (user's request: "brake 118 m before T1" instead of
-- metres from the line, and virtual 50/100/150 m boards counting down to it, like real tracks):
-- the team's median turn-in point on that corner map, in map metres, refreshed after uploads
-- (lib/corner-refs.ts; it only moves when the new median is more than 2 m away).
create table if not exists corner_ref (
    corner_map_id  bigint not null,
    corner_number  int not null,
    zero_m         real not null,      -- the turn-in point (map metres)
    brakes         boolean not null,   -- most laps brake (or lift) for it: boards are drawn
    brake_m        real,               -- median braking distance before the zero (m): board spacing
    laps           int not null,
    updated_at     timestamptz not null default now(),
    primary key (corner_map_id, corner_number),
    foreign key (corner_map_id, corner_number) references corner on delete cascade
);
