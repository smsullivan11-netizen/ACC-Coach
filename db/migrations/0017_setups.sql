-- Setups library (user's request, 2026-10-08): everyone can upload ACC setup files (the .json from
-- Documents\Assetto Corsa Competizione\Setups\<car>\<track>), see them like the game's own setup
-- screens (Tyres, Electronics, Fuel & Strategy, Mechanical Grip, Dampers, Aero) and download them.
-- The file is stored as uploaded (data); the rest is for finding it (web/lib/setups.ts).
create table if not exists setup (
    id           bigint generated always as identity primary key,
    car_key      text not null,                 -- the file's carName (ACC car model key)
    track_key    text not null,                 -- lowercase ACC track key, chosen at upload
    title        text not null,                 -- file name without .json, editable by the owner
    kind         text not null default 'other' check (kind in ('qualifying', 'race', 'wet', 'other')),
    notes        text,
    data         jsonb not null,                -- the setup file
    sha256       text not null,                 -- of the file's JSON: the same setup is stored once per car and track
    uploaded_by  bigint references driver on delete set null,
    created_at   timestamptz not null default now(),
    downloads    int not null default 0,
    unique (car_key, track_key, sha256)
);
create index if not exists setup_car_track on setup (car_key, track_key);
