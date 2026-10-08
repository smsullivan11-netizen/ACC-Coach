// The cars of ACC and their ratings (Cars page, user's request 2026-10-07). Safe on server and client.
// Ratings are entered by admins (table car_rating, migration 0016): the team drives too few cars to
// rate them from its own laps. Overall = average of the sub-ratings that are filled in.

export type CarClass = "GT3" | "GT4" | "Cup" | "GT2";
export type CarInfo = { key: string; name: string; year: number; cls: CarClass };

// ACC's car model keys (the game's carModel string), with the names and model years the game shows
export const CARS: CarInfo[] = [
  { key: "ford_mustang_gt3", name: "Ford Mustang GT3", year: 2024, cls: "GT3" },
  { key: "mclaren_720s_gt3_evo", name: "McLaren 720S GT3 Evo", year: 2023, cls: "GT3" },
  { key: "ferrari_296_gt3", name: "Ferrari 296 GT3", year: 2023, cls: "GT3" },
  { key: "porsche_992_gt3_r", name: "Porsche 992 GT3 R", year: 2023, cls: "GT3" },
  { key: "lamborghini_huracan_gt3_evo2", name: "Lamborghini Huracán GT3 EVO2", year: 2023, cls: "GT3" },
  { key: "audi_r8_lms_evo_ii", name: "Audi R8 LMS GT3 evo II", year: 2022, cls: "GT3" },
  { key: "bmw_m4_gt3", name: "BMW M4 GT3", year: 2022, cls: "GT3" },
  { key: "mercedes_amg_gt3_evo", name: "Mercedes-AMG GT3", year: 2020, cls: "GT3" },
  { key: "ferrari_488_gt3_evo", name: "Ferrari 488 GT3 Evo", year: 2020, cls: "GT3" },
  { key: "amr_v8_vantage_gt3", name: "Aston Martin V8 Vantage GT3", year: 2019, cls: "GT3" },
  { key: "audi_r8_lms_evo", name: "Audi R8 LMS Evo", year: 2019, cls: "GT3" },
  { key: "honda_nsx_gt3_evo", name: "Honda NSX GT3 Evo", year: 2019, cls: "GT3" },
  { key: "lamborghini_huracan_gt3_evo", name: "Lamborghini Huracán GT3 Evo", year: 2019, cls: "GT3" },
  { key: "mclaren_720s_gt3", name: "McLaren 720S GT3", year: 2019, cls: "GT3" },
  { key: "porsche_991ii_gt3_r", name: "Porsche 991 II GT3 R", year: 2019, cls: "GT3" },
  { key: "bentley_continental_gt3_2018", name: "Bentley Continental GT3", year: 2018, cls: "GT3" },
  { key: "ferrari_488_gt3", name: "Ferrari 488 GT3", year: 2018, cls: "GT3" },
  { key: "nissan_gt_r_gt3_2018", name: "Nissan GT-R Nismo GT3", year: 2018, cls: "GT3" },
  { key: "porsche_991_gt3_r", name: "Porsche 991 GT3 R", year: 2018, cls: "GT3" },
  { key: "bmw_m6_gt3", name: "BMW M6 GT3", year: 2017, cls: "GT3" },
  { key: "honda_nsx_gt3", name: "Honda NSX GT3", year: 2017, cls: "GT3" },
  { key: "lamborghini_gallardo_rex", name: "Reiter Engineering R-EX GT3", year: 2017, cls: "GT3" },
  { key: "lexus_rc_f_gt3", name: "Lexus RC F GT3", year: 2016, cls: "GT3" },
  { key: "nissan_gt_r_gt3_2017", name: "Nissan GT-R Nismo GT3", year: 2015, cls: "GT3" },
  { key: "bentley_continental_gt3_2016", name: "Bentley Continental GT3", year: 2015, cls: "GT3" },
  { key: "audi_r8_lms", name: "Audi R8 LMS", year: 2015, cls: "GT3" },
  { key: "lamborghini_huracan_gt3", name: "Lamborghini Huracán GT3", year: 2015, cls: "GT3" },
  { key: "mclaren_650s_gt3", name: "McLaren 650S GT3", year: 2015, cls: "GT3" },
  { key: "mercedes_amg_gt3", name: "Mercedes-AMG GT3", year: 2015, cls: "GT3" },
  { key: "amr_v12_vantage_gt3", name: "Aston Martin V12 Vantage GT3", year: 2013, cls: "GT3" },
  { key: "jaguar_g3", name: "Emil Frey Jaguar G3", year: 2012, cls: "GT3" },

  { key: "porsche_718_cayman_gt4_mr", name: "Porsche 718 Cayman GT4 Clubsport", year: 2019, cls: "GT4" },
  { key: "alpine_a110_gt4", name: "Alpine A110 GT4", year: 2018, cls: "GT4" },
  { key: "amr_v8_vantage_gt4", name: "Aston Martin Vantage GT4", year: 2018, cls: "GT4" },
  { key: "audi_r8_gt4", name: "Audi R8 LMS GT4", year: 2018, cls: "GT4" },
  { key: "bmw_m4_gt4", name: "BMW M4 GT4", year: 2018, cls: "GT4" },
  { key: "chevrolet_camaro_gt4r", name: "Chevrolet Camaro GT4.R", year: 2017, cls: "GT4" },
  { key: "ktm_xbow_gt4", name: "KTM X-Bow GT4", year: 2016, cls: "GT4" },
  { key: "maserati_mc_gt4", name: "Maserati MC GT4", year: 2016, cls: "GT4" },
  { key: "mclaren_570s_gt4", name: "McLaren 570S GT4", year: 2016, cls: "GT4" },
  { key: "mercedes_amg_gt4", name: "Mercedes-AMG GT4", year: 2016, cls: "GT4" },
  { key: "ginetta_g55_gt4", name: "Ginetta G55 GT4", year: 2012, cls: "GT4" },

  { key: "porsche_992_gt3_cup", name: "Porsche 992 GT3 Cup", year: 2021, cls: "Cup" },
  { key: "lamborghini_huracan_st_evo2", name: "Lamborghini Huracán Super Trofeo EVO2", year: 2021, cls: "Cup" },
  { key: "bmw_m2_cs_racing", name: "BMW M2 CS Racing", year: 2020, cls: "Cup" },
  { key: "ferrari_488_challenge_evo", name: "Ferrari 488 Challenge Evo", year: 2020, cls: "Cup" },
  { key: "porsche_991ii_gt3_cup", name: "Porsche 991 II GT3 Cup", year: 2017, cls: "Cup" },
  { key: "lamborghini_huracan_st", name: "Lamborghini Huracán Super Trofeo", year: 2015, cls: "Cup" },

  { key: "maserati_mc20_gt2", name: "Maserati MC20 GT2", year: 2023, cls: "GT2" },
  { key: "mercedes_amg_gt2", name: "Mercedes-AMG GT2", year: 2023, cls: "GT2" },
  { key: "audi_r8_lms_gt2", name: "Audi R8 LMS GT2", year: 2021, cls: "GT2" },
  { key: "ktm_xbow_gt2", name: "KTM X-Bow GT2", year: 2021, cls: "GT2" },
  { key: "porsche_991ii_gt2_rs_cs_evo", name: "Porsche 911 GT2 RS CS Evo", year: 2019, cls: "GT2" },
  { key: "porsche_935", name: "Porsche 935", year: 2019, cls: "GT2" },
];
export const CLASSES: CarClass[] = ["GT3", "GT4", "Cup", "GT2"];
export const carInfo = (key: string) => CARS.find((c) => c.key === key);
/** "Ford Mustang GT3" (with the year when another car has the same name: "Mercedes-AMG GT3 2015"). */
export function carName(key: string) {
  const c = carInfo(key);
  if (!c) return key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return CARS.some((o) => o.key !== key && o.name === c.name) ? `${c.name} ${c.year}` : c.name;
}

