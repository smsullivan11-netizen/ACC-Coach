// Track map drawing helpers (ACC positions seen from above: x right, z down, like SVG's y).

/** Where to write a corner's label: beside the line at point i, on the outside of the turn, so
 *  labels of nearby corners do not sit on the line or on each other. `span`: points used to read
 *  the line's direction around i. */
export function labelPoint(x: ArrayLike<number>, z: ArrayLike<number>, i: number, offset: number, span: number) {
  const n = x.length;
  const p = (j: number) => [x[Math.min(n - 1, Math.max(0, j))], z[Math.min(n - 1, Math.max(0, j))]];
  const [x0, z0] = p(i - span), [x1, z1] = p(i), [x2, z2] = p(i + span);
  const tx = x2 - x0, tz = z2 - z0, len = Math.hypot(tx, tz) || 1;
  const cross = (x1 - x0) * (z2 - z1) - (z1 - z0) * (x2 - x1);   // > 0: turning right on the map
  const side = cross > 0 ? -1 : 1;                                // outside of the turn
  return { x: x1 + (side * -tz * offset) / len, z: z1 + (side * tx * offset) / len };
}
