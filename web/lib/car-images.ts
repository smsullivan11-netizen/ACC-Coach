// Car pictures (user's request, 2026-10-08, a teammate's idea): ACC showroom screenshots only, processed
// by tools/car_images/process.py into public/media/cars/side/<car>.webp (small side view with faded
// edges, for the Cars table) and public/media/cars/cutout/<car>.webp (the car alone on a transparent
// background, 1600 px wide, its "0" number plate painted over: the car page's showroom, 2026-10-09).
// car-images.json says which exist, with a version for the browser cache. Cars without pictures show
// none. Safe on server and client.

import images from "./car-images.json";

const manifest = images as Record<string, { side?: number; cutout?: number }>;

export const carSide = (key: string) =>
  manifest[key]?.side ? `/media/cars/side/${key}.webp?v=${manifest[key].side}` : null;
export const carCutout = (key: string) =>
  manifest[key]?.cutout ? `/media/cars/cutout/${key}.webp?v=${manifest[key].cutout}` : null;
