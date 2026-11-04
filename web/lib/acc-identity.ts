import { CARS } from "./cars";
import { TRACKS } from "./track-catalog";
const executables = new Set(["ac2-win64-shipping.exe", "ac2-wingdk-shipping.exe"]);
const cars = new Set(CARS.map((c) => c.key));

/** Compatibility with older ACC clients is retained; their self-declared simulator alone is not proof. */
export function accIdentityError(bundle: { simulator?: unknown; session?: { track?: unknown; car?: unknown }; source?: { simulator_identity?: unknown } }): string | null {
  if (bundle.simulator !== "acc") return "Only Assetto Corsa Competizione sessions are accepted.";
  const track = bundle.session?.track;
  if (typeof track !== "string" || !Object.hasOwn(TRACKS, track.toLowerCase())) return "Unsupported ACC track. Assetto Corsa/mod tracks (including ACU tracks) cannot be uploaded as ACC.";
  const car = bundle.session?.car;
  if (car !== null && car !== undefined && (typeof car !== "string" || !cars.has(car.toLowerCase()))) return "Unsupported ACC car. Assetto Corsa/mod cars cannot be uploaded as ACC.";
  const identity = bundle.source?.simulator_identity;
  if (identity !== null && identity !== undefined) {
    if (typeof identity !== "object") return "Invalid simulator identity.";
    const i = identity as Record<string, unknown>;
    if (i.simulator !== "acc" || i.method !== "windows-process" || typeof i.executable !== "string" || !executables.has(i.executable.toLowerCase()))
      return "The recording identifies a different or unverified game, not ACC.";
  }
  return null;
}
