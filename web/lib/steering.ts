// Lock-to-lock steering angle (°) per car (full left to full right), from Coach Dave Academy's
// "Correct steering locks and ratios in ACC" (checked by the team in game: Ford Mustang GT3 516°,
// McLaren 720S GT3 Evo 480°). Same table as acc_shm.py STEER_LOCK_DEG.
// The site always derives the steering wheel angle from the raw input (steering_norm, −1…1):
// norm × lock / 2. The app's own `steering_deg` is not used: up to app 0.1.5 it was half the real
// angle (Kunos's official table gives the angle to each side, and it was taken as lock to lock).
export const STEER_LOCK_DEG: Record<string, number> = {
  amr_v12_vantage_gt3: 640,
  amr_v8_vantage_gt3: 640,
  audi_r8_lms: 720,
  audi_r8_lms_evo: 720,
  audi_r8_lms_evo_ii: 720,
  bentley_continental_gt3_2016: 640,
  bentley_continental_gt3_2018: 640,
  bmw_m6_gt3: 565,
  bmw_m4_gt3: 516,
  jaguar_g3: 720,
  ferrari_488_gt3: 480,
  ferrari_488_gt3_evo: 480,
  ferrari_296_gt3: 800,
  ford_mustang_gt3: 516,
  honda_nsx_gt3: 620,
  honda_nsx_gt3_evo: 450,
  lamborghini_huracan_gt3: 620,
  lamborghini_huracan_gt3_evo: 620,
  lamborghini_huracan_gt3_evo2: 620,
  lamborghini_gallardo_rex: 720,
  lexus_rc_f_gt3: 640,
  mclaren_650s_gt3: 480,
  mclaren_720s_gt3: 480,
  mclaren_720s_gt3_evo: 480,
  mercedes_amg_gt3: 640,
  mercedes_amg_gt3_evo: 640,
  nissan_gt_r_gt3_2017: 640,
  nissan_gt_r_gt3_2018: 640,
  porsche_991_gt3_r: 800,
  porsche_991ii_gt3_r: 800,
  porsche_992_gt3_r: 800,
  alpine_a110_gt4: 720,
  amr_v8_vantage_gt4: 640,
  audi_r8_gt4: 720,
  bmw_m4_gt4: 500,
  chevrolet_camaro_gt4r: 720,
  ginetta_g55_gt4: 720,
  ktm_xbow_gt4: 580,
  maserati_mc_gt4: 900,
  mclaren_570s_gt4: 480,
  mercedes_amg_gt4: 500,
  porsche_718_cayman_gt4_mr: 800,
  lamborghini_huracan_st: 620,
  lamborghini_huracan_st_evo2: 620,
  porsche_991ii_gt3_cup: 800,
  porsche_992_gt3_cup: 540,
  bmw_m2_cs_racing: 360,
  ferrari_488_challenge_evo: 480,
  audi_r8_lms_gt2: 720,
  ktm_xbow_gt2: 582,
  maserati_mc20_gt2: 480,
  mercedes_amg_gt2: 492,
  porsche_991ii_gt2_rs_cs_evo: 720,
  porsche_935: 720,
};

/** Sets `steering_deg` (steering wheel angle, °, positive = right) from the raw input when the car's
 *  lock is known; otherwise drops the app's value (the charts then show % of lock). Traces without
 *  the raw input (MoTeC imports: the game's own angle) are left as they are. */
export function withSteeringDeg(channels: Record<string, Float64Array>, car: string | null) {
  const lock = car ? STEER_LOCK_DEG[car] : undefined;
  const norm = channels.steering_norm;
  if (!norm) return channels;
  const out = { ...channels };
  if (lock) out.steering_deg = norm.map((v) => (v * lock) / 2);
  else delete out.steering_deg;
  return out;
}
