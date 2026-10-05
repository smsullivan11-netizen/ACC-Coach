// Lock-to-lock steering angle (°) of cars missing from Kunos's official table (acc_shm.py
// STEER_LOCK_DEG, used by the app to record `steering_deg`). For their laps the site turns the raw
// input (steering_norm, −1…1) into the steering wheel angle: norm × lock / 2.
// Ford Mustang GT3: 516°, measured in game by the team (2026-10-05) and confirmed by other players.
export const EXTRA_STEER_LOCK_DEG: Record<string, number> = {
  ford_mustang_gt3: 516,
};

/** Adds `steering_deg` to a lap's channels when the app could not record it but the car's lock is known. */
export function withSteeringDeg(channels: Record<string, Float64Array>, car: string | null) {
  const lock = car ? EXTRA_STEER_LOCK_DEG[car] : undefined;
  const norm = channels.steering_norm;
  if (channels.steering_deg || !norm || !lock) return channels;
  return { ...channels, steering_deg: norm.map((v) => (v * lock) / 2) };
}
