-- App 0.4 (2026-10-07): ACC's log names the server and the balance of performance the server gave
-- the driver's car ("additional BoP: -22 kg, 0.19 restrictor", acc_log.py). Kept as sent: they win
-- over the reference sheet's LFM values in the session's frozen BoP (lib/references.ts snapshotBop).
alter table session add column if not exists game_ballast_kg real;
alter table session add column if not exists game_restrictor_pct real;

-- Small site-wide facts: 'app_announced' = the last desktop app version posted on Discord
-- (lib/discord.ts announceRelease), so each release is posted once.
create table if not exists site_state (
    key        text primary key,
    value      text not null,
    updated_at timestamptz not null default now()
);
