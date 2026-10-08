// Car pictures (user's request, 2026-10-08, a teammate's idea): ACC screenshots only, processed by
// tools/car_images/process.py into public/media/cars/side/<car>.webp (side view from the setup screen's
// Aero tab, faded edges) and public/media/cars/bg/<car>.webp (car page background). car-images.json
// says which exist, with a version for the browser cache. Cars without pictures show none. Safe on
// server and client.

import images from "./car-images.json";

const manifest = images as Record<string, { side?: number; bg?: number }>;

export const carSide = (key: string) =>
  manifest[key]?.side ? `/media/cars/side/${key}.webp?v=${manifest[key].side}` : null;
export const carBackground = (key: string) =>
  manifest[key]?.bg ? `/media/cars/bg/${key}.webp?v=${manifest[key].bg}` : null;
