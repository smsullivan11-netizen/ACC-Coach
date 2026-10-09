// The real cars' specs for the car page's showroom (user's request, 2026-10-09): researched from the
// makers' and teams' own pages, Wikipedia and the motorsport press, each car with its sources. Power
// and weight are the makers' figures: in a race the BoP changes both. A racing record was shown first
// and dropped (user's choice). Cars without an entry show "Specs to come". Safe on server and client.

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
  sources: { label: string; url: string }[];
};

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
};

export const carSpecs = (key: string): CarSpecs | null => CAR_SPECS[key] ?? null;
