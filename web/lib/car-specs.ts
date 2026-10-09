// The real cars' specs for the car page's showroom (user's request, 2026-10-09): researched from the
// makers' and teams' own pages, Wikipedia and the motorsport press, each car with its sources. Power
// and weight are the makers' figures: in a race the BoP changes both. A racing record was shown first
// and dropped (user's choice). Cars without an entry show "Specs to come". Safe on server and client.

export type CarSpecs = {
  engine: string;          // e.g. "5.4 L V8"
  aspiration?: "Naturally aspirated" | "Twin-turbo" | "Turbo";
  displacement?: number;   // cc
  power?: string;          // e.g. "≈ 565 hp"
  weight?: string;         // e.g. "≈ 1,250 kg"
  gearbox?: string;
  layout: string;          // e.g. "Front-mid engine, RWD"
  debut?: string;          // first race
  builder?: string;
  sources: { label: string; url: string }[];
};

const WIKI = (page: string) => ({ label: "Wikipedia", url: `https://en.wikipedia.org/wiki/${page}` });

// Figures not found in a source are left out (the HUD skips them) rather than guessed.
export const CAR_SPECS: Record<string, CarSpecs> = {
  ford_mustang_gt3: {
    engine: "5.4 L V8 (Coyote)", aspiration: "Naturally aspirated", displacement: 5400,
    weight: "≈ 1,289 kg", gearbox: "Xtrac 6-speed sequential", layout: "Front-mid engine, RWD",
    debut: "Daytona 24h, January 2024", builder: "Multimatic and Ford Performance (engine by M-Sport)",
    sources: [
      { label: "Multimatic Motorsports", url: "https://www.multimaticmotorsports.com/cars/mustang-gt3/" },
    ],
  },
  porsche_992_gt3_r: {
    engine: "4.2 L flat-six", aspiration: "Naturally aspirated", displacement: 4194,
    power: "≈ 565 hp", weight: "≈ 1,250 kg", gearbox: "Porsche 6-speed sequential", layout: "Rear engine, RWD",
    debut: "Daytona 24h, January 2023", builder: "Porsche Motorsport",
    sources: [
      { label: "Porsche Motorsport", url: "https://racing.porsche.com/en-NZ/cars/911-gt3-r-992" },
    ],
  },
  bmw_m4_gt3: {
    engine: "3.0 L inline-six (P58)", aspiration: "Twin-turbo", displacement: 2993,
    power: "up to 590 hp", gearbox: "Xtrac 6-speed sequential", layout: "Front-mid engine, RWD",
    debut: "2022 season", builder: "BMW M Motorsport",
    sources: [
      { label: "BMW Group Press", url: "https://www.press.bmwgroup.com/usa/article/detail/T0334417EN_US/bmw-m-motorsports-presents-the-new-bmw-m4-gt3" },
      { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/BMW_M4_GT3" },
    ],
  },
  lamborghini_huracan_gt3_evo2: {
    engine: "5.2 L V10", aspiration: "Naturally aspirated", displacement: 5204,
    weight: "≈ 1,230 kg", gearbox: "Xtrac 6-speed sequential", layout: "Mid engine, RWD",
    debut: "Daytona 24h, January 2023", builder: "Lamborghini Squadra Corse",
    sources: [
      { label: "Wayne Taylor Racing", url: "https://waynetaylorracing.com/customer/carspecs/gtd" },
    ],
  },

  // GT3 (2026-10-09, the remaining 27)
  mclaren_720s_gt3_evo: {
    engine: "4.0 L V8 (M840T)", aspiration: "Twin-turbo", displacement: 3994,
    gearbox: "6-speed sequential", layout: "Mid engine, RWD",
    debut: "2023 season", builder: "McLaren Customer Racing",
    sources: [WIKI("McLaren_720S_GT3"), { label: "GTPlanet", url: "https://www.gtplanet.net/?p=80917" }],
  },
  mclaren_720s_gt3: {
    engine: "4.0 L V8 (M840T)", aspiration: "Twin-turbo", displacement: 3994,
    gearbox: "6-speed sequential", layout: "Mid engine, RWD",
    debut: "2019 season", builder: "McLaren Customer Racing",
    sources: [WIKI("McLaren_720S_GT3"), { label: "GTPlanet", url: "https://www.gtplanet.net/?p=80917" }],
  },
  ferrari_296_gt3: {
    engine: "3.0 L V6 (120°)", aspiration: "Twin-turbo", displacement: 2992,
    power: "≈ 600 hp", weight: "≈ 1,250 kg", gearbox: "Xtrac 6-speed sequential (transverse)", layout: "Mid engine, RWD",
    debut: "Daytona 24h, January 2023", builder: "Ferrari Competizioni GT",
    sources: [WIKI("Ferrari_296_GT3"), { label: "Ferrari Owners' Club", url: "https://www.ferrariownersclub.co.uk/ferrari-296-gt3-a-v6-for-a-new-sporting-history/" }],
  },
  audi_r8_lms_evo_ii: {
    engine: "5.2 L V10", aspiration: "Naturally aspirated", displacement: 5204,
    power: "up to 585 hp", weight: "≈ 1,235 kg", gearbox: "6-speed sequential", layout: "Mid engine, RWD",
    debut: "2022 season", builder: "Audi Sport customer racing",
    sources: [{ label: "Audi Sport", url: "https://audi.com/en/sport/motorsport/audi-racing-models/r8-lms-gt3.html" }],
  },
  audi_r8_lms_evo: {
    engine: "5.2 L V10", aspiration: "Naturally aspirated", displacement: 5204,
    power: "up to 585 hp", weight: "≈ 1,225 kg", gearbox: "6-speed sequential", layout: "Mid engine, RWD",
    debut: "2019 season", builder: "Audi Sport customer racing",
    sources: [{ label: "The Arsenale", url: "https://thearsenale.com/blogs/magazine/2019-audi-r8-lms-gt3-evo" }],
  },
  audi_r8_lms: {
    engine: "5.2 L V10", aspiration: "Naturally aspirated", displacement: 5204,
    power: "≈ 585 hp", weight: "≈ 1,225 kg", gearbox: "6-speed sequential", layout: "Mid engine, RWD",
    debut: "2015 season", builder: "Audi Sport customer racing",
    sources: [{ label: "Supercars.net", url: "https://www.supercars.net/blog/2016-audi-r8-lms/" }],
  },
  mercedes_amg_gt3_evo: {
    engine: "6.2 L V8 (M159)", aspiration: "Naturally aspirated", displacement: 6208,
    power: "≈ 550 hp", weight: "≈ 1,290 kg", gearbox: "Hewland 6-speed sequential (transaxle)", layout: "Front-mid engine, RWD",
    debut: "2020 season", builder: "Mercedes-AMG Customer Racing",
    sources: [WIKI("Mercedes-AMG_GT3"), { label: "Mercedes-AMG", url: "https://www.mercedes-amg.com/en/home/vehicles/customer-racing/mercedes-amg-gt3/mercedes-amg-gt3.html" }],
  },
  mercedes_amg_gt3: {
    engine: "6.2 L V8 (M159)", aspiration: "Naturally aspirated", displacement: 6208,
    power: "≈ 550 hp", weight: "≈ 1,290 kg", gearbox: "Hewland 6-speed sequential (transaxle)", layout: "Front-mid engine, RWD",
    debut: "2016 season", builder: "Mercedes-AMG Customer Racing",
    sources: [WIKI("Mercedes-AMG_GT3"), { label: "GTspirit", url: "https://gtspirit.com/2015/02/27/official-2016-mercedes-amg-gt3/" }],
  },
  ferrari_488_gt3_evo: {
    engine: "3.9 L V8", aspiration: "Twin-turbo", displacement: 3902,
    power: "≈ 600 hp", layout: "Mid engine, RWD",
    debut: "2020 season", builder: "Ferrari Competizioni GT",
    sources: [WIKI("Ferrari_488_GT3")],
  },
  ferrari_488_gt3: {
    engine: "3.9 L V8", aspiration: "Twin-turbo", displacement: 3902,
    layout: "Mid engine, RWD",
    debut: "Albert Park (Australian GT), March 2016", builder: "Ferrari Competizioni GT",
    sources: [WIKI("Ferrari_488_GT3")],
  },
  amr_v8_vantage_gt3: {
    engine: "4.0 L V8 (Mercedes-AMG M177)", aspiration: "Twin-turbo", displacement: 3982,
    power: "≈ 535 hp", weight: "≈ 1,245 kg", gearbox: "Xtrac 6-speed sequential", layout: "Front-mid engine, RWD",
    debut: "Nürburgring 24h, 2019", builder: "Aston Martin Racing",
    sources: [WIKI("Aston_Martin_Vantage_AMR_GT3")],
  },
  amr_v12_vantage_gt3: {
    engine: "6.0 L V12", aspiration: "Naturally aspirated", displacement: 5935,
    power: "≈ 600 hp", weight: "≈ 1,250 kg", gearbox: "Xtrac 6-speed sequential", layout: "Front-mid engine, RWD",
    debut: "2012 season", builder: "Aston Martin Racing",
    sources: [{ label: "Racecar.com", url: "https://www.racecar.com/news/43769/motorsport/aston-martin-confirms-specification-of-2012-vantage-gt3-race-car" }],
  },
  honda_nsx_gt3_evo: {
    engine: "3.5 L V6", aspiration: "Twin-turbo", displacement: 3493,
    gearbox: "Xtrac 6-speed sequential", layout: "Mid engine, RWD",
    debut: "2019 season", builder: "Honda Performance Development and JAS Motorsport",
    sources: [WIKI("Honda_NSX_GT3"), { label: "JAS Motorsport", url: "https://jasmotorsport.com/news/nsx-gt3-evo-to-compete-globally-in-2019" }],
  },
  honda_nsx_gt3: {
    engine: "3.5 L V6", aspiration: "Twin-turbo", displacement: 3493,
    gearbox: "Xtrac 6-speed sequential", layout: "Mid engine, RWD",
    debut: "Daytona 24h, January 2017", builder: "Honda Performance Development and JAS Motorsport",
    sources: [WIKI("Honda_NSX_GT3")],
  },
  lamborghini_huracan_gt3_evo: {
    engine: "5.2 L V10", aspiration: "Naturally aspirated", displacement: 5204,
    power: "≈ 580 hp", weight: "≈ 1,230 kg", gearbox: "Xtrac 6-speed sequential", layout: "Mid engine, RWD",
    debut: "Daytona 24h, January 2019", builder: "Lamborghini Squadra Corse",
    sources: [WIKI("Lamborghini_Hurac%C3%A1n_GT3")],
  },
  lamborghini_huracan_gt3: {
    engine: "5.2 L V10", aspiration: "Naturally aspirated", displacement: 5204,
    power: "≈ 520 hp", weight: "≈ 1,230 kg", gearbox: "Xtrac 6-speed sequential", layout: "Mid engine, RWD",
    debut: "Monza (Blancpain Endurance), 2015", builder: "Lamborghini Squadra Corse, with Dallara",
    sources: [WIKI("Lamborghini_Hurac%C3%A1n_GT3")],
  },
  porsche_991ii_gt3_r: {
    engine: "4.0 L flat-six", aspiration: "Naturally aspirated", displacement: 3996,
    gearbox: "6-speed sequential", layout: "Rear engine, RWD",
    debut: "2019 season", builder: "Porsche Motorsport",
    sources: [WIKI("Porsche_911_GT3_R")],
  },
  porsche_991_gt3_r: {
    engine: "4.0 L flat-six", aspiration: "Naturally aspirated", displacement: 3996,
    power: "≈ 500 hp", gearbox: "6-speed sequential", layout: "Rear engine, RWD",
    debut: "2016 season", builder: "Porsche Motorsport",
    sources: [WIKI("Porsche_911_GT3_R")],
  },
  bentley_continental_gt3_2018: {
    engine: "4.0 L V8", aspiration: "Twin-turbo", displacement: 3996,
    power: "over 550 hp", weight: "under 1,300 kg", gearbox: "Ricardo 6-speed sequential", layout: "Front-mid engine, RWD",
    debut: "Monza (Blancpain Endurance), April 2018", builder: "Bentley Motorsport and M-Sport",
    sources: [{ label: "Supercars.net", url: "https://www.supercars.net/blog/2018-bentley-continental-gt3" }, { label: "Bentley Motorsport", url: "https://justbritish.com/?p=17894" }],
  },
  bentley_continental_gt3_2016: {
    engine: "4.0 L V8", aspiration: "Twin-turbo", displacement: 3996,
    gearbox: "Xtrac 6-speed sequential", layout: "Front-mid engine, RWD",
    debut: "2014 season", builder: "Bentley Motorsport and M-Sport",
    sources: [{ label: "Supercars.net", url: "https://www.supercars.net/blog/2018-bentley-continental-gt3" }],
  },
  nissan_gt_r_gt3_2018: {
    engine: "3.8 L V6 (VR38DETT)", aspiration: "Twin-turbo", displacement: 3799,
    power: "≈ 550-600 PS", weight: "≈ 1,285 kg", gearbox: "Ricardo 6-speed sequential", layout: "Front-mid engine, RWD",
    debut: "2018 season", builder: "Nismo",
    sources: [WIKI("Nissan_GT-R_Nismo_GT3")],
  },
  nissan_gt_r_gt3_2017: {
    engine: "3.8 L V6 (VR38DETT)", aspiration: "Twin-turbo", displacement: 3799,
    power: "≈ 530-600 PS", weight: "≈ 1,300 kg", gearbox: "Ricardo 6-speed sequential", layout: "Front-mid engine, RWD",
    debut: "2015 season", builder: "Nismo",
    sources: [WIKI("Nissan_GT-R_Nismo_GT3")],
  },
  bmw_m6_gt3: {
    engine: "4.4 L V8 (S63)", aspiration: "Twin-turbo", displacement: 4395,
    power: "up to 585 hp", weight: "under 1,300 kg", gearbox: "6-speed sequential (transaxle)", layout: "Front-mid engine, RWD",
    debut: "2016 season", builder: "BMW Motorsport",
    sources: [{ label: "BMW Group Press", url: "https://www.press.bmwgroup.com/global/article/detail/T0233703EN/cutting-a-powerful-figure:-bmw-presents-the-bmw-m6-gt3-at-the-iaa-cars-2015-in-frankfurt" }, WIKI("BMW_M6_GT3")],
  },
  lamborghini_gallardo_rex: {
    engine: "5.2 L V10 (Lamborghini)", aspiration: "Naturally aspirated", displacement: 5204,
    layout: "Mid engine, RWD", builder: "Reiter Engineering (Gallardo-based)",
    sources: [{ label: "Lambocars", url: "https://lambocars.com/gallardo-lp560-gt3/" }],
  },
  lexus_rc_f_gt3: {
    engine: "5.4 L V8 (2UR-GSE, re-stroked)", aspiration: "Naturally aspirated",
    power: "over 500 hp", weight: "≈ 1,300 kg", gearbox: "6-speed sequential", layout: "Front engine, RWD",
    debut: "Daytona 24h, January 2017", builder: "Lexus, with Technocraft",
    sources: [WIKI("Lexus_RC_F_GT3")],
  },
  mclaren_650s_gt3: {
    engine: "3.8 L V8 (M838T)", aspiration: "Twin-turbo", displacement: 3799,
    power: "≈ 500 PS", gearbox: "6-speed sequential", layout: "Mid engine, RWD",
    debut: "2015 season", builder: "McLaren GT, with CRS Racing",
    sources: [WIKI("McLaren_650S_GT3")],
  },
  jaguar_g3: {
    engine: "5.0 L V8 (built by Ilmor)",
    gearbox: "Hewland 6-speed sequential", layout: "Front-mid engine, RWD",
    debut: "Blancpain Endurance Series, 2012", builder: "Emil Frey Racing (Jaguar XK-based)",
    sources: [WIKI("Emil_Frey_Racing"), { label: "Autosprint", url: "https://www.autosprint.ch/en/?p=1613" }],
  },

  // Cup, Super Trofeo and Challenge cars
  porsche_992_gt3_cup: {
    engine: "4.0 L flat-six", aspiration: "Naturally aspirated", displacement: 3996,
    power: "510 PS", weight: "1,260 kg (with driver)", gearbox: "Porsche 6-speed sequential", layout: "Rear engine, RWD",
    debut: "Porsche Supercup, 2021", builder: "Porsche Motorsport",
    sources: [{ label: "Stuttcars", url: "https://www.stuttcars.com/porsche-911-gt3-cup-992-specifications-performance/" }],
  },
  porsche_991ii_gt3_cup: {
    engine: "4.0 L flat-six", aspiration: "Naturally aspirated", displacement: 3996,
    power: "485 PS", weight: "≈ 1,200 kg", gearbox: "6-speed sequential", layout: "Rear engine, RWD",
    debut: "2017 season", builder: "Porsche Motorsport",
    sources: [{ label: "Stuttcars", url: "https://www.stuttcars.com/porsche-911-gt3-cup-991-2-2016-2020-specifications-performance/" }],
  },
  lamborghini_huracan_st_evo2: {
    engine: "5.2 L V10", aspiration: "Naturally aspirated", displacement: 5204,
    power: "620 CV", weight: "1,270 kg (dry)", gearbox: "Xtrac 6-speed sequential", layout: "Mid engine, RWD",
    debut: "Super Trofeo, 2022", builder: "Lamborghini Squadra Corse",
    sources: [{ label: "Lamborghini", url: "https://lamborghini.com/en-en/motorsport/motorsport-models/huracan-super-trofeo-evo2" }],
  },
  lamborghini_huracan_st: {
    engine: "5.2 L V10", aspiration: "Naturally aspirated", displacement: 5204,
    power: "620 hp", weight: "1,270 kg (dry)", gearbox: "6-speed sequential", layout: "Mid engine, RWD",
    debut: "Super Trofeo, 2015", builder: "Lamborghini Squadra Corse",
    sources: [{ label: "Supercars.net", url: "https://www.supercars.net/blog/2015-lamborghini-huracan-lp-620-2-super-trofeo/" }],
  },
  ferrari_488_challenge_evo: {
    engine: "3.9 L V8", aspiration: "Twin-turbo", displacement: 3902,
    power: "670 hp", gearbox: "7-speed F1 dual-clutch", layout: "Mid engine, RWD",
    debut: "Ferrari Challenge, 2020", builder: "Ferrari Corse Clienti",
    sources: [{ label: "SB Race Engineering", url: "https://sbraceengineering.co.uk/ferrari-specialists/ferrari-models-2010-to-2019/ferrari-488-challenge-specifications/" }],
  },
  bmw_m2_cs_racing: {
    engine: "3.0 L inline-six (S55)", aspiration: "Twin-turbo", displacement: 2979,
    gearbox: "7-speed dual-clutch", layout: "Front engine, RWD",
    debut: "2020 season", builder: "BMW M Motorsport",
    sources: [{ label: "BMW Group Press (the road M2 CS)", url: "https://www.press.bmwgroup.com/usa/article/detail/T0302373EN_US/the-2020-bmw-m2-cs-coupe" }],
  },
};

export const carSpecs = (key: string): CarSpecs | null => CAR_SPECS[key] ?? null;
