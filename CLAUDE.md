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
- Missing: steering lock of cars newer than the doc (Ford Mustang GT3…): steering stays in % of lock
  until a lock table entry is added (e.g. from a MoTeC export of the same car: STEERANGLE vs steerAngle).

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
- Track surface on maps (asphalt between two white lines, `components/TrackSurface.tsx`): ACC has
  no edges, so they come from two **edge laps** driven slowly with the left / right wheels on the
  white line (driving direction), uploaded as usual, then picked by an admin on the track map page
  (Leaderboard → track map & corners). Edge = the lap's line moved outward by 1.0 m (car centre to
  the outer side of the tyres), one point every 2 m. An edge lap gets the excluded reason
  `track_edges` (out of rankings, ratings, corner maps; ratings replayed); clearing restores it.
  Read paths tolerate a database without migration 0004 (no surface drawn).
- The user's choice: a Racemake/ACC Drive-like track view. Estimating edges from the team's laps
  was rejected: racing lines only touch the edges at corners and few laps give a narrow band.
- Replay on the lap page ("Replay both laps"): both cars placed by **elapsed time** (inverse of
  the `time_s` channel), drawn as 4.6 × 2.0 m cars with a brake light, follow camera (close /
  medium / wide = 120 / 250 / 500 m view, centred between the cars when close) or whole track,
  0.25×-4×, timeline, live speed / gear / throttle / brake and gap ("ahead by 0.385 s · 20 m":
  time since the leader passed the follower's position). Lines in driver colours or by inputs
  (braking red, ABS working blue, full throttle green, part throttle yellow, coasting grey).
- ABS (user's request, replacing a brake light): a flashing dark-blue light at the front of the car
  while the ABS works, the brake bar and the brake chart in blue there. ACC's `abs` float is the
  ABS intervention (only while braking: 37 % of hard-braking samples, ~1,000 pulses of ~10 ms in a
  3-lap session). The recorder sends `abs_pct` (bundle channel, from app 0.1.1) = share of the last
  50 ms with ABS working, so the 1 m grid keeps the pulses; older sessions have no ABS data. The charts' cursor
  follows the first car (every chart, `setCursor`). Drawing runs outside React (rAF + refs).
- Replay HUD: per car, a rolling graph of the last 4 s of throttle (green) and brake (red, blue
  with ABS) above the bars. Charts: values under the cursor in each chart's title (both laps).
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
  counts as the previous corner's exit. Top 3 losses (≥ 0.05 s) with advice from the corner
  results (braking point, peak brake, apex speed, coasting, throttle pickup, full throttle, exit
  speed), strongest corners, "recurring" when the same corner was the worst in ≥ 2 of the driver's
  last 3 sessions there. Links open the comparison zoomed on the corner (`/laps/<id>?vs=…&corner=N`).
- Session: no valid lap, track limits (≥ 25 % of flying laps), consistency (median gap > 1 %, or
  very consistent < 0.4 %), laps > 7 % off (mistakes), progress from the first valid lap, gap to the
  car's target with the session's optimal lap (sum of the best corner times over its valid laps),
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
  (`store\make_assets.py`) + resources.pri (makepri; the `<packaging>` part of the generated config is
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
- Upload tokens (Settings page, `agent_token`, sha256 only) for `upload.py` and the future app:
  `Authorization: Bearer acc_…`. API: `POST /api/upload` (raw .json.gz body), `GET /api/corner-maps/<track>`,
  `/api/tokens`.
- Pages: sessions list, session (laps, status, metrics), leaderboards per track and class (best
  lap, gap, theoretical best, "vs leader"), upload, settings (tokens), and the lap page
  `/laps/<id>?vs=<other lap>`: uPlot charts on the 1 m grid (time gap, speed, throttle, brake,
  steering, gear) with shared cursor and zoom, SVG track map (ACC x/z: z points down like SVG's y,
  so no flip needed) with both racing lines and the cursor position, corner table (click = zoom).
  Traces are fetched from `/api/laps/<id>` and decoded in the browser (`web/lib/trace.ts`).
- Drivers (`/drivers`: ranking by rating, change at the last session) and profiles
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
  class; Ford/McLaren targets), the other ACC tracks in a compact list. No photos copied from LFM
  (theirs); flags self-hosted in `public/flags/` (flagcdn, Spain simplified). Names/countries:
  `lib/tracks.ts`.

## Ratings and profiles (web/lib/ratings.ts, web/lib/style.ts)
- Overall Driver Rating 0-100, computed by the site after each upload (`rateSession`), never by
  the app. Session score = pace 50 / consistency 25 / clean 15 / smoothness 10 (formulas in the
  header of `ratings.ts`; a part that cannot be measured is left out). The rating moves towards
  each session score by up to 30 %, less for short sessions; provisional until 3 sessions.
- Pace reference = the faster of the car's target (`car_target`, lib/targets.ts) and the team's best
  valid lap **in that car**; a car without a target uses the class's team best. The user chose "a fixed
  target, updated when someone beats it", per car (Ford and McLaren times differ by track), at LFM's
  101 % times ("more achievable than 100 %"). Admins edit them on each leaderboard.
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
- Deployed (2026-10-04): https://acc-coach.vercel.app — GitHub Xhanet/ACC-Coach (private, pushes
  deploy automatically), Vercel root directory `web/`, Neon Postgres (Frankfurt; pooled address for
  the site, direct address for `npm run db:migrate`), Discord application with redirects for
  localhost and the site. Settings are trimmed in code: a tab pasted into APP_URL once broke sign-in.
- More real recordings: other tracks/cars, a multiplayer server session, a session with pit stops.
- Track edges: the user does not want to drive edge laps on every track. The edge-lap tool stays,
  but an automatic estimate from the team's laps is the direction to explore.
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
