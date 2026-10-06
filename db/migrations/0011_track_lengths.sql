-- Track lengths from the tracks' valid laps (median distance) where the stored one, taken from the
-- track's first session, is more than 3 % off. A hotlap session cut into one 13.8 km "lap" had
-- stored 13.8 km for Hungaroring, which pushed every corner past the line on the lap pages.
update track t set length_m = x.med
from (select s.track_id, percentile_cont(0.5) within group (order by l.distance_m) as med
      from lap l join session s on s.id = l.session_id
      where l.comparable
      group by s.track_id) x
where x.track_id = t.id and abs(t.length_m - x.med) > 0.03 * x.med;
