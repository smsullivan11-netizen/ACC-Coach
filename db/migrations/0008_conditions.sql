-- Track conditions of a session, sent by the app from 0.1.2 (recording.session_conditions):
-- {air_c: [start, end], track_c: [start, end], grip, grip_worst, rain, wind_kmh, time_of_day}
alter table session add column conditions jsonb;
