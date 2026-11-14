-- Read-only review. Never merge ACU Unitedstates into ACC COTA or delete sessions automatically.
-- The old client hard-coded simulator=acc, so catalogue mismatches are evidence for review;
-- matching names alone cannot prove that an old recording really came from ACC.
select s.id as session_id, d.display_name as driver, t.simulator, t.key as track,
       c.key as car, s.source_file, s.recorded_at, s.uploaded_at,
       case when t.simulator <> 'acc' then 'different_simulator'
            when lower(t.key) not in ('barcelona', 'brands_hatch', 'cota', 'donington', 'hungaroring', 'imola', 'indianapolis', 'kyalami', 'laguna_seca', 'misano', 'monza', 'mount_panorama', 'nurburgring', 'nurburgring_24h', 'oulton_park', 'paul_ricard', 'red_bull_ring', 'silverstone', 'snetterton', 'spa', 'suzuka', 'valencia', 'watkins_glen', 'zandvoort', 'zolder') then 'unsupported_acc_track'
            else 'unsupported_acc_car' end as review_reason
from session s join driver d on d.id = s.driver_id join track t on t.id = s.track_id
left join car c on c.id = s.car_id
where t.simulator <> 'acc'
   or lower(t.key) not in ('barcelona', 'brands_hatch', 'cota', 'donington', 'hungaroring', 'imola', 'indianapolis', 'kyalami', 'laguna_seca', 'misano', 'monza', 'mount_panorama', 'nurburgring', 'nurburgring_24h', 'oulton_park', 'paul_ricard', 'red_bull_ring', 'silverstone', 'snetterton', 'spa', 'suzuka', 'valencia', 'watkins_glen', 'zandvoort', 'zolder')
   or (c.key is not null and lower(c.key) not in ('alpine_a110_gt4', 'amr_v12_vantage_gt3', 'amr_v8_vantage_gt3', 'amr_v8_vantage_gt4', 'audi_r8_gt4', 'audi_r8_lms', 'audi_r8_lms_evo', 'audi_r8_lms_evo_ii', 'audi_r8_lms_gt2', 'bentley_continental_gt3_2016', 'bentley_continental_gt3_2018', 'bmw_m2_cs_racing', 'bmw_m4_gt3', 'bmw_m4_gt4', 'bmw_m6_gt3', 'chevrolet_camaro_gt4r', 'ferrari_296_gt3', 'ferrari_488_challenge_evo', 'ferrari_488_gt3', 'ferrari_488_gt3_evo', 'ford_mustang_gt3', 'ginetta_g55_gt4', 'honda_nsx_gt3', 'honda_nsx_gt3_evo', 'jaguar_g3', 'ktm_xbow_gt2', 'ktm_xbow_gt4', 'lamborghini_gallardo_rex', 'lamborghini_huracan_gt3', 'lamborghini_huracan_gt3_evo', 'lamborghini_huracan_gt3_evo2', 'lamborghini_huracan_st', 'lamborghini_huracan_st_evo2', 'lexus_rc_f_gt3', 'maserati_mc20_gt2', 'maserati_mc_gt4', 'mclaren_570s_gt4', 'mclaren_650s_gt3', 'mclaren_720s_gt3', 'mclaren_720s_gt3_evo', 'mercedes_amg_gt2', 'mercedes_amg_gt3', 'mercedes_amg_gt3_evo', 'mercedes_amg_gt4', 'nissan_gt_r_gt3_2017', 'nissan_gt_r_gt3_2018', 'porsche_718_cayman_gt4_mr', 'porsche_935', 'porsche_991_gt3_r', 'porsche_991ii_gt2_rs_cs_evo', 'porsche_991ii_gt3_cup', 'porsche_991ii_gt3_r', 'porsche_992_gt3_cup', 'porsche_992_gt3_r'))
order by s.uploaded_at desc;
