-- Read-only scoring projection. Preserve raw sessions/laps/ratings, including legacy uploads.
-- Catalogue snapshot: update this projection in a new migration when adding ACC tracks/cars.
create view acc_rating_evidence as
select r.*, s.track_id, coalesce(s.recorded_at, s.uploaded_at) as score_at
from driver_rating r join session s on s.id = r.session_id
join track t on t.id = s.track_id left join car c on c.id = s.car_id
where t.simulator = 'acc' and lower(t.key) in ('barcelona', 'brands_hatch', 'cota', 'donington', 'hungaroring', 'imola', 'indianapolis', 'kyalami', 'laguna_seca', 'misano', 'monza', 'mount_panorama', 'nurburgring', 'nurburgring_24h', 'oulton_park', 'paul_ricard', 'red_bull_ring', 'silverstone', 'snetterton', 'spa', 'suzuka', 'valencia', 'watkins_glen', 'zandvoort', 'zolder')
  and (s.car_id is null or (c.simulator = 'acc' and lower(c.key) in ('ford_mustang_gt3', 'mclaren_720s_gt3_evo', 'ferrari_296_gt3', 'porsche_992_gt3_r', 'lamborghini_huracan_gt3_evo2', 'audi_r8_lms_evo_ii', 'bmw_m4_gt3', 'mercedes_amg_gt3_evo', 'ferrari_488_gt3_evo', 'amr_v8_vantage_gt3', 'audi_r8_lms_evo', 'honda_nsx_gt3_evo', 'lamborghini_huracan_gt3_evo', 'mclaren_720s_gt3', 'porsche_991ii_gt3_r', 'bentley_continental_gt3_2018', 'ferrari_488_gt3', 'nissan_gt_r_gt3_2018', 'porsche_991_gt3_r', 'bmw_m6_gt3', 'honda_nsx_gt3', 'lamborghini_gallardo_rex', 'lexus_rc_f_gt3', 'nissan_gt_r_gt3_2017', 'bentley_continental_gt3_2016', 'audi_r8_lms', 'lamborghini_huracan_gt3', 'mclaren_650s_gt3', 'mercedes_amg_gt3', 'amr_v12_vantage_gt3', 'jaguar_g3', 'porsche_718_cayman_gt4_mr', 'alpine_a110_gt4', 'amr_v8_vantage_gt4', 'audi_r8_gt4', 'bmw_m4_gt4', 'chevrolet_camaro_gt4r', 'ktm_xbow_gt4', 'maserati_mc_gt4', 'mclaren_570s_gt4', 'mercedes_amg_gt4', 'ginetta_g55_gt4', 'porsche_992_gt3_cup', 'lamborghini_huracan_st_evo2', 'bmw_m2_cs_racing', 'ferrari_488_challenge_evo', 'porsche_991ii_gt3_cup', 'lamborghini_huracan_st', 'maserati_mc20_gt2', 'mercedes_amg_gt2', 'audi_r8_lms_gt2', 'ktm_xbow_gt2', 'porsche_991ii_gt2_rs_cs_evo', 'porsche_935')));

-- Reconstruct the existing 60-day / 5-lap / best-session-per-track formula using
-- eligible evidence only. Old cached overall ratings may contain foreign sessions.
create function acc_score_at(p_driver_id bigint, p_rating_id bigint) returns real
language sql stable as $score$
  with mine as (
    select id, track_id, session_score, laps, score_at
    from acc_rating_evidence where driver_id = p_driver_id and id <= p_rating_id
  ), win as (
    select * from mine where score_at > (select max(score_at) from mine) - interval '60 days'
  ), pool as (
    select * from win where laps >= 5 or not exists (select 1 from win where laps >= 5)
  ), best as (
    select distinct on (track_id) session_score from pool order by track_id, session_score desc, id desc
  ) select avg(session_score)::real from best;
$score$;

create view acc_driver_rating as
select r.id, r.driver_id, r.session_id, acc_score_at(r.driver_id, r.id) as rating,
       r.session_score, r.pace, r.consistency, r.clean, r.smoothness, r.laps, r.created_at
from acc_rating_evidence r;