// The sub-ratings and their "i" texts (the user's list and wording, 2026-10-07)
export const CAR_PARTS = [
  { key: "top_speed", label: "Top speed", info: "Top speed on the straights, from min wing to max wing. The two small grey numbers are the absolute top speed in km/h at min wing and at max wing." },
  { key: "acceleration", label: "Acceleration", info: "Mid to high speed acceleration: pure power acceleration." },
  { key: "traction", label: "Traction", info: "Low-end acceleration and rear grip on corner exit." },
  { key: "slow_corners", label: "Slow corners", info: "How fast and nimble the car is in low-speed corners." },
  { key: "fast_corners", label: "Fast corners", info: "How fast and planted the car is on high-speed portions." },
  { key: "braking", label: "Braking", info: "Brake performance and stopping power." },
  { key: "tyre_wear", label: "Tyre wear", info: "How well the car keeps up the pace during a longer stint." },
  { key: "driveability", label: "Driveability", info: "Ease of driving." },
] as const;
export type CarPart = (typeof CAR_PARTS)[number]["key"];
/** The two small grey numbers under Top speed: the absolute top speed in km/h at min wing and at max wing
 *  (migrations 0018 and 0019). */
export const TOP_SPEED_WINGS = [
  { key: "top_speed_min_wing", label: "Min wing", unit: "km/h" },
  { key: "top_speed_max_wing", label: "Max wing", unit: "km/h" },
] as const;
export type WingKey = (typeof TOP_SPEED_WINGS)[number]["key"];
export const OVERALL_INFO = "Performance in the right hands: the average of the sub-ratings filled in, driveability left out (it shows as stars: a hard car to drive can still be one of the fastest). Entered by the team's admins from their knowledge of the cars, not computed from laps: the team drives too few cars for that.";

/** Average of the performance sub-ratings filled in (driveability left out, user's choice 2026-10-08:
 *  the Porsche 992 or the Huracán EVO2 are hard to drive but among the fastest when driven well);
 *  null when none is. */
export function overall(r: Partial<Record<CarPart, number | null>> | null | undefined): number | null {
  const v = CAR_PARTS.filter((p) => p.key !== "driveability").map((p) => r?.[p.key]).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
