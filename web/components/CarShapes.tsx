// The replay's cars seen from above (user's request, like Racemake): a real top-down picture of the
// team's Ford Mustang GT3 in the PCGR livery (an ACC screenshot the user took, cut out of the tarmac
// with GrabCut: tools/car_shapes/cut_car.py), used for every car for now. Both cars of a replay
// look the same, so each one gets a halo in its driver's colour, traced from the same cut-out.
// Metres, front towards +x, y towards the driver's right. Other cars' pictures can be added to
// SPRITES later (ACC key prefix → picture).

type Point = [number, number];
type Sprite = { src: string; length: number; width: number; outline: Point[] };

const MUSTANG_PCGR: Sprite = {
  src: "/media/cars/mustang-pcgr.webp",
  length: 4.9,
  width: 2.081,
  outline: [
    [-2.447, 1.004], [-2.047, 1.015], [-2.055, 0.846], [-1.63, 0.888], [-1.632, 0.939], [-1.441, 0.97], [-1.381, 1.038],
    [-1.167, 1.038], [-0.843, 0.928], [-0.271, 0.97], [0.259, 0.95], [0.251, 1.015], [0.392, 1.009], [0.465, 0.93],
    [0.73, 0.928], [0.857, 0.992], [1.39, 1.038], [2.038, 0.956], [2.261, 0.727], [2.396, 0.482], [2.45, -0.056],
    [2.391, -0.561], [2.267, -0.781], [2.047, -1.018], [1.849, -1.023], [1.773, -0.964], [1.506, -1.029], [1.221, -1.012],
    [1.116, -0.961], [-0.065, -0.998], [-0.95, -0.967], [-1.283, -1.038], [-1.601, -0.964], [-1.68, -0.984],
    [-1.802, -0.877], [-2.055, -0.787], [-2.433, -0.787],
  ],
};

const SPRITES: [prefix: string, sprite: Sprite][] = [];   // per-car pictures to come

function spriteFor(car: string | null | undefined): Sprite {
  const k = car ?? "";
  return SPRITES.find(([p]) => k.startsWith(p))?.[1] ?? MUSTANG_PCGR;
}

/** Where the ABS light goes: the front of the car. */
export const noseOf = (car: string | null | undefined) => spriteFor(car).length / 2;

const path = (pts: Point[]) => `M${pts.map(([x, y]) => `${x} ${y}`).join("L")}Z`;

export default function CarShape({ car, color }: { car?: string | null; color: string }) {
  const s = spriteFor(car);
  return (
    <g>
      {/* halo in the driver's colour: which car is which */}
      <path d={path(s.outline)} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={0.32} strokeLinejoin="round" opacity={0.95} />
      <image href={s.src} x={-s.length / 2} y={-s.width / 2} width={s.length} height={s.width} preserveAspectRatio="none" />
    </g>
  );
}
