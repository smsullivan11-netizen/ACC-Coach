-- Reference lap times per BoP (user's choice, 2026-10-07): OhneSpeed's public "ACC race pace"
-- spreadsheet (lib/references.ts imports it): per car and track, the stock-BoP qualifying time and
-- the LFM-BoP low-fuel time, for GT3, GT4, 992 Cup and M2. The pace score's 100 = this time × 1.01
-- for the session's BoP (lib/targets.ts). LFM rows also carry LFM's ballast and restrictor for
-- that car and track (leaderboard badges).
create table if not exists lap_reference (
    bop             text not null check (bop in ('default', 'lfm')),
    track_key       text not null,        -- lowercase ACC track key
    car_key         text not null,        -- ACC car model key
    car_class       text not null,        -- GT3, GT4, Cup (class fallback: GT3 and GT4 only)
    time_ms         int  not null,        -- stock BoP: qualifying; LFM BoP: low-fuel top time
    ballast_kg      real,                 -- LFM BoP only: ballast LFM adds (kg, can be negative)
    restrictor_pct  real,                 -- LFM BoP only: restrictor (%)
    source          text not null,        -- the sheet tab it came from
    sheet_date      text,                 -- the sheet's "Last updated"
    imported_at     timestamptz not null default now(),
    primary key (bop, track_key, car_key)
);

-- BoP of each session: detected (app 0.4+: offline = default; online, from ACC's log: an LFM server
-- = 'lfm', any other = default), or chosen by the team on the session page. Effective BoP =
-- coalesce(bop_chosen, bop, 'default'). For LFM sessions, LFM's ballast and restrictor for the
-- session's car and track as they were then (LFM changes its BoP: old laps keep theirs).
alter table session add column if not exists bop text;
alter table session add column if not exists bop_chosen text;
alter table session add column if not exists server_name text;
alter table session add column if not exists bop_ballast_kg real;
alter table session add column if not exists bop_restrictor_pct real;
