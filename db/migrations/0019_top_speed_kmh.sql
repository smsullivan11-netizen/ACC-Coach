-- The two Top speed numbers are now absolute speeds in km/h (user's request, 2026-10-08: min wing and max
-- wing), not 0-100 ratings: 0018's checks (0-100) are replaced.
alter table car_rating drop constraint if exists car_rating_top_speed_min_wing_check;
alter table car_rating drop constraint if exists car_rating_top_speed_max_wing_check;
alter table car_rating add constraint car_rating_top_speed_min_wing_kmh check (top_speed_min_wing between 100 and 500);
alter table car_rating add constraint car_rating_top_speed_max_wing_kmh check (top_speed_max_wing between 100 and 500);
