# Track data

`tumftm.json`: centre lines and track widths of 11 real circuits from the TUM racetrack database
(https://github.com/TUMFTM/racetrack-database, Chair of Automotive Technology, Technical University
of Munich), licensed under the GNU Lesser General Public License v3.0 (`LICENSE-tumftm.txt`; the
GNU GPL v3 it refers to: https://www.gnu.org/licenses/gpl-3.0.txt). Converted without changes to
the values (rounded to 1 cm): per ACC track key, the source file name and the rows
`x_m, y_m, w_tr_right_m, w_tr_left_m` flattened into one array. Used by `lib/track-outline.ts` as
the starting shape and width of the track surface, then aligned to the game's coordinates and
corrected locally with the team's laps.
