// The replay's cars seen from above (user's request, like Racemake): a real top-down picture of the
// team's Ford Mustang GT3 in the PCGR livery (an ACC screenshot the user took, cut out of the tarmac
// with GrabCut: tools/car_shapes/cut_car.py), used for every car for now. The first car keeps the
// yellow livery, the second has it in white (tools/car_shapes/white_livery.py) so they're told apart.
// Metres, front towards +x, y towards the driver's right. Other cars' pictures can be added to
// SPRITES later (ACC key prefix → picture).

type Sprite = { src: string; white: string; length: number; width: number };

const MUSTANG_PCGR: Sprite = {
  src: "/media/cars/mustang-pcgr.webp",
  white: "/media/cars/mustang-pcgr-white.webp",
  length: 4.9,
  width: 2.081,
};

const SPRITES: [prefix: string, sprite: Sprite][] = [];   // per-car pictures to come

function spriteFor(car: string | null | undefined): Sprite {
  const k = car ?? "";
  return SPRITES.find(([p]) => k.startsWith(p))?.[1] ?? MUSTANG_PCGR;
}

/** Where the ABS light goes: the front of the car. */
export const noseOf = (car: string | null | undefined) => spriteFor(car).length / 2;

export default function CarShape({ car, white = false }: { car?: string | null; white?: boolean }) {
  const s = spriteFor(car);
  return (
    <image href={white ? s.white : s.src} x={-s.length / 2} y={-s.width / 2} width={s.length} height={s.width} preserveAspectRatio="none" />
  );
}
