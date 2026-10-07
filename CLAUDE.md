# Project: coaching and ranking for the team's drivers (ACC)

Free alternative to Coach Dave Delta / Racemake, for our team first:
driving-input analysis, driver comparison, ranking by metrics.
Current sim: Assetto Corsa Competizione (other sims later → generic data model).

## Chosen architecture: hybrid (like Delta)
- **Local agent** (Windows, on each driver's PC): collects telemetry, processes it and uploads it.
- **Team site** (Next.js + TypeScript, hosted Postgres — Neon): stores, displays, ranks.
  The site recomputes nothing: all processing lives in the agent (this Python code is its core).
- Upload: one **session bundle** per recorded session (`bundle.py`, `.json.gz`).
- **The site holds each track's reference corner map**; the agent downloads it.
  A bundle computed with another map (same version, different fingerprint) is refused.
- **Main data source: our own recorder reading ACC's shared memory** (like Racemake's recorder app):
  400 Hz inputs, car position for racing lines, the game's own lap times / validity / pit flags.
  MoTeC import stays as a fallback for older sessions.
- The desktop app is Python packaged with PyInstaller; a rewrite (Rust/C#) only if needed.

## Files
- `acc_shm.py`: ACC shared memory page layouts (official doc v1.8.12) and read-only reader (Windows).
- `recorder.py`: records the shared memory while driving, one `.accrec` file per session.
- `accrec.py`: `.accrec` file format (raw pages, zlib chunks): writer and reader.
- `recording.py`: `.accrec` → laps for the pipeline; `check` command for real recordings.
- `acc_telemetry.py`: MoTeC .ld/.ldx reading, lap splitting, validation, cleaning, resampling,
  lap metrics, server .json matching, CLI, overlay and racing-line plots (reads `.accrec` too).
- `corners.py`: corner map (`tracks/<track>.json`) and per-corner metrics.
- `bundle.py`: session bundle uploaded to the site (format `acc-coach/session` v1).
- `upload.py`: downloads the team's corner map, builds the bundle and uploads it (upload token).
- `db/migrations/*.sql`: Postgres schema, applied in order (`npm run db:migrate` in `web/`).
- `web/`: the team site (Next.js 16, see "Website" below).
- `agent/`: the ACC Coach desktop app (`acc_coach_app.py`), its installer (`installer.iss`) and
  build script (`build.ps1`). `version.py`: app version, also sent in every bundle.
- `tests/`: `test_synthetic.py` (MoTeC), `test_recorder.py` (live, fake game), `test_recording.py`
  (recorder files), `test_db.py` (reference import `import_bundle` for the site), `fake_acc.py`.
- `ldparser.py`: third party, GPL-3.0, unmodified.

## Conventions
- Everything in English (code, comments, CLI messages, docs): not everyone on the team speaks French.
- Data keys (metrics, bundle, SQL columns) in snake_case, unit as suffix (`_m`, `_s`, `_ms`, `_kmh`, `_pct`).
- Laps are "L1, L2…", corners are "T1, T2…" (turns).
- Distances in m from the line, on the track's reference length.
- Lap exclusion codes: `distance`, `server_invalid`, `game_invalid`, `pit_out`, `pit_in`.

## Data sources
- **ACC shared memory** (live, while the game runs; see "Recorder" below): pages
  `Local\acpmf_physics` (player's car, every physics step), `Local\acpmf_graphics` (session, laps,
  every car's coordinates, every frame) and `Local\acpmf_static` (track, car, driver name).
  Layouts from Kunos' "ACC Shared Memory Documentation v1.8.12" (struct pack 4, wchar_t = 2 bytes).
- **ACC server results (.json)**: official lap times per driver and lap (ms), `isValidForBest`.
  Often UTF-16 LE encoded. Written on the server machine, not on the drivers' PCs.
- **MoTeC telemetry exported by ACC**: always require the `.ld` + `.ldx` pair.
  - `.ld` (binary): 55 channels. Inputs at 60 Hz: SPEED (m/s), THROTTLE, BRAKE (%),
    STEERANGLE (°), CLUTCH, RPMS. 20 Hz: GEAR, G_LAT, G_LON, TC, ABS, tyres/brakes.
    200 Hz: wheels, suspension. TIME channel (50 Hz) = current lap timer.
    No world position (X/Y) channel.
  - `.ldx` (XML): lap beacons `<Marker ClassName="BCN" Time="…">`, time in µs.
  - `LAP_BEACON` in the .ld is always empty: do not use it.
- Reading: `ldparser.py` (github.com/gotzl/ldparser, **GPL-3.0**: matters if the agent
  is distributed with this file).

## Validated findings
- ACC does **not** publish track edges: `numberOfTyresOut` stays 0 even on laps invalidated for
  track limits (Brands Hatch recording, 187k samples). `kerbVibration` does work (non-zero ~3 % of
  the time at speed). Tyre contact points are exact: GT3 front track 1.78 m, rear 1.74 m,
  wheelbase 2.79 m.
- **Server** sessions: consistent files (.ldx beacons = TIME resets;
  integrated distance per lap ≈ track length, ±0.3 % at Brands Hatch).
- **Solo Hotlap** sessions: inconsistent files (channels of different durations,
  sometimes near-empty exports, TIME resets on aborted laps). Refuse or flag them.
- The last lap can be missing from the .ldx → complete it with TIME resets.
- TIME can run longer than the inputs (468 s vs 348 s observed): keep an eye on it.
- The first lap after leaving the pits starts slowly: exclude it from comparisons.
- Cumulative delta at the end of the lap ≈ lap time gap (0.68 s vs 0.665 s, Brands Hatch L3/L2):
  distance resampling is reliable.
- **Precise line-crossing instant** = TIME sample instant − TIME value right after the reset.
  Nordschleife: 754.1225 s vs 754.122 s official (0.5 ms), versus 16 ms from the sample alone.
  .ldx beacons are written in 6-digit scientific notation (`1.33442e+08` µs):
  10 ms resolution beyond 1000 s into the session, 100 ms beyond 10,000 s.
- **Auto-blips**: THROTTLE pulses ~47-50 %, 0.10-0.12 s, while braking; 52/52 within ±0.2 s
  of a downshift (Nordschleife). All removed by `THROTTLE_NB`.
  Known limit: a blip immediately followed by throttle application would not be removed.
- **Brake drops**: clean steps ~70 → 0 → ~70 within 0.1-0.25 s, ABS *inactive* during the drop
  but 77 % within ±0.15 s of an ABS episode (often right after it ends). Not in the ACC replay
  and not in the driver's input: a logging artefact linked to ABS. Filled by `BRAKE_FILLED`.
  The 0.3 s threshold fits (36 gaps < 0.3 s, 8 between 0.3 and 1 s with no throttle).
- ABS channel (20 Hz) = 0/1 "ABS active" flag; same for TC.
- GEAR is reliable: 0 = neutral at standstill, then the real gears (distinct speed/RPM ratios,
  no time lag).
- `head.driver` is empty in the .ld (Nordschleife): .json matching cannot filter by driver;
  with a single lap, risk of a wrong match on a server with several cars.
- Integrated distance Nordschleife 24h: 25,412 m vs 25,378 m official (+0.13 %).
- The Nordschleife sample lap (2026-10-03) was driven with several barrier contacts: fine for
  testing the pipeline, not representative for driving analysis or a corner map.
- Results .json: `2147483647` = no value (e.g. `bestlap` with no valid lap);
  `timing.totalTime` can be nonsensical (816,144,442 ms observed).

## Recorder (recorder.py, accrec.py, recording.py)
- `python recorder.py [--out recordings] [--poll-ms 0.5]`: start before or after ACC, stop with Ctrl+C.
  Opens the pages read-only and only if ACC created them (never creates them). Records only when
  the status is live or pause (nothing in menus or replays). New file at each session change.
  Polls every ~0.5-1 ms (Python `time.sleep` precision on Windows), so every 2.5 ms physics packet is
  caught; missed packets = gaps in `packetId`, counted and reported. A copy is retried if the game
  wrote during it (`packetId` changed), so fields never mix two steps.
- `.accrec` keeps the **raw pages** (zlib chunks of ~1 s, written by a background thread): if a
  field turns out to be decoded wrongly, past recordings can be re-read with a fixed layout.
  Format v2 stores each chunk column-wise (~35 % smaller than v1); v1 files stay readable.
- `recording.py` (`load_recording`, same contract as `load_session`):
  - physics clock = packet count × step length, the step calibrated against the game's lap timer
    (2.500 ms per packet, median over laps); the recorder clock is only a fallback (in the pits and
    menus the packet counter misbehaves: measuring against it gave 2.493 ms → laps 0.28 % short);
  - lap boundary = frame where `completedLaps` increases, minus the game's lap timer `iCurrentTime`
    at that frame (~1 ms); game lap time = `iLastTime`; validity = `isValidLap` over the lap
    (`game_invalid`); pit lap = `isInPitLane` during the lap (start → out, else in);
  - channels resampled at the physics rate: SPEED, THROTTLE, BRAKE, CLUTCH (pedal inputs × 100),
    STEER_NORM (−1…1) and STEERANGLE (× lock / 2 when the car is in `acc_shm.STEER_LOCK_DEG`),
    GEAR (ACC: 0 = R, 1 = N, 2 = 1st → converted to 1 = 1st), RPMS, ABS_ACTIVE / TC_ACTIVE (from
    the float fields `abs` / `tc`; `absInAction` / `tcInAction` are always 0 in ACC),
    NPOS (normalizedCarPosition), POS_X/Y/Z (tyre contact points if consistent with the speed,
    else the player's `carCoordinates`, found through `carID[] == playerCarID`);
  - distance along the lap from NPOS (the game's track spline), else integrated speed.
- `python recording.py check <file>`: report to run on real recordings (rates, missed packets,
  speed vs velocity, value ranges, gear numbering, coordinates in metres, lap times vs game).
- Layout sizes 800 / 1588 / 820 bytes (physics and graphics match the sizes used by
  PyAccSharedMemory, MIT; its static map of 784 bytes is too short for its own field list).
- **Validated on a real recording** (Brands Hatch, Ford Mustang GT3, 2026-10-04, 7.8 min, 13/13 checks):
  - physics 400.0 Hz, 0.02 % packets missed, graphics ~118 Hz (frame rate); speedKmh = |velocity|;
  - lap times within 2 ms of the game's `iLastTime`; `isValidLap` works (track limits);
  - coordinates in metres, y up, x and z horizontal; seen from above z points down the page
    (plotting z upwards mirrors the map: Druids became a left-hander); ~11 % of graphics frames
    repeat the previous position, so speed checks on coordinates need ~0.5 s stretches;
  - tyre contact points are filled in (0.5 m from `carCoordinates`) and used for positions;
  - the live pedal values have the same quirks as MoTeC: brake drops to 0 for 40-270 ms inside
    braking zones (4-11 per lap) and ~15 short throttle pulses per lap while braking (auto-blips):
    the same cleaning applies;
  - the driver is often still at full throttle when the brake goes on (overlap): the lift point
    is searched after the braking point too;
  - `acVersion` reads "1.7" and `playerNick` is empty (not used);
  - file size 424 MB per hour in format v1 (driving data is noisy), ~280 MB per hour in v2.
- Steering locks (2026-10-05): `acc_shm.STEER_LOCK_DEG` and `web/lib/steering.ts` hold the
  **lock-to-lock** angles from Coach Dave Academy's table (user's source; Mustang 516° and McLaren
  720S GT3 Evo 480° checked in game). Kunos's Appendix 5 gives the angle to each side and was used
  as lock to lock before: `steering_deg` from apps up to 0.1.5 is half the real angle, so the site
  ignores it and always derives the angle from `steering_norm` × lock / 2 (`withSteeringDeg`).

## Pipeline (acc_telemetry.py; MoTeC steps 1-4, recorder files: see above)
1. Lap boundaries: .ldx, completed with TIME; precise instant from TIME when available.
   A lap starts at the first sample at or after the crossing instant.
2. Validation: lap distance within ±3 % of the reference (`--track-length`, otherwise
   `TRACK_LENGTHS` by venue, otherwise median of the laps).
3. Pit out-laps / in-laps: mean speed over 1 s at the line < 60 % of the median.
4. `--results` option: matching with the server .json (car of the .ld driver if found,
   best lap offset within ±50 ms, at least 2 laps) → official lap time + `isValidForBest`.
5. Input cleaning: `BRAKE_ZONE` (brake > 5 %, gaps < 0.3 s filled), `BRAKE_FILLED`
   (artefact drops filled; braking points are read from raw BRAKE), `THROTTLE_NB`
   (throttle pulses < 0.3 s inside braking zones removed).
6. Resampling onto a common distance grid (1 m), distance rescaled to the reference;
   discrete channels (GEAR, BRAKE_ZONE, ABS_ACTIVE, TC_ACTIVE) use the last known value.
7. Overlay + cumulative time delta vs distance (`--raw`: raw throttle/brake).
   Default: first comparable lap vs best comparable lap; with fewer than two,
   metrics only, no plot.
8. Provisional lap metrics (on cleaned inputs): `full_throttle_pct`, `braking_pct`,
   `avg_throttle_pct`, `max_speed_kmh`, `steering_rate_deg_s` (proxy for corrections;
   `steering_rate_pct_s` when the steering lock is unknown). Final metrics to be defined with the team.
9. Corner map (`--rebuild-corners` to redo it), then corner-by-corner comparison
   (the 8 corners where A loses the most to B); corner bands on the plot.
10. With car positions (recorder): racing-line plot `<file>_L<a>_vs_L<b>_lines.png`, whole track +
    zooms (±60 m around the apex) on the 3 corners where A loses the most, braking point (●),
    throttle pickup (▲), lateral gap at the apex (inside / outside).
11. `--bundle file.json.gz`: session bundle to upload to the site.

## Corners (corners.py)
- A "corner map" is not a drawing of the track: it is the list of corner segments along the lap
  (start / apex / end in m from the line), used to cut every lap of every driver at the same places.
- Detection on a resampled lap: speed smoothed over 15 m, alternating peaks/dips at least
  10 km/h apart (`CORNER_DROP_KMH`). Corner = from the previous speed peak to the next; the first
  starts at 0 and the last ends at the line, so sum of corner times = lap time.
  A dip right at the line is ignored (start/end of the lap, not a corner).
- Map built **only from a comparable lap** (the fastest) and saved to `tracks/<track>.json`.
  Without a comparable lap: provisional map, not saved, and the site does not import
  per-corner results. Rebuild: version +1, names kept if the apex moves by less than 30 m.
- This speed-based map is only the **first** map of a track (the app makes it when the site has
  none). One lap's speed is fragile: Mount Panorama got 10 corners for ~20 real turns and labels
  on top of each other. The site then replaces it (see "Corner maps on the site"); the app always
  downloads the site's latest map before processing a session.
- Per corner and per lap: `time_s`, `entry_speed_kmh`, `lift_point_m`, `braking_point_m`,
  `brake_release_m`, `max_brake_pct`, `min_speed_kmh`, `apex_m` (this lap's minimum speed),
  `throttle_pickup_m` (throttle > 10 % after the brake), `full_throttle_m`, `coasting_s`, `exit_speed_kmh`.
  `None` when the event does not happen (flat-out corner, no braking).
- Braking point = start of the **main** braking event before the apex (the braking run losing the
  most speed): a short dab near the apex, or a brief full-throttle moment in a long arc, must not
  move it. Lift = start of the partial-throttle run around the braking point (without braking:
  around the apex, or the last one before it). Full throttle = first full throttle from the apex on.
- The apex (minimum speed) is ambiguous along a constant-radius arc (can move by tens of metres
  between laps for the same speed): compare `min_speed_kmh`, not `apex_m`, there.
- Nordschleife: 64 corners detected at 10 km/h (53 at 20 km/h).

## Corner maps on the site (web/lib/corners.ts, web/lib/corner-maps.ts)
- Built from the **shape of the racing line**: median position of the team's best clean laps with
  car positions (up to 10, at most 4 per driver, same distance grid ±1 %), smoothed (Gaussian 8 m),
  signed curvature (heading change per metre, Gaussian 10 m; positive = right turn). Curve = curvature
  over `on` (radius < 200 m at "normal"), extended while over on/2 with the same sign; same-direction
  curves < 30 m apart merged, then split again at a curvature valley under 25 % of the smaller peak
  (double corners, esses); kept if it turns by ≥ 25°. Detail levels "fewer"/"normal"/"more" change
  these thresholds. Apex = slowest point of the curve (tightest point when flat out, < 3 km/h
  variation). Boundaries = speed peak between two apexes, or halfway between the curves when there
  is no real peak (chicane). First corner starts at 0, last ends at the line (corner times add up).
- Brands Hatch (real laps, "normal"): 9 corners matching the real layout (Paddock Hill, Druids,
  Graham Hill, Surtees/McLaren, Hawthorn, Westfield, Sheene, Stirlings, Clearways/Clark).
- Lifecycle: the first upload stores the app's speed map (v1); right after, `afterUpload` builds a
  geometry map once (`method: "geometry"` in the definition) and recomputes every lap. Afterwards
  only admins rebuild (Leaderboard → corner map: preview, publish as a new version, rename corners).
  Identical corners are not republished. Names carry over when the apex moves < 30 m; renaming
  does not change the fingerprint (names are not in it). A session processed with an older version
  is recomputed with the latest after upload.
- The site recomputes corner results itself from the stored traces (`cornerMetrics`, port of
  `corners.corner_metrics`; the brake zone is rebuilt from the cleaned brake): **change both
  together**. `web/scripts/check-corners.mjs <bundle.json.gz>` compares them on a real bundle
  (Brands Hatch: 351 values, 0 different; map fingerprints equal: `mapHashKey` reproduces Python's
  `json.dumps`, which is what keeps the app's bundles accepted by the site).
- Laps whose traces were pruned keep their corner results on the old map version; the leaderboard's
  theoretical best only uses the latest version.

## Track edges and replay (web/lib/track-edges.ts, web/app/laps/[id]/Replay.tsx)
- Track surface on maps (asphalt between two white lines, `components/TrackSurface.tsx`). ACC has
  no edges. The user insisted on a Racemake/Popometer-like track view **without driving edge laps**
  (45 min along the Nordschleife white lines was refused), so by default it is automatic
  (`lib/track-outline.ts`, 2026-10-05):
  - Frame = mean line of the team's valid laps (up to 80, same trace length ± 1 %, duplicates
    dropped), right-hand normals; band `lo`/`hi` = extreme lateral offsets (2nd most extreme with
    6+ laps) ± 1 m car half width. The jump at the start/finish line (a lap starts where the
    previous one ended) is spread over ±50 m.
  - First guess, then the smallest local shift that fits every lap inside, smoothed (±12 m, 30
    passes): TUM racetrack database (`lib/track-data/tumftm.json`, 11 tracks, LGPL-3.0, credited on
    /credits) aligned automatically (coarse search over reflection and rotation every 2°, then
    40 ICP passes, scale clamped 0.97-1.03); rejected when it needs big corrections (median shift
    > 1 m, 95th percentile > 3.5 m). The data has local errors of 1-3 m (Brands Hatch: 8 % of the
    line > 1 m outside its edges even with the best rigid fit), hence the correction by the laps.
    Indianapolis left out (the TUM file is the oval). Otherwise: centre = middle of the band
    averaged over ±60 m, width = 90th percentile of the width the laps need, 9-16 m.
  - Stored in `track_outline` (migration 0009) with the newest lap used and a method `VERSION`
    (bump it when the method changes); recomputed after each upload (`after()` in the upload route)
    or on read when stale. Without the table it is computed on every read (not stored). Brands
    Hatch: ~1.4 s to compute on the dev server, 0.06 s when stored.
- VERSION 4 (2026-10-07, `lib/outline-core.ts`: the computation, no database, checked offline with
  `tools/outline/`). User's report: Barcelona's last chicane distorted (spikes), white lines twisting
  elsewhere. Causes found on the real laps: teleports and position glitches (restart lap / back to
  pits: chords across the map, points at 0,0), invalid laps counted after their first cut (what they
  do next is unknown: one straight-lined the chicane), laps matched by distance index (two laps
  measure the track up to ~60 m differently), edges following single points and cut bounds (steps),
  inside edges levered by tiny direction wobbles of the reference. Now: glitches dropped (jump > 6 m
  between metres, origin points, ±30 m); invalid laps only up to 50 m before their first cut; frame
  = the cleanest valid lap (smoothed, normals over ±15 m); each lap placed by where it crosses the
  reference's perpendicular (search window ±80 points; a crossing, not the nearest point: lines 15 m
  out on another arc, and cut ends, gave false offsets); band = extreme offsets ± 1 m (every valid
  point counts: ACC keeps a lap valid only with the car on the track; ignoring a wide valid lap drew
  the white line through it, Kyalami); edges smoothed 25 × ±10 m but never inside the band; inside
  edges never past 85 % of the turn's radius. Sharp kinks: Barcelona 28 → 0, Misano 29 → 0, Zolder
  12 → 0, Mount Panorama 6 → 0, COTA 2 → 0; valid-lap points outside ≤ 0.07 % (was up to 0.59 %).
  Hungaroring now passes the TUM check (laps aligned better).
- Optional exact edges: two **edge laps** driven slowly with the left / right wheels on the white
  line (driving direction), picked by an admin on the track map page; both set = they replace the
  automatic surface. Edge = the lap's line moved outward by 1.0 m, one point every 2 m. An edge
  lap gets the excluded reason `track_edges` (out of rankings, ratings, corner maps; ratings
  replayed); clearing restores it.
- Replay on the lap page ("Replay both laps"): both cars placed by **elapsed time** (inverse of
  the `time_s` channel), drawn as 4.6 × 2.0 m cars with a brake light, follow camera (close /
  medium / wide = 120 / 250 / 500 m view, centred between the cars when close) or whole track,
  0.25×-4×, timeline, live speed / gear / throttle / brake and gap ("ahead by 0.385 s · 20 m":
  time since the leader passed the follower's position). Lines in driver colours or by inputs
  (braking red, ABS working blue, full throttle green, part throttle yellow, coasting grey).
- Racemake-like layout (user's request, 2026-10-05, from a James Baldwin video of Racemake): the
  lap page is wider than the site column (`.bleed` in globals.css: up to 1840 px, on
  `app/laps/[id]/page.tsx`); the replay map fills a box of min(64vh, 780 px) (the view takes the
  box's proportions, ResizeObserver); a HUD per car in the map's bottom corners (this lap left,
  reference right): speed gauge with gear, steering wheel rotated by `steering_deg` (positive =
  right; derived on the site from `web/lib/steering.ts`, see "Steering locks"; cars not in it:
  `steering_norm` × 240°), throttle / brake bars (brake blue
  while ABS works); gap at the top centre. Phones: speed gauges only. With the replay open the
  charts take the full width under it (small map hidden); the 4-second input graphs were dropped.
- Replay fullscreen (user's request): button at the top right of the map (browser fullscreen on the
  replay section; window-sized fallback where the browser has none, Esc leaves). Adds only a
  see-through strip at the bottom between the two HUDs with the full-lap throttle and brake
  traces of both laps and a playhead (the user wanted nothing more there: no gears or other
  channels); the HUDs stay as they are.
- "Compare with…" on the lap page (user's request): first "Team best (Driver) · time" (fastest
  valid lap with a trace on the track in the lap's class), then each driver's best, the other laps
  of the session, and "Choose another lap…" → `/sessions?track=<key>&compare=<lap id>` (that
  track's sessions, any car or class) → `/sessions/<id>?compare=<lap id>` (yellow Compare buttons
  instead of Analyse) → `/laps/<lap id>?vs=<chosen>`.
- Corner buttons above the charts (`CornerChips` in LapView, user's request): "Full lap" + one
  button per corner, sticky under the top bar; a click zooms every chart from 50 m before the
  corner to 30 m after it (`cornerRange`, same as the coaching links); the button of the current
  zoom is red. The replay's Turn checkpoints also zoom the charts (`onTurn`).
- Corners | Sections (user's request, kept to one small switch, `Segmented` + `ZONE_OPTIONS` in
  components/ui.tsx): on the Turn-button bar and in the replay's top bar (works in fullscreen); it
  switches the Turn buttons ("Turns 8–10"), the replay checkpoints and the table under the charts
  (Sections table: time, gap and gap per corner, traded time green/red). Sections are computed in
  the browser from both laps (`sectionsOf`, linked on either). Mode: `?by=sections|corners` (head to
  head's Replay links), a section link from the coach (`corner=8-10`), else the viewer's last
  choice (localStorage `acc-coach:zones`), else corners.
- The reference lap is moved onto this lap's distance grid when loaded (`alignTo` in LapView: linear,
  nearest for gear and levels; corner distances scaled): sessions measure the track a little
  differently, and raw metres made the gap, charts, corner table and replay gap compare different
  places (up to ~25 m late in the lap at Hungaroring).
- ABS (user's request, replacing a brake light): a flashing dark-blue light at the front of the car
  while the ABS works, the brake bar and the brake chart in blue there. ACC's `abs` float is the
  ABS intervention (only while braking: 37 % of hard-braking samples, ~1,000 pulses of ~10 ms in a
  3-lap session). The recorder sends `abs_pct` (bundle channel, from app 0.1.1) = share of the last
  50 ms with ABS working, so the 1 m grid keeps the pulses; older sessions have no ABS data. The charts' cursor
  follows the first car (every chart, `setCursor`). Drawing runs outside React (rAF + refs).
- Replay HUD: per car, a rolling graph of the last 4 s of throttle (green) and brake (red, blue
  with ABS) above the bars. Charts: values under the cursor in each chart's title (both laps).
- Like Racemake (user's request): the replay's cars are seen from above (`components/CarShapes.tsx`):
  every car is, for now (user's request), the team's Ford Mustang GT3 in the PCGR livery: a real
  top-down ACC screenshot the user took, cut out of the tarmac with GrabCut
  (`tools/car_shapes/cut_car.py`, the screenshot itself isn't in the repo) →
  `public/media/cars/mustang-pcgr.webp` (nose to the right, 4.9 m long). The first car keeps the
  yellow livery, the second has it in white (`mustang-pcgr-white.webp`, made by
  `tools/car_shapes/white_livery.py`; user's choice over coloured halos), matching the yellow and
  silver lines. Other cars'
  pictures go in `SPRITES` (ACC key prefix → sprite) when the user sends top-down screenshots of
  them. History: hand-drawn shapes ("looked completely different"), then shapes traced from
  reference pictures (`trace_cars2.py`, `make_shapes.py`), replaced by the screenshot. ABS light on
  the nose (`noseOf`). The laps'
  traces on the charts have a light fill under them (series `area`, colour at ~6 % opacity).
- Electronics (app 0.1.3): graphics `tcLevel`, `tcCutLevel` (TC2), `absLevel`, `engineMap` (0-based,
  +1 stored) held per metre → bundle `tc_level`, `tc2_level`, `abs_level`, `engine_map`; TC intervention
  `tc_pct` like `abs_pct` (physics `tc` float). Lap page: "Electronics" stepped chart (TC orange, TC2
  violet, ABS blue; reference dashed; labelled hover values), TC working drawn orange on the throttle
  trace, ABS blue on the brake trace (threshold ≥ 5 % = one ACC pulse in the 50 ms window). Charts say
  "not recorded for <lap> (app older than …)" when a lap lacks a channel: that was the usual reason
  ABS "did not appear" (laps from app 0.1.0; on the real recording every ABS braking zone shows).
- Replay zoom (user's request): mouse wheel on the map (native non-passive listener on the stage, so
  the page does not scroll; over the checkpoint list too, even when it scrolls: letting it scroll
  there froze the zoom in fullscreen on 1280×720 screens; the list keeps the current checkpoint in
  view by itself), or −/+ buttons; 0 % = whole track,
  100 % = 70 m wide (about one corner), log scale (8 % per wheel notch); the camera eases from the
  track's centre to the followed car over the first 20 %. Replaced the Close/Medium/Wide and "Whole
  track" options. Map labels scale with the view (viewW/60).
- Corner checkpoints: "Turn N" (or "Turns 8–10" in Sections mode) boxes on the left of the player
  (name below, time the first car enters it); click = jump there and zoom the charts; the one the
  first car is in is highlighted (data-active).
- Neck and neck (user's request, like Racemake): a checkpoint click also puts both cars level at its
  start: each car runs on the first car's clock shifted by when it got there (`level.offsets`), so
  the gap only shows that corner or section even when the lap gap is big. A tag under the gap says
  "Neck and neck from Turn 13" with a "Real gap" button; back to the start also clears it. Gap and
  "Finished" use the shifted clocks; the timeline ends when the last car finishes on it.
- Replay lines, "brake / throttle" (user's request, like Racemake): grey with nothing pressed, mixed
  towards green in proportion to the throttle, towards red to the brake, blue with ABS; every metre,
  10 colour steps so consecutive equal segments merge (~950 polylines for two laps).
- Gear: ACC passes through neutral (0) for a few metres at every shift; `smoothGear` (lib/trace.ts)
  gives those short neutrals (< 40 m) the previous gear, in the charts and the replay.

## Coaching summary (web/lib/coaching.ts)
- Shown on every session page ("Coach" card) and, for the latest session with a valid lap, on the
  driver's profile ("Coach's focus"). Rule-based from the data, no AI service (no budget; the user
  wants advice on technique **and** on behaviour: breaks, fatigue, discipline). Computed on each
  page view, nothing stored. Thresholds are first guesses.
- Technique: the session's best valid lap against the reference = fastest valid lap on the track
  and class outside this session, on the same corner map (another driver's, or the driver's own).
  Time gap per corner from the two `time_s` traces, split at the reference's braking point and
  apex: entry = braking point → apex, exit = apex → corner end; the straight before a braking point
  counts as the previous corner's exit. Both laps are compared on the reference's distance grid
  (your metres × your trace length / the reference's): sessions measure the track a little
  differently (Hungaroring 4,324 vs 4,350 m) and raw metres were ~25 m apart late in the lap.
- Sections (`web/lib/sections.ts`, user's request after famas's Misano T1–T2: giving up T1 to be
  faster through T2 was coached as a T1 loss): corners driven as one are judged together. Linked
  when, on the best lap or the reference: the next corner is taken flat (no lift: it is the previous
  exit carried on), the driver is not back on full throttle before it, or under `LINK_S` = 2 s
  from full throttle to the next lift (local data: Hungaroring T8–T9 1.5-1.8 s; corners with a
  straight between 2.4 s and more; real Misano laps of famas and So: T1→T2 0.56-0.61 s, so T1–T3
  with T3 flat; Misano = T1–T3, T4–T5, T6, T7, T8–T10, T11). Max 4 corners (cut at the widest
  gap). Losses, strengths, mentors, the "recurring" check and the session's optimal lap are per
  section (section time = sum of its corner times, corners tile the lap). Inside a section the coach
  reads the split: loss then a bigger gain = "the slower T1 pays off: keep that line" (a strength,
  no "brake later"); loss not won back = "does not pay off yet"; quicker early but slower later =
  "the reference gives up time at T1 to be faster through T2". Advice for a flat corner goes to the
  previous corner's exit. Top 3 losses (≥ 0.05 s) with advice from the corner results (braking
  point, peak brake, apex speed, coasting, throttle pickup, full throttle, exit speed), strongest
  sections, "recurring" when the same section was the worst in ≥ 2 of the driver's last 3 sessions
  there. Links open the comparison zoomed on the corner or section (`&corner=N` or `&corner=8-10`).
- Distances before the corner and virtual boards (user's request: "brake at 799 m" meant nothing
  to drivers; like a track's 50/100/150 m boards): each corner's reference point = the team's median
  turn-in point on the map (`lib/corner-refs.ts`, table `corner_ref`, migration 0012; turn-in from
  the steering, `turnInAt` in lib/line.ts, searched within the corner's own part of the lap so a
  flat corner after another one keeps its own). Refreshed after each upload (`after()`), computed on
  first use for older maps, and only moved when the new median is more than 2 m away (the absolute
  figures stay put; comparisons use the same point for both laps, so their differences never move).
  `brakes` (most laps brake before it) and `brake_m` (median braking distance: boards every 100 m
  from 150 m, else every 50 m). Shown: coach ("Bob brakes 56 m before T9, you 62 m"; throttle as
  metres before/after the apex), lap-page table (braking "117 m (ref 116 m)", "9 m after" when the
  brake comes after the turn-in; throttle and full throttle ±m from the apex), boards
  (`components/Boards.tsx`, white with black numbers, 7 m off the line on the corner's outside) on
  the lap page's map and as dashed lines on the charts when zoomed to ≤ 1,500 m, and in the replay
  when zoomed in (view ≤ 500 m). Without migration 0012 or steering data everything falls back to
  metres from the line.
- Racing line (`web/lib/line.ts`, user's pick among coach improvements): for the corner each loss is
  coached on, both laps' positions against the track's white lines (`trackEdges`: edge laps, else the
  automatic outline). Per corner: inside from the reference's heading change (same side for both
  laps; kinks under 12° skipped), turn-in = back from the steering peak to 25 % of it, entry room to
  the outside line there, apex = closest to the inside line (middle of the stretch within 0.3 m),
  exit room = closest to the outside line within 150 m after it. Rooms are signed (past a line < 0:
  off the track when the two distances add up to more than the usual width + 1 m). Advice states
  only differences between the two cars (estimated lines can be off by a metre, the error cancels):
  run wide (car fully past the outside line) first, turn-in ≥ 8 m earlier, entry room +1.2 m,
  apex +0.8 m wider, apex 10-40 m earlier (both cars within 1.2 m of the inside), exit room +1.2 m;
  nothing else when either car left the track. The top line advice comes second in the corner's
  advice (replacing the generic "compare in the replay"). Checked on famas/So at Misano (T2: famas
  turns in 2.6 m closer to the outside) and Hugo's T13 off at Hungaroring.
- Session: no valid lap, track limits (≥ 25 % of flying laps), consistency (median gap > 1 %, or
  very consistent < 0.4 %), laps > 7 % off (mistakes), progress from the first valid lap, gap to the
  car's target with the session's optimal lap (sum of the best section times over its valid laps,
  2+ laps),
  short runs, race sessions. Break advice for a lasting pace drop only (user's rule):
  ≥ 3 complete laps in a row after the best lap, each > 2 % slower (one slow lap = a mistake, tyre
  wear stays under 2 %). Car damage is not in the bundle yet ("if the car was not damaged"):
  `carDamage` from the physics page would let the app flag damaged laps.
- Everyone sees everyone's coaching (the team prefers cooperation over privacy).
- Driver: continuous driving time (this session + earlier ones the same day with < 20 min gaps,
  from `recorded_at` = recording start, PC local time): tip from 75 min, take-a-break warning from
  2 h; late-night sessions (0-5 h). Sessions made only of edge laps get no coaching.
- "Focus for your next session": up to 3 items ranked by estimated gain (entry vs exit when one
  dominates, track limits, consistency). Postgres `numeric` comes back as text from postgres.js:
  cast sums to float8 (a 2 h stint was missed because of this).

## Session bundle (bundle.py)
- Gzipped JSON: metadata (source kind `motec` / `shared_memory`, track, car, session type, file
  sha256 for deduplication, server .json info if matched), corner map used (`version`, `hash`,
  `provisional`), and per lap: lap times (own, server, game), validity, exclusion codes, metrics,
  corners, traces.
- Traces: 1 m grid; time, speed, raw/clean throttle, raw/clean brake, steering (° and/or −1…1),
  gear, and for recorder sessions the car position `pos_x_m` / `pos_y_m` / `pos_z_m` (game
  coordinates); little-endian base64 integers with a scale (Int16Array/Int32Array on the JS side).
- Sizes: ~100 KB for 5 laps of 3.9 km (MoTeC); ~210 KB for 5 laps of 2.8 km with positions (fake
  recorder session); 171 KB for one Nordschleife lap (250 KB in the database).

## Database (db/migrations/)
- Tables: `driver`, `agent_token` (token hash), `track`, `car` (class for rankings),
  `corner_map`/`corner`, `server_session`/`official_lap` (.json import, all drivers),
  `session` (unique sha256), `lap` (metrics as jsonb, game lap time and validity for recorder
  sessions), `corner_result` (columns), `lap_trace`.
- Views: `best_lap`, `lap_ranking`, `corner_best`, `corner_ranking`, `theoretical_best`
  (sum of best corners). Only `comparable` laps are ranked, per track and class.
- Import of a bundle: `web/lib/import-bundle.ts` (the site) mirrors the reference
  `import_bundle` in `tests/test_db.py`: **change both together**. Refusals: unknown format,
  session already uploaded (checked first), incompatible corner map. All or nothing.
- Migrations are numbered files, never edited once applied anywhere shared: add a new one.
  0002: Discord sign-in (`driver.discord_id`, `web_session`), `session.session_type`,
  `corner_map.definition` (the map as first uploaded, served back verbatim), rankings on the most
  official time (`coalesce(official_lap_time_ms, game_lap_time_ms, lap_time_ms)`).
  0003: ratings (`driver.is_admin`, the first Discord member becomes admin; `track_target` per
  track and class; `driver_rating` = one row per rated session, the history of the rating).
  0004: `track_edge` (white lines per track and side, from edge laps; see "Track edges").
  0009: `track_outline` (automatic track surface per track; see "Track edges").
  0005: `car_target` (target lap time per track key and car key, seeded with LFM's 101 % times for
  the Ford Mustang GT3 and McLaren 720S GT3 Evo); `track_target` (per class) is unused, to drop later.
- The corner map fingerprint (`corners.map_hash`) formats numbers with one decimal: a map that
  went through JavaScript (3908.0 → 3908) must keep the same fingerprint (bug found in the
  end-to-end test).
- Car class for rankings is derived from the car key (`carClass` in `import-bundle.ts`).
- Traces as jsonb to start with; if the database grows (Neon free tier 0.5 GB ≈ 2,000
  Nordschleife laps), move to object storage (`storage_key`).

## Tests
- `python tests/test_synthetic.py`: synthetic session (.ld/.ldx/.json UTF-16) covering out-lap,
  in-lap, missing beacon, server-invalid lap, blips, chattering brake, corner detection,
  saved/rebuilt map and bundle (encode/decode round trip).
- `python tests/test_recorder.py` (~15 s, real time): the fake game (`tests/fake_acc.py --live`)
  publishes pages under a **test prefix** `Local\acctest_` (never ACC's names) through a scenario
  (menu, practice, pause, practice, qualifying, menu); checks files per session, no torn reads,
  nothing from menus, pause kept, missed-packet count.
- `python tests/test_recording.py`: full fake session written straight into an `.accrec` (pit start,
  out-lap, flying laps, game-invalidated lap, in-lap, dropped packets) → laps, flags, lap times
  (±1 ms of the game), positions, corners, bundle, plots and the `check` report.
- `python tests/test_db.py [bundle.json.gz]`: migrations + import of two synthetic drivers and a
  fake recorder session into Postgres, rankings, refusals; optional real bundle. Works in the
  `acc_test` schema, recreated on every run, so it can share the development database
  (`DATABASE_URL=postgresql://postgres:dev@localhost:5433/acc_coach`).
- Corners: `node scripts/check-corners.mjs <bundle.json.gz>` in `web/` (Node 24 runs the
  TypeScript directly); make the bundle from a real recording with `bundle.build_bundle`.
- Website: `npm run typecheck`, `npm run lint`, `npm run build` in `web/`; the end-to-end check
  (dev sign-in, tokens, upload.py with a real recording, refusals, corner map download, every
  page) is not in the repo yet: it needs a dedicated test database.
- Environment: `.venv` (`pip install -r requirements.txt`).

## Desktop app (agent/)
- Tray app (pystray): runs the recorder in a thread; each finished recording is processed and
  uploaded (`upload.upload_file`, team corner map downloaded first); Windows notifications.
  Starts with Windows (HKCU Run key, on by default at first run; menu switch). Single instance
  (mutex `ACCCoachAgent`, also used by the installer to close it before updating).
- Linking a PC: the app listens on `127.0.0.1:<random port>` and opens `<site>/link?port&state`;
  the driver signs in with Discord (`/auth/login?next=…` brings them back) and clicks "Link this PC";
  `POST /link/confirm` creates an upload token and redirects the browser to the app's callback.
- Files: `%APPDATA%\ACC Coach\` (config.json: site, token, driver; tracks/), `%LOCALAPPDATA%\ACC Coach\`
  (recordings/, uploads.json: what happened to each recording, acc-coach.log). `ACC_COACH_HOME`
  puts everything in one folder (tests). Recordings deleted after 30 days once handled.
  Pending (offline, not linked) retried every 10 min; the file being recorded is never picked up.
- Update check at start: `GET /api/app/latest` (version from `web/lib/app-release.ts`).
- Build: `powershell -File agent\build.ps1` → PyInstaller (windowed, excludes ldparser/GPL,
  matplotlib, psycopg) + Inno Setup 6 (per-user, no admin; installed with
  `winget install JRSoftware.InnoSetup --scope user`) → `agent\dist\ACC-Coach-Setup.exe` (~21 MB),
  copied to `web\public\downloads\` and `app-release.ts` updated. Release = bump `version.py`, build,
  commit, push. Unsigned: Windows SmartScreen asks "More info → Run anyway".
- **Smart App Control blocks the unsigned installer outright** (error 4551 on a teammate's PC, no
  "Run anyway"). No budget for a code-signing certificate: Microsoft Store instead (free individual
  developer account at storedeveloper.microsoft.com, ID + selfie; the Store signs the package).
- Store package (MSIX): `build.ps1` also builds `agent\dist\ACC-Coach-<version>.msix` (`-Store`:
  only that, no installer/site copy): PyInstaller folder + `agent\store\AppxManifest.xml` (template,
  runFullTrust, startup task `Enabled="true"` = on after the first launch) + images
  (`store\make_assets.py`, team mascot from `store\logo.py`; it also writes the listing images to
  `agent\dist\store-logos\`; the program icon is the mascot too; the tray icon is the helmet from
  `agent\assets\helmet.png`, bundled with `--add-data`, red dot while recording) + resources.pri (makepri; the `<packaging>` part of the generated config is
  removed, or every scale above 100 % goes to resource packs that only bundles use). Identity in
  `agent\store\identity.json` = Partner Center's Product identity (name reserved 2026-10-04:
  PCGRXhanet.ACCCoach, publisher "PCGR Xhanet"). Version = version.py + ".0" (Store: last part 0;
  every new submission needs a higher version).
  Partner Center texts (listing, age rating, certification notes): `agent\store\listing.md`;
  listing hidden (direct link only), free.
- Packaged mode (`PACKAGE` = package family name, via GetCurrentPackageFamilyName): files in the
  package's own folders by their real path (`Packages\<family>\LocalState` and `LocalCache`: Windows
  would redirect %APPDATA% writes there anyway, but Explorer only sees real paths); no Run key and
  no own update check; the menu's "Start with Windows…" opens Settings > Apps > Startup.
- Local install tests of the MSIX need admin once: unsigned packages cannot contain programs
  (0x80073D2B) and a self-signed test certificate must be trusted machine-wide (CurrentUser
  TrustedPeople is not enough, 0x800B0109). Developer Mode + `Add-AppxPackage -Register
  agentuild\msix\AppxManifest.xml` is the simplest route. The App Certification Kit
  (`appcert.exe`, in the SDK) also needs admin.
- Tested: core end to end (linking through the real page in headless Chrome, automatic upload of a
  waiting session, live recording of the fake game), the frozen exe (upload, single instance), and
  a silent install/uninstall of the installer.

## Website (web/)
- Next.js 16 (App Router, Turbopack), TypeScript, Tailwind 4, `postgres` (postgres.js, plain SQL).
  **Next.js 16 differs from older versions** (async `params`/`cookies()`, `proxy` instead of
  `middleware`…): read `web/AGENTS.md` and the docs in `web/node_modules/next/dist/docs/` first.
- Sign-in: Discord OAuth coded directly (`web/app/auth/*`, `web/lib/auth.ts`), scopes
  `identify guilds`; only members of the team's Discord server (`DISCORD_GUILD_ID`) get in.
  Every signed-in member sees everyone's laps. Sessions: random cookie, sha256 in `web_session`.
  Local development: `DEV_LOGIN=1` adds `/auth/dev?name=Alice` (disabled in production builds).
- Store test account (certification 10.3.1 refused 0.1.0 for lack of one, 2026-10-06): with
  `REVIEW_PASSWORD` set in Vercel (16+ chars), `/auth/review` (form → `/auth/review/check`, constant-time
  compare, 1 s wait on failure) signs in username `store-reviewer` as the "Store Reviewer" driver
  (`discord_id` `review-store`, not admin); "Use the test account" links on `/` and `/link` (keeps
  `next`). Its sessions are never announced on Discord. Credentials go only in Partner Center's
  Additional Testing Info > Credentials table, never its description (`agent\store\listing.md`). Unset = everything 404s / links hidden.
- Upload tokens (Settings page, `agent_token`, sha256 only) for `upload.py` and the future app:
  `Authorization: Bearer acc_…`. API: `POST /api/upload` (raw .json.gz body), `GET /api/corner-maps/<track>`,
  `/api/tokens`.
- Pages: sessions list, session (laps, status, metrics), leaderboards per track and class (best
  lap, gap, theoretical best, "vs leader"), upload, settings (tokens), and the lap page
  `/laps/<id>?vs=<other lap>`: uPlot charts on the 1 m grid (time gap, speed, throttle, brake,
  steering, gear) with shared cursor and zoom, SVG track map (ACC x/z: z points down like SVG's y,
  so no flip needed) with both racing lines and the cursor position, corner table (click = zoom).
  Traces are fetched from `/api/laps/<id>` and decoded in the browser (`web/lib/trace.ts`).
- Drivers (`/drivers`, `DriversTable.tsx`, a bit wider than the page column: `.bleed.bleed-lg`):
  rating "current/best" with its bar beneath, then each part of the current form (pace,
  consistency, clean driving, smoothness), Trend (change at the last session) and Distance (km,
  all uploaded laps); every column sorts (click its title) and has an "i" with its description;
  P1-P3 colours follow the sort. Bars and part numbers use the rank scale's colours
  (`SCALE_GRADIENT`/`scaleColor` in lib/ranks.ts, user's request): the whole 0-100 gradient cut at
  the value, so a bar blends through every rank colour below it (rating). The part bars zoom in
  (`scaleGradient`, `PART_WINDOW` = the last 20 points below the value across the whole bar) so
  they are mostly their own value's colour. Profiles
  (`/drivers/<id>`: avatar, rating, driving style, rating breakdown and history, best laps with
  position, recent sessions). Admin section in Settings (admins, "Recompute all ratings"); admins
  set target lap times on each leaderboard (`POST /api/targets`, `1:24.500`, empty = remove).
- Public pages (no sign-in): `/`, `/privacy` (privacy policy, linked from the Store listing: keep
  it in line with what the app and site do). Admins can delete a driver and all their data
  (`DELETE /api/drivers/<id>`, Settings), as the policy promises.
- Visual checks: headless Chrome through Playwright (Python package installed outside the
  project, `channel="chrome"`), screenshots of the lap page; no browser console errors.
- Settings: `web/.env.local` from `web/.env.example` (DATABASE_URL, APP_URL, DISCORD_*, DEV_LOGIN).
- Local development:
  `docker start acc-coach-dev-pg` (first time: `docker run -d --name acc-coach-dev-pg -e POSTGRES_PASSWORD=dev
  -e POSTGRES_DB=acc_coach -p 5433:5432 -v acc-coach-dev:/var/lib/postgresql/data postgres:17`),
  then in `web/`: `npm run db:migrate`, `npm run dev` → http://localhost:3000.
- Vercel caps request bodies at 4.5 MB: fine for sessions of a few dozen laps; long sessions will
  need per-lap uploads.

## Visual identity (web/app/globals.css, components/)
- Team colours: black, yellow `accent` #ffd200, red `race` #e10600 (PCGR livery); panels `panel`
  #101012 / `raised` #17171b. Classes: `.card` (+ `.card-hover`), `.display` (headings in Konexy),
  `.stripe` (yellow into red, under the header), `.rise` / `.fill` (entrance animations, staggered
  with `delay(ms)`, off with prefers-reduced-motion). Icons: lucide-react.
- Konexy = the team's livery/video font, from the user's PC (`app/fonts/KonexyPersonalUse.otf`,
  personal-use licence: fine for this private team site, not for commercial use). Headings only:
  it has **no ":" glyph**, so lap times always use Geist.
- Logo: the PCGR mascot (`public/team-logo.jpg`); the helmet crop is the favicon / header logo
  (`app/icon.png`, `app/apple-icon.png`, `public/team-helmet.jpg`).
- The name "PCGR" is always written "PC" white + "GR" pure red #ff0000 (user's request):
  `<Pcgr />` / `PCGR_RED` in components/ui.tsx (footer, home, credits, both Discord cards).
- Dashboard background video (user's request: the team's `Videos\1006.mp4`, 54 s, 3456×2160 60 fps,
  790 MB): letterbox cropped (3456×1596 from y 282), 1280 px, 30 fps, H.264 CRF 31, no audio,
  faststart → `public/media/dashboard-bg.mp4` (6 MB) + `dashboard-bg.jpg` poster (made with a
  portable ffmpeg, imageio-ffmpeg in the scratchpad). `components/BackgroundVideo.tsx`: fixed behind
  the page, darkened (gradient + vignette), loads and plays only on screens ≥ 768 px without data
  saver (else the still). Not skipped for prefers-reduced-motion: Windows sends it whenever
  "Animation effects" is off (the user's gaming PC), and the video never played. Cards over it are frosted glass (`.glass .card` in
  globals.css: 72 % panel + backdrop blur; write only the standard `backdrop-filter`, the CSS build
  dropped it when the -webkit- line was there too).
- Same video behind the YouTube page (`.glass` + `BackgroundVideo`). Dashboard welcome
  (`components/WelcomeHero.tsx`, user's request): a random quote per visit (`lib/quotes.ts`, picked
  server-side; the user's own list since 2026-10-06; `*word*` yellow, `~word~` red, `^word^` purple)
  under a small "day · name" line; big (6xl, 5xl past 70 characters), with room under it so the
  blocks start lower and the video shows on arrival. Words slide in one by one out of a blur
  (`.word-in`, 75 ms apart, played even with reduce motion; a word split by colours stays one unit,
  so it never wraps inside); scrolling blurs, fades (smoothstep) and lifts it over the first 320 px.
  Heading font: no colons; apostrophes drawn in the regular font (the heading font's sit far above
  the letters and land between the lines).
- Redesign done page by page with the user's feedback (they like Racemake's dark look and
  animations, but want simplicity for learning). Round 1: header, sign-in page, dashboard (new
  home for signed-in drivers), sessions list. Next: lap comparison, leaderboards, profiles, rest.
- Grid/flex children holding truncated text need `min-w-0`, or the page overflows on phones.
- Round 2 (user feedback): more red (section/page icons, red top edge `.card-red`, card hover,
  active nav bar, stripe); dashboard reduced to **4 blocks** (your rating with its breakdown, your
  progression: rating curve + PBs, team ranking by rating, team activity) because it had lost its
  simplicity; top bar translucent with blur and shadow, no scrolling (the active bar used to hang
  below the nav and made it scroll).
- Leaderboards: cards like LFM's track records page for the tracks the team has driven (photo
  `public/tracks/<key>.jpg` if present, read at build time in next.config.ts, else the track
  outline glowing yellow/red from the best lap with positions; flag + name pill; team best per
  class; Ford/McLaren targets), the other ACC tracks in a compact list with thumbnails. Photos:
  the user did not like the outlines, so real photos from Wikimedia Commons (free licences only,
  CC BY / BY-SA / CC0, picked by eye among 6+ candidates per track, cropped 2:1 to 1200 × 600):
  `public/tracks/<key>.jpg`, credits in `lib/track-photo-credits.json`, shown on each photo and on
  the public `/credits` page (licence requirement). Then the user sent their own ACC screenshots: they
  replace the Commons photos for all 25 tracks (Misano and the Nordschleife came a bit later);
  credit "PCGR, team screenshot", no credit on the picture. Photo availability is `hasPhoto()` in
  `lib/tracks.ts` (every ACC track): a list built in next.config.ts at build time came out empty on
  Vercel, so the live site showed outlines. Flags self-hosted in `public/flags/` (flagcdn,
  Spain simplified); every flag SVG needs a viewBox (without one it does not scale and only its
  corner shows: the "missing flags" the user saw). Names/countries: `lib/tracks.ts`.
- Telemetry section (top bar, user's request: the replay must not be hidden in sessions):
  `/telemetry` = pick a track (photo tiles, the driver's tracks first), "your lap" (yellow) and an
  optional lap to compare with (grey), then "Watch replay" (`/laps/<id>?vs=<id>&replay=1` opens the
  lap page with the replay shown) or "Open telemetry"; plus a quick "your best vs the team best".
- **ACC track keys are mixed case** ("Zolder", "Paul_Ricard", "Barcelona", "Hungaroring",
  "Silverstone"… but "brands_hatch", "misano"): stored as sent; every lookup (names, flags, photos,
  `car_target` targets) goes through the lowercase key (`trackKey`/`trackInfo`/`photoUrl` in
  lib/tracks.ts, `lower()` in SQL). Before this fix, those tracks showed outlines, no flag, and
  their ratings ignored the targets. Photo URLs carry `?v=` (bump it when photos change: browsers
  cached the old Misano photo).
- Round 3: every page in the same style (shared `.data-table`, `.btn`, `.input`, `PageTitle`,
  `SectionTitle`, `Position`, `Chip`, `Avatar`): track leaderboard with a photo banner, drivers,
  profiles, session page and coach card, lap comparison (lap cards, charts in cards), replay, track
  map, settings, download, upload, linking, privacy. Page titles: "<page> · ACC Coach".

## Team features: Discord, lap cards, achievements, head to head, mentors
- Discord: a **webhook** (`DISCORD_WEBHOOK_URL`, Vercel secret, working since 2026-10-05), not a
  bot (Vercel cannot host an always-on bot). After each upload (`lib/discord.ts`), user's rule: only
  team record (beats every earlier lap of the class), record equalled, or personal best, with the lap
  card as the embed image, plus **rank promotions** (this upload's rating only). No achievement or
  rating-change posts. Never fails an upload. Admin button "Test the Discord channel".
- Ranks (`lib/ranks.ts`, user's scale): Rookie 0, Apprentice 20, Intermediate 40, Advanced 50,
  Contender 60, Front Runner 70, Expert 80, Alien 90. `RankBadge` next to ratings (drivers list,
  profile, dashboard).
- Lap cards: `/api/cards/lap/<id>.png` (next/og ImageResponse, 1200 × 630, track photo, Konexy). Open
  to signed-in members, or with `?s=` = HMAC(CARD_SECRET or DISCORD_CLIENT_SECRET, lap id) so Discord
  can fetch it. Font and photos read from disk: traced via `outputFileTracingIncludes` in
  next.config.ts. "Share" button on the lap page (preview, copy link, download). Privacy policy
  mentions both.
- Achievements (migration 0006, `lib/achievements.ts`): 11 rules (first session "Welcome aboard",
  first valid lap, 10 clean laps in a row, metronome 5 laps within 0.3 s, 100/500 laps, 5 tracks,
  Endurance 45 min in one stint (= session), team record and target beaten per track, 3 records
  held). Rating badges were dropped: ranks cover them. Checked after each upload; "Recompute
  all ratings" also replays achievements (no Discord posts). Shown on profiles (locked ones greyed).
- Head to head: `/drivers/compare?a=&b=&by=corners|sections`: shared tracks/classes (best laps),
  tracks won, corners faster (corner_best on the latest map) or sections faster (Corners | Sections
  switch under the score, user's request: sections from both drivers' best laps on the map, best
  pass through each section on one lap, `sectionCounts`), replay link per track (keeps `by`).
  Shared SQL: `lib/sections-db.ts` (`sectionTables`, `sectionsFromLaps`), also used by the coach.
- Mentors: for each of the coach's 3 weak sections, the teammate with the best pass through all of
  it on one lap (same map and class, ≥ 0.03 s faster) with a link to the replay of both laps zoomed
  on the section. Still per corner: the `theoretical_best` view.

## Session conditions (app 0.1.2, migration 0008)
- `recording.session_conditions`: while live (menus read 0 °C): air and track temperature at the
  start and end (mean of the first/last 2 % of samples), grip (most frequent and worst
  `trackGripStatus`: green, fast, optimum, greasy, damp, wet, flooded), worst `rainIntensity` (none …
  thunderstorm), median wind (m/s → km/h, null when 0), in-game `clock` at the start. Sent as
  `session.conditions` in the bundle, stored in `session.conditions` (jsonb), shown on the session
  page, the lap cards and the sessions list (`components/Conditions.tsx`). Older sessions: none.
- Brands Hatch recording: air 16 °C, track 22 °C, optimum grip, dry, 12:00, wind 0.

## Events and race results (REMOVED 2026-10-05, to re-implement later)
The user found the section too vague and had it removed from the site. The tables of migration
0007 stay in the database (no data dropped), and the app still sends `driver_name`. The last code is
in commit a0a6fe2: `git show a0a6fe2:web/lib/events.ts` (also web/lib/results.ts, web/app/events/,
web/app/api/events/, web/app/api/results/, web/components/LocalTime.tsx, and the Events link in NavLinks). As it was:
- `/events`: upcoming (photo cards, local time + countdown via `LocalTime`, sign-ups yes/maybe/no,
  avatars) and past (team's best race position). Admins create/edit/delete (title, track, start in
  their own time zone → stored UTC, length, sprint/endurance, league, server, notes, mandatory pit
  stops, max stint).
- Event page: sign-up + planned car; readiness per driver on the event's track and class (valid laps
  in 30 days, best lap, race pace = mean of 5 best laps in 60 days, % vs car target; Ready = ≥ 20 laps
  and within 2 % of the target, Building up, Not practised); endurance line-up (`suggestLineup`:
  stints = max(stops + 1, length / max stint, drivers), drivers by race pace, fastest starts and,
  with a spare stint, finishes; editable, saved in `event_stint`; clock time per stint, laps per
  stint from race pace minus ~60 s per stop).
- Results: ACC server `.json` (UTF-16 LE with BOM, or UTF-8), uploaded on the event page →
  `server_session` (+ event_id, raw kept), `server_result` (per car), `official_lap` (every lap,
  with the driver). Team drivers recognised by Steam ID (`driver.steam_id`), else by in-game name
  (`session.acc_driver_name`, stored from each upload since 0007; older sessions have none, so the
  first time an admin links them in one click: "A team driver was not recognised?"); a name match
  stores the Steam ID. Same file twice refused. Race pace per team driver on racing laps only (valid,
  within 5 % of their best: pit/incident laps out). `CAR_MODELS` maps ACC car model ids to names.
- Discord: no event posts (the user limited posts to records, PBs and promotions).

## Storage (web/lib/storage.ts, web/lib/trace-store.ts)
- Neon free plan: 0.5 GB. Lap traces are ~99 % of the data (a lap's times/metrics/corners ≈ 1 KB).
- Traces stored compressed: per channel, wrapping differences between consecutive integers, deflated,
  base64 (`enc: "dz"` in the jsonb). Brands Hatch lap 82 KB → ~18-23 KB (3.5-4×), lossless (checked
  on every test lap through /api/laps). Bundles from the app stay plain; packing happens at import,
  `/api/laps` unpacks for the browser, server code reads with `decodeStored`. Old plain traces: 10
  compressed per upload, or all at once with the admin button (then `vacuum full lap_trace`).
- Pruning after each upload: traces of non-comparable laps (invalid, out/in-laps, incomplete) after
  7 days, except edge laps; all traces after 60 days except each driver's best laps per track/class
  and last 10 sessions.
- Admin gauge (Settings): database size vs 512 MB, biggest tables, traces count and average size.
- If the team grows a lot: traces to Cloudflare R2 (10 GB free), results stay in Postgres.

## Header (app/layout.tsx, components/NavLinks.tsx; redesign 2026-10-07, user's request)
- Three groups: logo + wordmark; the sections in a recessed tray (current one = raised tile, yellow
  icon, red bar); on the right "Get the app" (the only yellow button) and the account capsule
  (guide | profile | sign out, thin dividers, sign out turns red on hover). Labels shown by width so
  nothing overlaps (the old header overlapped at ~1100 px and overflowed on phones): section labels
  from xl, "Get the app" from lg, name from xl (max 6 rem, truncated), "Guide" label from 2xl, where the header may now be 1536 px wide (max-w-screen-2xl, wider gaps; it was capped at 1280 px; earlier the label made
  the row 28 px too wide at 1536 px, the user's 1920 screen at 125 %, and the tray showed a scrollbar;
  the tray's scrollbar is hidden anyway). Checked with a long name from 320 to 1920 px: no overflow. Below md the tray takes a second
  row; the wordmark hides under 380 px.

## Cookies and browser storage (2026-10-07, user's question "do we ask for permission?")
- Only the sign-in cookie (strictly necessary: exempt from consent under the EU ePrivacy rules /
  CNIL). Per-member state that is not strictly necessary lives on the account instead (migration
  0013, `driver.quote_deck`, `driver.guide_seen_at`), so no consent banner is needed and the privacy
  policy ("no other cookies") stays true. The lap page's corners/sections choice stays in
  localStorage: an interface setting the user picks (exempt), mentioned in the policy. Keep it that
  way: anything new to remember goes on the account, not in a cookie or browser storage.
- Dashboard quotes: a shuffled deck per driver (lib/quotes.ts `nextQuote`, "3.7.1~5" = still to
  come ~ last shown): all 14 before any repeat, a new deck never starts with the last one.

## Guide for newcomers (components/Tutorial.tsx, 2026-10-07)
- User's request: no new section; a "?" button in the header (next to the name, "Guide" on wide
  screens) opens a 10-slide slideshow over the page, blurred behind (portal on <body>: inside the
  header's backdrop-filter a fixed element is held to the header). Opens by itself until the
  member first closes it (`driver.guide_seen_at`, migration 0013, set by POST /api/guide-seen with
  keepalive, so a refresh right after closing does not cancel it); then the ? shows a green tick. Arrows, dots, ←/→, swipe; Esc, ✕ or a
  click outside close it; page scroll locked while open. All slide texts share one grid cell so the
  window keeps one height. Pictures: `public/media/tutorial/*.webp` (1200 px, ~30 KB), screenshots
  of the local test site at 1440x900 without the header (engineer: the real Brands Hatch replay);
  retake them when a page changes a lot. Titles avoid apostrophes (Konexy's sits too high).
- The Store test account ("Store Reviewer") is left out of the Drivers list.

## Ratings and profiles (web/lib/ratings.ts, web/lib/style.ts)
- Overall Driver Rating 0-100, computed by the site after each upload (`rateSession`), never by
  the app. Session score = weighted pace / consistency / clean / smoothness (formulas in the header
  of `ratings.ts`; a part that cannot be measured is left out). Provisional until 3 sessions.
- Discord rank-up post (user: "dull"): title "X ranks up: A → B", bold rating, and an image
  `/api/cards/rank/<driver>.png?from&to&s` (signed, lib/cards.ts `rankCardUrl`): old rank gauge →
  new rank gauge in their colours, glow, gradient stripe, driver and rating (next/og).
- Rank symbols (user: the Drivers text was too long, then "a gauge, not icons"): `RankSymbol` in
  components/ui.tsx = a gauge whose needle climbs with the rank (Rookie nearly empty, Expert maxed
  out), Alien = an alien head. Rank colours = weather-map temperature scale (lib/ranks.ts): Rookie
  white (was blue, too close to Apprentice's), Apprentice light blue, Intermediate cyan, Advanced green, Contender yellow, Front Runner
  orange, Expert red, Alien purple. `RankIcon` next to driver names (Drivers list, dashboard
  ranking, profile, track leaderboards), `RankBadge` = symbol + title, `RankScale` = the scale above
  the Drivers list (segments as wide as their rating range, colours blending).
- Next rank (`NextRank` in components/ui.tsx, user's choice): "7.5 points to Contender" + a bar from
  the current rank's floor to the next, on the dashboard's rating card and the profile header.
  Idea on hold (user will think about it): a track only counts in the rating after a couple of
  sessions there, so learning a new track does not lower it.
- Bars and numbers in the rank scale's colours everywhere (components/ui.tsx): `PartBar` (zoomed
  in, the last 20 points below the value: ratings on the Drivers table and the dashboard's team
  ranking too, since the full spectrum showed mostly blue; user's request), `ScaleNumber` (a 0-100
  value in its colour; ratings use their rank's colour), `RatingBar` (the whole gradient cut at the
  value, now unused). Drivers table: the rank's name in a pill (rank colour border and tint). Dashboard block titles are the links
  (`SectionTitle href`, small arrow; user's request, no grey corner links): rating → profile,
  progression → /progress, team ranking → /drivers, team activity → /sessions.
- Progression (`/progress`, user's request, opened from the dashboard's "Your progression" and the
  title of "Rating over time" on your own profile; Dashboard stays highlighted in the menu): the
  rating after each rated session on rank bands with a ▲ the first time each rank is reached; the
  four sub-ratings of the current form after each session (`ratingHistory` in lib/ratings.ts
  replays formSessions row by row), one at a time (switch); per track and class, each session's best
  valid lap (dots, faster = higher) with the PB step line and the team best (dashed). Sessions very
  slow for the track (over PB + 6 %) leave the lap chart. Charts: `components/TrendChart.tsx`
  (client, drawn at the box's width, line in the scale's colour at each height, hover tooltip),
  `ratingDomain` in lib/chart.ts (server pages cannot call a client module's function). The
  dashboard and profile use the same chart (rank bands) instead of their own SVGs.
- Fuel correction (user's request, 2026-10-06; app 0.1.6): the app sends each lap's average fuel
  (`metrics.fuel_l`, litres; no migration). The rating removes what the fuel above a minimum-fuel
  reference cost (`web/lib/fuel.ts`; user: hotlaps run on 5-10 L, so no bonus below it): 8 L on
  tracks under 5 km, 10 L on longer ones, 15 L on the Nordschleife. Seconds per 10 kg per track
  measured in ACC by OhneSpeed (Nordschleife 0.78, Spa 0.2…; 0.16 for tracks not measured), 0.72 kg/L. Only the driver's own laps are corrected, for their pace score: references and targets are always real times (user: a corrected lap was never driven, so nobody can compare with it). Leaderboards and records keep real times; the
  session page shows a Fuel column ("48 L +0.46 s"). Laps from older apps are not corrected.
- Weights per session type (user's values, `WEIGHTS_BY_TYPE`): "Practice (Mixed running)" 55/25/10/10
  (also unknown types; separate "mixed running" type merged into it on 2026-10-07, a stored "mixed"
  reads as practice), qualifying 62/18/10/10 (also hotlap, superpole), race 45/30/15/10 (also hotstint). The type comes from ACC unless someone in the team picks another on
  the session page (`session.rating_type`, migration 0010; `RatingType.tsx` →
  `/api/sessions/[id]/rating-type`, which replays that driver's ratings: `rebuildDriverRatings`).
- Rank promotions are posted to Discord after rating replays too (Recompute all ratings, session
  type changed, edge laps: `announcePromotions` compares every driver's rating before / after);
  the user noticed two promotions from a recompute went unannounced. Rank drops are never posted.
- Consistency against each run's trend (user: tyre wear offsets the fuel gain, his Kyalami stints
  drift 1.2 s over 70 min; ACC does not publish tyre wear): `lapGaps` splits the session at pit
  laps; on runs of 6+ valid laps the reference follows the run's robust trend (median of pairwise
  slopes) shifted to its lowest lap, so steady drift (fuel, wear, track) is not counted, only the
  scatter; shorter runs (hotlaps) keep the gap to the best lap. Simulated stint: 77 → 97.
- Consistency scale widened (user: "too nice for some, too harsh for others"): 0.1 % → 100, 3 % → 0
  (was 0.3 % → 100, 2 % → 0).
- Invalid laps in consistency (user, 2026-10-07: famas' Misano qualifying sim had 4 valid laps within
  0.2 % and 20 invalid ones scattered up to 1.7 %, consistency 100): average of the gaps (was the
  median, which ignores how bad the bad laps are), each capped at 3 % (a spin = one maximally
  inconsistent lap). Invalid flying laps measured against the same reference (absolute gap: they can
  be faster): race = like valid laps; practice / qualifying = half weight (`INVALID_WEIGHT`) within 3 %,
  ignored beyond (possibly abandoned once invalid). Checked read-only on production before the
  change (`tools/ratings/consistency_compare.py`, reads DATABASE_URL from the gitignored web/.env.production.local): famas 100 → 88.8 on that session, ratings moved ≤ 1
  point; no race session existed yet to check the race rule on.
- Rating = **current form** (since 2026-10-05; before: moved 30 % towards each session score, which
  the user found too low for a driver whose learning sessions dragged it down): best session score
  per track in the 60 days before the driver's latest session, sessions with 5+ valid laps (all of
  them when none has), averaged over the tracks (`formSessions`). The rating breakdown and driving
  style average those same sessions (`formParts`). **All-time best** = highest rating once no longer
  provisional (`allTimeBest`), shown as "current/best" on the Drivers list and under the rating on
  profiles. After deploying a formula change, an admin clicks "Recompute all ratings" (Settings).
- Pace score's 100 (hidden, `ratingReference` in lib/targets.ts; user's rule 2026-10-07) = the car's
  LFM 101 % target on the track, exactly: a teammate beating it must not lower everyone else's pace
  (team: within 1 % of LFM's all-time best = alien). A car without a target uses the average of its
  class's targets on that track; a track without any target, the team's best real lap in the class.
  Before: the faster of the target and the team best (the BMW at Zolder, driven by one driver, was its
  own reference: pace 100 → 24.3 with the change). Targets: LFM's 101 % times, per car (the user chose
  them as "more achievable than 100 %"); admins edit them on each leaderboard. The displayed reference
  (`paceReference`: target or the team best when faster) stays for the leaderboards and coaching notes.
- Ratings are history (`driver_rating`), not recomputed automatically when targets change; the
  admin button `rebuildRatings` replays every session in upload order (needed once on production
  after migration 0003, for sessions uploaded before ratings existed).
- Driving style: no AI, comparisons only. Corner traits = the driver's per-corner medians vs
  teammates' on shared corners (braking point, apex speed, throttle pickup, coasting), needs 3
  shared corners; session traits (consistent, clean, smooth…) need 8 valid laps in the last 5
  rated sessions. Thresholds are first guesses: tune them on real team data.
- Trace pruning after each upload (`pruneTraces`): traces older than 60 days are deleted, except
  each driver's best laps and their last 10 sessions. Lap times, metrics, corner results and
  ratings are kept forever (the user first suggested deleting session data after rating; we kept
  the small numbers, only traces are large).

## Next steps
- Vercel functions pinned to **Frankfurt (fra1)** in `web/vercel.json`, next to Neon: by default they ran
  in Washington (iad1, seen in the X-Vercel-Id header), ~90 ms per query; "Recompute all ratings"
  (≈ 15 queries per session) had grown to ~30 s.
- Deployed (2026-10-04): https://acc-coach.vercel.app — GitHub Xhanet/ACC-Coach (private, pushes
  deploy automatically), Vercel root directory `web/`, Neon Postgres (Frankfurt; pooled address for
  the site, direct address for `npm run db:migrate`), Discord application with redirects for
  localhost and the site. Settings are trimmed in code: a tab pasted into APP_URL once broke sign-in.
- More real recordings: other tracks/cars, a multiplayer server session, a session with pit stops.
- Track surface: automatic since 2026-10-05 (see "Track edges"). Check it on the real tracks
  (Nordschleife especially: no TUM data, tight sections) once deployed.
- App 0.1.1 (ABS channel): installer published on the site; `ACC-Coach-0.1.1.msix` to submit to the
  Store once 0.1.0 has passed certification.
- Coaching: tune thresholds with real sessions; maybe the rating change and the top focus in the
  desktop app's upload notification (needs an app release).
- Corner maps: done on the site (geometry). Mount Panorama upgrades at its next upload (or an
  admin rebuilds it); check its result on the real layout and tune the thresholds if needed.
- Microsoft Store release of the desktop app (see "Desktop app"): the teammate install failed on
  Smart App Control. Name reserved; first submission (0.1.0) to upload by the user, then the
  Store link goes on the site's download page.
- Production: migration 0003 applied on Neon (2026-10-04); "Recompute all ratings" to click once.
- Ideas not requested yet: rating change in the app's upload notification, coaching summary per
  session, stint view, server results import.
- Name the corners of the team's tracks; weighted composite ranking to define with the team.
- Safer .json matching when `head.driver` is empty: carModel ↔ car-from-file-name table.

## YouTube (web/lib/youtube.ts, /youtube, 2026-10-06)
- The team's channel @PCGroupRacing (id UCGSgxcvFG5fMuAOMoJAQBZA, title "PCGR"), YouTube Data API v3
  with `YOUTUBE_API_KEY` (user's free key; in `web/.env.local` and Vercel, never in git). Calls
  cached 1 h (`next: { revalidate: 3600 }`), 1 quota unit each (10,000 a day free).
- Three sections (user's choice A): Livery reveals, Hotlaps, Highlights, fed by the channel's public
  playlists whose title contains "livery", "hotlap" or "highlight". Videos in none are not shown
  (the channel also has non-racing videos), except while none of these playlists exists: then the
  30 latest uploads with a note on creating them. Videos play on the page (youtube-nocookie embed).
- YouTube images need `referrerPolicy="no-referrer"` (the channel avatar is refused otherwise).
- The menu got a 7th link: the header's nav is `max-w-7xl` (labels nowrap) so it stays on one line.

## Race engineer (app 0.1.7, agent/engineer.py, agent/engineer_server.py, agent/assets/engineer.html)
- User's request (ACC Drive-like, kept simple): a live page served by the app at
  http://localhost:8780 (8781/8782 if busy), tray "Race engineer (live)"; "Share the engineer on my
  network" binds 0.0.0.0 (phone, tablet, teammate on the Wi-Fi; Windows asks for firewall access the
  first time). Read-only; its settings are saved in config.json ("engineer").
- A thread reads the shared memory at ~20 Hz (separate from the recorder) into `Engineer.feed`;
  samples with all padLife at 0 are skipped (garage/loading: ACC zeroes the car's data).
- Checked on the real Brands Hatch recording: tyreWear and wheelLoad stay 0 (ACC does not fill
  them, and there is no tread depth anywhere: "read wear after a pit stop" is not possible);
  wheelPressure, tyreCoreTemp, padLife (29 mm new) / discLife (32 mm), fuel, fuelXLap, mfd
  pressures are live. carDamage / suspensionDamage exist (scale not checked yet: no contact recorded).
- Fuel: per lap = mean of the last 3 non-pit laps (game estimate before); timed race: laps left =
  ceil((time left − rest of this lap) / avg lap) + 1; needed = (laps left + margin) × per lap;
  to add capped at the tank; stops; longest stint on a full tank.
- Pressures (team: 26.9 psi hot on all four): average hot pressure and core temperature at > 50
  km/h per lap. Reference = the first lap completed past 15 km in the stint (user: 10 too short,
  ACC Drive uses 20); reset at each pit exit. Pressure loss (kerbs, contact; user: like ACC Drive's
  yellow number) = gas-law pressure from the reference at the lap's core temperature − measured.
  Advice uses the pressure without loss (so end-of-stint leaks do not push it up): set = pit-menu
  pressure + (target − (measured + loss)). Fuel-only stops keep the tyres but reset the reference.
- Tyre wear %: fuel-corrected lap time trend (Theil–Sen) over the stint's valid flying laps (first
  one left out), from 4 laps; 100 % = `tyre_worn_pct` (2.8 %: team, ~3 s at Spa) slower than the
  stint's best early lap. Brakes %: 90 × (new − now) / (new − `pad_worn_mm`): new pads (29 mm) 0 %,
  10 mm = 90 % (an ACC dev: the HUD shows a red dot on the disc under 10 mm, risk of failure below);
  new = highest seen since a jump up (new pads at a stop); mm per lap, laps to 10 mm, warnings.
- Settings defaults (`DEFAULT_SETTINGS`, the team's values): target 26.9 psi, advice after 15 km,
  100 % tyre wear = 2.8 % slower, pads at risk under 10 mm (= 90 %), fuel margin 1 lap. Damage
  scale still to check on a recording with contact.
- Temperatures & brake ducts (app 0.1.8, user's request): tyre core (live, lap average) and brake
  temperatures (live, lap peak, lap average) per wheel; tyreTempI/M/O stay 0 in ACC (no surface
  temps). Windows from ACC 1.8+ guides (Coach Dave v1.8 FAQ, The Pit Crew, Trinacria): tyre core
  optimal 75-90 °C (working 70-100, overheating above); brake lap peaks front 450-700 °C, rear
  300-500 °C (guides: front ≤ 650, occasionally 700; rear ≤ 450, occasionally 500). Duct advice per
  axle from the median of the last 3 laps' peaks: above → open 1 click (2 if > 75 °C over), below
  → close 1; cold pressure compensation = clicks × `duct_psi_per_click` (0.2 psi: Trinacria;
  Coach Dave: ducts have minimal effect on tyre temps since 1.8, hence a setting). Real Brands
  Hatch recording: fronts peak ~610-650 °C (keep), rears ~507 °C (open 1). Pad compound shown.
- Own window (app 0.1.9, user's request: "why a website?"): the tray item opens the page in a
  Chromium app window (`--app=URL`: no tabs or address bar, own taskbar entry) of Chrome, Edge or
  Brave (`app_browser`: App Paths in the registry, else the usual folders; Edge is NOT on the
  user's PC, Chrome is), else the default browser. No extra dependency (pywebview not needed).
- Fuel weight table duplicated from web/lib/fuel.ts (keep in sync).
- Test: `python tests/test_engineer.py` (fake session replay, the real recording when present,
  live fake ACC + the page's /state). fake_acc fills pads, discs, pressures, temps, race clock.

## Lap clocks (app 0.3, 2026-10-07)
- User's report: the coach's entry + exit (1.99 + 2.42 s) did not add up to the gap (3.54 s) at
  Barcelona. Audit of all 180 stored traces (read-only, lap API): 10 disagreed with their lap time.
  (1) Pauses: ACC keeps sending physics packets while paused but its lap timer stops, and the app
  timed laps on the packet counter, so a pause stood in the trace at one metre (famas, Mount Panorama,
  Oct 7: +1.99 s at 6,161 m; So, Zolder: +149 s). (2) Very short sessions (1-2 laps): the counter's
  step, calibrated on the session's laps, came out a few % off (xhanet, Barcelona: -0.89 s, the
  coach's reference; So, COTA: -6.5 s). Lap times themselves (game / server) were always right.
- App 0.3 (recording.py `lap_timer`): each lap is sampled on the game's lap timer (iCurrentTime):
  within each stretch where it runs, timer vs packet clock is fitted with a line (no polling jitter);
  the timer standing still > 50 ms (or status paused) = a pause, which takes no time. Lap time = the
  game's iLastTime when published, else the fit (hotlap laps: within 1 ms on the real recording).
  Real Brands Hatch recording: traces within 1.7 ms of the old clock (no pause there). Tests: fake ACC
  can pause like the real game (`pauses=`: packets keep coming, car frozen, timer stopped),
  tests/test_recording.py `lap_timer` (30 s mid-lap and 2 s pre-line pauses, a 5 %-off clock).
- Site (lib/trace-time.ts `repairTraceTime`, lib/trace-repair.ts): a trace whose last metre is more
  than 0.15 s off the lap's game/server time is repaired: excess time is cut where metres took far
  longer than their speed explains (pauses), the rest (or a slow clock) is spread evenly so the trace
  ends on the lap time. At upload (older apps: such laps skip the app's corner results; afterUpload
  recomputes them), and once from Settings → "Repair lap traces" (admins; safe to rerun). Laps
  without a game/server time are left alone. Checked on the 10 real faulty laps (all within 0.03 s
  after) and 25 good ones (untouched).
- Coach: the leftover between the summed zones and the lap-time gap (the traces end a few hundredths
  before the line) goes to the finish straight (last corner's exit): entry + exit = the gap shown.
- Version naming (user): 0.3, not 0.2.1, building up to the Store's "1.0".

## Hotlap laps, track lengths, outline from cuts (app 0.2.0, 2026-10-06)
- Hotlap mode does not count invalid laps in `completedLaps` (user's Hungaroring hotlap session
  became one 6:38 / 13.8 km "lap"): `_crossings` also splits where the track position wraps and the
  lap timer resets (within 10 frames; instant = the timer reset). Reference length = median of the
  laps covering 0-100 % of the track (`trackSplineLength` is 0 in ACC). Game clock calibration per
  timer cycle, skipping cycles with a pause (the packet counter runs during pauses, the timer does
  not: clean cycles are exactly 2.5000 ms per packet). Engineer: lap end = timer reset, time
  corrected to iLastTime when completedLaps confirms it.
- Track length: that session stored 13.8 km for Hungaroring, the lap API scaled corners by
  track length / map length → corners past the line. The lap API now scales by the lap's own trace
  length; uploads with valid laps correct a stored length > 3 % off; migration 0011 fixes stored
  ones (median of valid laps).
- ACC track keys can be capitalised ("Hungaroring", "Barcelona"): the TUM lookup is lowercase now.
- Outline (VERSION 3): laps-only guess blends the band middle with an out-in-out model (curvature
  ±15 m vs ±120 m: apex inside, entry/exit outside) by how much of the width the band covers
  (Hungaroring vs TUM: 2.77 → 2.51 m median). Invalid laps (track limits only) with the app's
  `valid` channel (0.2.0, per metre) count outside −50/+80 m around the cut, and the cut's farthest
  point gives an edge bound (≥ 0.8 m inside it, never inside the laps' band).
- Sessions can be deleted by admins only (user: drivers deleting their own bad sessions could manipulate their rating; ratings replayed): to re-upload one cut by an older
  app. The user's 2026-10-04 Hungaroring hotlap session, rebuilt with 0.2.0 (2 valid laps 1:46.695,
  1:45.067), was put on their Desktop to upload after deleting the old one.
