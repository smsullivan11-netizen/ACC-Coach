-- Target lap times per track and car (they differ between cars on the same track), replacing the
-- per-class targets of 0003 (none was ever set). track_target is kept for now, unused, so the site
-- version still running while this migration is applied keeps working: drop it in a later migration.
-- Keyed by the game's track and car keys, so a target can exist before anyone has driven there.
-- The rating's pace reference is the faster of the car's target and the team's best lap in that car.
-- Seed: LFM ACC lap time sheet, 101 % times (team's choice: more reachable than the 100 % top times),
-- for the team's two main cars. Laguna Seca and Snetterton have no time on the sheet.
create table car_target (
    track_key  text not null,               -- "brands_hatch"
    car_key    text not null,               -- "ford_mustang_gt3"
    target_ms  int not null check (target_ms > 0),
    source     text,                        -- where the time comes from
    set_by     bigint references driver on delete set null,
    set_at     timestamptz not null default now(),
    primary key (track_key, car_key)
);

insert into car_target (track_key, car_key, target_ms, source) values
-- Ford Mustang GT3 (2024)
('barcelona',       'ford_mustang_gt3', 102950, 'LFM 101 %'),
('brands_hatch',    'ford_mustang_gt3',  82570, 'LFM 101 %'),
('cota',            'ford_mustang_gt3', 125510, 'LFM 101 %'),
('donington',       'ford_mustang_gt3',  86000, 'LFM 101 %'),
('hungaroring',     'ford_mustang_gt3', 102680, 'LFM 101 %'),
('imola',           'ford_mustang_gt3',  99970, 'LFM 101 %'),
('indianapolis',    'ford_mustang_gt3',  95870, 'LFM 101 %'),
('kyalami',         'ford_mustang_gt3', 100220, 'LFM 101 %'),
('misano',          'ford_mustang_gt3',  93080, 'LFM 101 %'),
('monza',           'ford_mustang_gt3', 106620, 'LFM 101 %'),
('mount_panorama',  'ford_mustang_gt3', 119400, 'LFM 101 %'),
('nurburgring_24h', 'ford_mustang_gt3', 489170, 'LFM 101 %'),
('nurburgring',     'ford_mustang_gt3', 113510, 'LFM 101 %'),
('oulton_park',     'ford_mustang_gt3',  92310, 'LFM 101 %'),
('paul_ricard',     'ford_mustang_gt3', 112930, 'LFM 101 %'),
('red_bull_ring',   'ford_mustang_gt3',  87630, 'LFM 101 %'),
('silverstone',     'ford_mustang_gt3', 117430, 'LFM 101 %'),
('spa',             'ford_mustang_gt3', 136380, 'LFM 101 %'),
('suzuka',          'ford_mustang_gt3', 118700, 'LFM 101 %'),
('valencia',        'ford_mustang_gt3',  90520, 'LFM 101 %'),
('watkins_glen',    'ford_mustang_gt3', 103070, 'LFM 101 %'),
('zandvoort',       'ford_mustang_gt3',  95390, 'LFM 101 %'),
('zolder',          'ford_mustang_gt3',  87580, 'LFM 101 %'),
-- McLaren 720S GT3 Evo (2023)
('barcelona',       'mclaren_720s_gt3_evo', 103530, 'LFM 101 %'),
('brands_hatch',    'mclaren_720s_gt3_evo',  82780, 'LFM 101 %'),
('cota',            'mclaren_720s_gt3_evo', 125600, 'LFM 101 %'),
('donington',       'mclaren_720s_gt3_evo',  86230, 'LFM 101 %'),
('hungaroring',     'mclaren_720s_gt3_evo', 103190, 'LFM 101 %'),
('imola',           'mclaren_720s_gt3_evo', 100500, 'LFM 101 %'),
('indianapolis',    'mclaren_720s_gt3_evo',  96320, 'LFM 101 %'),
('kyalami',         'mclaren_720s_gt3_evo', 100640, 'LFM 101 %'),
('misano',          'mclaren_720s_gt3_evo',  93120, 'LFM 101 %'),
('monza',           'mclaren_720s_gt3_evo', 106940, 'LFM 101 %'),
('mount_panorama',  'mclaren_720s_gt3_evo', 120580, 'LFM 101 %'),
('nurburgring_24h', 'mclaren_720s_gt3_evo', 488900, 'LFM 101 %'),
('nurburgring',     'mclaren_720s_gt3_evo', 113390, 'LFM 101 %'),
('oulton_park',     'mclaren_720s_gt3_evo',  92820, 'LFM 101 %'),
('paul_ricard',     'mclaren_720s_gt3_evo', 113300, 'LFM 101 %'),
('red_bull_ring',   'mclaren_720s_gt3_evo',  87940, 'LFM 101 %'),
('silverstone',     'mclaren_720s_gt3_evo', 117690, 'LFM 101 %'),
('spa',             'mclaren_720s_gt3_evo', 136790, 'LFM 101 %'),
('suzuka',          'mclaren_720s_gt3_evo', 119090, 'LFM 101 %'),
('valencia',        'mclaren_720s_gt3_evo',  90420, 'LFM 101 %'),
('watkins_glen',    'mclaren_720s_gt3_evo', 103370, 'LFM 101 %'),
('zandvoort',       'mclaren_720s_gt3_evo',  95280, 'LFM 101 %'),
('zolder',          'mclaren_720s_gt3_evo',  87840, 'LFM 101 %');
