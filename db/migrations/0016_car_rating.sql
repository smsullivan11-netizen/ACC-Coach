-- Car ratings (user's request, 2026-10-07): entered by admins from their own knowledge (the team
-- drives too few cars to rate them from its laps), shown on the Cars page next to the team's own
-- telemetry and the reference times. Each sub-rating 0-100, null = not rated yet; the overall rating
-- is their average (web/lib/cars.ts). The texts of each sub-rating: web/lib/cars.ts CAR_PARTS.
create table if not exists car_rating (
    car_key       text primary key,          -- ACC car model key
    top_speed     smallint check (top_speed between 0 and 100),
    acceleration  smallint check (acceleration between 0 and 100),
    traction      smallint check (traction between 0 and 100),
    slow_corners  smallint check (slow_corners between 0 and 100),
    fast_corners  smallint check (fast_corners between 0 and 100),
    braking       smallint check (braking between 0 and 100),
    tyre_wear     smallint check (tyre_wear between 0 and 100),
    driveability  smallint check (driveability between 0 and 100),
    note          text,                      -- strengths, weaknesses, tips
    source        text,                      -- where the ratings come from (own knowledge, a sheet, a video)
    updated_by    bigint references driver on delete set null,
    updated_at    timestamptz not null default now()
);
