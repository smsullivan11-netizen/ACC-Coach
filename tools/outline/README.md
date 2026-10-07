# Offline check of the automatic track outline (web/lib/outline-core.ts)

1. Dump each track's laps (read-only, lap API with the app's token) as `<track>.json` in a work
   folder: `{key, edges (the live outline), laps: [{id, s, drv, ok, why, x, z, valid}]}`.
2. Copy `web/lib/outline-core.ts` there with its JSON import replaced by a `createRequire` of
   `web/lib/track-data/tumftm.json`, then `node --experimental-transform-types run.ts` writes
   `<track>.new.json` for every dump.
3. `python kinks.py`: sharp turns (> 25° over ~4 m) in the white lines, live vs new, per track;
   `python plot.py <track> cx,cz,half` plots both with the laps (invalid ones dotted after their cut).

Results of 2026-10-07 (VERSION 4): sharp-kink spots Barcelona 28 → 0, Misano 29 → 0, Zolder 12 → 0,
Mount Panorama 6 → 0, COTA 2 → 0, every other track 0; valid-lap points outside the white lines at
most 0.07 % (was up to 0.59 %), widths unchanged within ±1 m.
