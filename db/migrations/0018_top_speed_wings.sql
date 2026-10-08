-- Top speed's two small numbers (user's request, 2026-10-08): the rating at min wing and at max wing,
-- shown in grey under the Top speed rating (Cars page). Each 0-100; the Top speed rating itself stays
-- its own number (when it is left empty and both are given, their average is stored in its place).
alter table car_rating add column if not exists top_speed_min_wing smallint check (top_speed_min_wing between 0 and 100);
alter table car_rating add column if not exists top_speed_max_wing smallint check (top_speed_max_wing between 0 and 100);
