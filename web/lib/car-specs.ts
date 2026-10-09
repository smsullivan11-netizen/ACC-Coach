// The real cars' specs and racing record for the car page's showroom (user's request, 2026-10-09):
// researched from the makers' and teams' own pages, Wikipedia and the motorsport press. Power and
// weight are the makers' figures: in a race the BoP changes both. Only well-documented results are
// listed (overall wins, class wins in the big races, titles), each car with its sources. Cars without
// an entry show only the team's own numbers. Safe on server and client.

export type CarWin = { year: number; event: string; detail?: string };
export type CarSpecs = {
  engine: string;          // e.g. "5.4 L V8"
  aspiration: "Naturally aspirated" | "Twin-turbo" | "Turbo";
  displacement?: number;   // cc
  power?: string;          // e.g. "≈ 565 hp"
  weight?: string;         // e.g. "≈ 1,250 kg"
  gearbox?: string;
  layout: string;          // e.g. "Front-mid engine, RWD"
  debut?: string;          // first race
  builder?: string;
  wins: CarWin[];
  sources: { label: string; url: string }[];
};

export const CAR_SPECS: Record<string, CarSpecs> = {
  ford_mustang_gt3: {
    engine: "5.4 L V8 (Coyote)", aspiration: "Naturally aspirated", displacement: 5400,
    weight: "≈ 1,289 kg", gearbox: "Xtrac 6-speed sequential transaxle", layout: "Front-mid engine, RWD",
    debut: "Daytona 24h, January 2024", builder: "Multimatic and Ford Performance (engine by M-Sport)",
    wins: [
      { year: 2025, event: "Daytona 24 Hours", detail: "GTD Pro class · Ford Multimatic #65 (Vervisch, Olsen, Mies)" },
      { year: 2025, event: "IMSA Detroit", detail: "GTD Pro class · Ford Multimatic #64" },
      { year: 2025, event: "IMSA Indianapolis 6 Hours", detail: "GTD Pro class · Rockenfeller, Priaulx" },
    ],
    sources: [
      { label: "Multimatic Motorsports", url: "https://www.multimaticmotorsports.com/cars/mustang-gt3/" },
      { label: "Endurance-Info", url: "https://en.endurance-info.com/auto/article/115210-ford-mustang-gt3-claims-first-global-win-63rd-rolex-24" },
      { label: "Ford Authority", url: "https://fordauthority.com/2025/09/ford-mustang-gt3-racks-up-another-hard-fought-imsa-win-at-indy/" },
    ],
  },
  porsche_992_gt3_r: {
    engine: "4.2 L flat-six", aspiration: "Naturally aspirated", displacement: 4194,
    power: "≈ 565 hp", weight: "≈ 1,250 kg", gearbox: "Porsche 6-speed sequential", layout: "Rear engine, RWD",
    debut: "Daytona 24h, January 2023", builder: "Porsche Motorsport",
    wins: [
      { year: 2025, event: "Le Mans 24 Hours", detail: "LMGT3 class · Manthey 1st Phorm #92" },
      { year: 2024, event: "Le Mans 24 Hours", detail: "LMGT3 class, its first year · Manthey EMA #91 (Lietz, Schuring, Shahin)" },
      { year: 2024, event: "FIA WEC", detail: "LMGT3 drivers' title · Manthey" },
      { year: 2024, event: "IMSA", detail: "GTD Pro titles · AO Racing" },
    ],
    sources: [
      { label: "Porsche Motorsport", url: "https://racing.porsche.com/en-NZ/cars/911-gt3-r-992" },
      { label: "Porsche Newsroom", url: "https://newsroom.porsche.com/fr_CH/2024/motorsports/porsche-fia-world-endurance-championship-wec-race-4-le-mans-france-review-36527.html" },
      { label: "Car Racing Reporter", url: "https://www.carracingreporter.com/home/2024-porsche-911gt3r" },
    ],
  },
  bmw_m4_gt3: {
    engine: "3.0 L inline-six (P58)", aspiration: "Twin-turbo", displacement: 2993,
    power: "up to 590 hp", gearbox: "Xtrac 6-speed sequential", layout: "Front-mid engine, RWD",
    debut: "2022 season", builder: "BMW M Motorsport",
    wins: [
      { year: 2025, event: "Nürburgring 24 Hours", detail: "Overall · ROWE Racing #98 (M4 GT3 EVO)" },
      { year: 2025, event: "Dubai 24 Hours", detail: "Overall · the M4 GT3 EVO's first race" },
      { year: 2023, event: "Spa 24 Hours", detail: "Overall · ROWE Racing #98 (Eng, Wittmann, Yelloly)" },
    ],
    sources: [
      { label: "BMW Group Press", url: "https://www.press.bmwgroup.com/usa/article/detail/T0334417EN_US/bmw-m-motorsports-presents-the-new-bmw-m4-gt3" },
      { label: "BMW M (Nürburgring 2025)", url: "https://www.bmw-m.com/en/topics/magazine-article-pool/rowe-racing-wins-24-hours-of-nurburgring.html" },
      { label: "Bimmerlife (Spa 2023)", url: "https://bimmerlife.com/2023/07/02/rowe-racing-wins-spa-24-hours/" },
      { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/BMW_M4_GT3" },
    ],
  },
  lamborghini_huracan_gt3_evo2: {
    engine: "5.2 L V10", aspiration: "Naturally aspirated", displacement: 5204,
    weight: "≈ 1,230 kg", gearbox: "Xtrac 6-speed sequential", layout: "Mid engine, RWD",
    debut: "Daytona 24h, January 2023", builder: "Lamborghini Squadra Corse",
    wins: [
      { year: 2025, event: "Spa 24 Hours", detail: "Overall, Lamborghini's first · Grasser Racing #63 (Bortolotti, Engstler, Pepper)" },
      { year: 2024, event: "DTM", detail: "Drivers' title · Mirko Bortolotti, SSR Performance" },
    ],
    sources: [
      { label: "Lamborghini (Spa 2025)", url: "https://www.lamborghini.com/en-en/motorsport/news/lamborghini-and-grasser-racing-team-win-the-24-hours-of-spa-for-the-first-time-with-the-huracan-gt3-evo2" },
      { label: "Wayne Taylor Racing (specs)", url: "https://waynetaylorracing.com/customer/carspecs/gtd" },
    ],
  },
};

export const carSpecs = (key: string): CarSpecs | null => CAR_SPECS[key] ?? null;
