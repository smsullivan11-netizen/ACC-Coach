-- Session type for the rating weights, chosen after the session by any team member (a practice
-- session can be a qualifying or race simulation, or mixed running). Null = from ACC's session type.
alter table session add column rating_type text check (rating_type in ('practice', 'qualifying', 'race', 'mixed'));
