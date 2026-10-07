// Starting descriptions of the cars (user's request, 2026-10-08: "do the same for every other car" as
// the Ford's, researched online). Shown on a car's page until an admin writes its own (car_rating.note
// wins). Written from Coach Dave Academy's car guides, GOSetups, Traxion.gg, GTPlanet and
// RaceDepartment / Overtake (October 2026); only what those say about ACC's car, plus its layout. The
// Ford has the user's own text in the database, so none here. Safe on server and client.

export const CAR_NOTES_SOURCE = "Researched online (Coach Dave Academy, GOSetups, Traxion, GTPlanet, Overtake), October 2026";

export const CAR_NOTES: Record<string, string> = {
  // GT3
  mclaren_720s_gt3_evo:
    "Downforce monster, the most of any GT3. Devastating through fast corners and planted at high speed. The Evo is more neutral and predictable on the limit than the 2019 car and handles kerbs better, though big kerbs still aren't its friend. Excellent traction control and lots of feedback through the wheel.",
  ferrari_296_gt3:
    "Smooth, usable twin-turbo V6 power with a forgiving yet responsive balance. The front bites on turn-in and the rear stays predictable, so it's easy to trust on the limit. Excellent on its tyres over a stint.",
  porsche_992_gt3_r:
    "Rear-engined rocket: phenomenal launch and traction out of slow corners, good straight-line speed and very strong brakes. Wants smooth hands: brake early, gentle steering, progressive throttle. Heavy braking while turning brings the rear round, and it gets snappy when driven aggressively.",
  lamborghini_huracan_gt3_evo2:
    "Naturally aspirated V10 that's strong on corner exits and off rolling starts. Pointy front end and strong rotation, but far less snappy than the old Evo. Great brakes (watch the rears locking in slow corners), low fuel use and excellent in the wet. Struggles with tyre temperatures in the heat and on low-downforce tracks.",
  audi_r8_lms_evo_ii:
    "Mid-engined V10 with lots of rotation compared with the front-engined cars, though it can understeer in slow corners with little weight on the front axle. Traditionally very quick at Spa, where snap oversteer through Eau Rouge is the trap. Less happy over big kerbs than the front-engined cars.",
  bmw_m4_gt3:
    "Big front-engined car on a fantastic platform that stays stable everywhere on the lap: one of the fastest in ACC. Fairly balanced, with some entry understeer from the weight up front. Few cars use the kerbs as well: consistent and supple over them. Keep ABS as low as you can or it pushes on the brakes.",
  mercedes_amg_gt3_evo:
    "Front-engined torque monster made for low and medium-speed tracks with big kerbs (Imola, Nürburgring, Zolder). Extremely stable under braking, precise front end and the best traction control on the grid. Understeers into slow corners and can struggle to put the power down in slow traction zones. Shrugs off small knocks and aero damage.",
  ferrari_488_gt3_evo:
    "Great all-rounder: decent top speed, a great aero platform, and its real weapon is mid-corner grip and high minimum speeds. Sensitive to kerbs and bumps, so it rewards a smooth style that dances around the track furniture: stay off steep kerbs like Zolder's and Imola's.",
  amr_v8_vantage_gt3:
    "Front-engined twin-turbo V8 with neutral, predictable handling and smooth, linear power: one of the best cars to learn ACC with. Good over kerbs, quick in the wet and the dry, and its fuel economy with a big tank helps in long races.",
  audi_r8_lms_evo:
    "The Evo II's predecessor and the same recipe: mid-engined V10 with plenty of rotation, traditionally very quick at Spa (beware snap oversteer through Eau Rouge). Less happy over big kerbs than the front-engined cars.",
  honda_nsx_gt3_evo:
    "One of ACC's better-handling cars: even weight distribution and a low centre of gravity make it predictable and consistent. Loves trail braking, so you carry more speed in than with a front-engined car, but aggressive steering just brings oversteer. Famously strong at Mount Panorama, less so on European tracks.",
  lamborghini_huracan_gt3_evo:
    "The EVO2's predecessor: the same V10 punch out of corners and the same pointy, eager front, but it often felt overly snappy. Needs a careful right foot and a setup that keeps the rear in check.",
  mclaren_720s_gt3:
    "Huge downforce on a low-rake platform keeps speed high through medium and fast corners. Weak over kerbs: you lose time at chicanes with big kerbs (Kyalami, Zolder) where the front-engined cars attack. Can snap on entry when pushed.",
  porsche_991ii_gt3_r:
    "Rear-engined: superior traction and slow-speed agility that fires you out of corners once you trust it. Natural understeer in medium and fast bends, and it hates abrupt inputs or an early throttle. Measured entries and smooth hands.",
  bentley_continental_gt3_2018:
    "Big front-engined twin-turbo V8 bruiser: strong top speed on long straights, excellent over kerbs and solid in the wet. The heavy nose and high centre of gravity bring roll and mid-corner understeer, fixed by leaning on the throttle to rotate the rear. Biggest tank and lowest fuel use: an endurance weapon.",
  ferrari_488_gt3:
    "The Evo's predecessor: the same mid-engined balance and mid-corner grip, and the same dislike of steep kerbs and bumps. Smooth drivers get the most from it.",
  nissan_gt_r_gt3_2018:
    "Godzilla. The 2018 update lowered the engine and moved it back, curing most of the old car's heavy understeer. Lots of poise under heavy braking, so you can push deep into the braking zones. Front-engined and stable.",
  porsche_991_gt3_r:
    "The first 991 GT3 R, with the family's rear-engined traits: great traction and braking, understeer in medium and fast bends, and no love for abrupt inputs or an early throttle.",
  bmw_m6_gt3:
    "Long wheelbase and long undertray make a very stable aero platform: easy to drive at high and low speed alike. Understeers a little out of the box, which lets you attack corners with confidence.",
  honda_nsx_gt3:
    "The Evo's predecessor: the same even, mid-engined balance that loves trail braking and punishes aggressive steering.",
  lamborghini_gallardo_rex:
    "Reiter's wide-body Gallardo: V10 behind the driver, rear track at the class maximum and a carbon body. Rotates like the other mid-engined cars, and like them prefers the kerbs taken gently.",
  lexus_rc_f_gt3:
    "Heavy front-engined V8, strong on the brakes, in faster corners and in a straight line, and really stable over bumps and kerbs. Its weakness is slow, twisty sections: the weight makes it reluctant to rotate, so it understeers there.",
  nissan_gt_r_gt3_2017:
    "The original GT-R GT3, known for lots and lots of understeer before the 2018 update fixed it. Stable, but you'll fight the nose in slow corners.",
  bentley_continental_gt3_2016:
    "A tricky beast close to the road car: front-heavy with a high centre of gravity, so it rolls and understeers mid-corner. Use the big twin-turbo V8 to rotate the rear on throttle. Strong on long straights.",
  audi_r8_lms:
    "The first-generation R8 LMS: mid-engined V10 with plenty of rotation, on older aero and electronics than the Evo versions.",
  lamborghini_huracan_gt3:
    "The original Huracán GT3: V10 punch and a pointy, eager front like its successors, on older aero.",
  mclaren_650s_gt3:
    "The 720S's predecessor: mid-engined twin-turbo V8 with good front-end grip and steering feel on turn-in. Like the McLarens after it, it prefers the kerbs taken gently.",
  mercedes_amg_gt3:
    "Front-engined V8 with masses of torque: extremely stable under braking and over kerbs, with great traction control. Understeers into slow corners and can struggle to put the power down in slow traction zones.",
  amr_v12_vantage_gt3:
    "Old-school V12 on a short wheelbase: responsive and nimble for a front-engined car, and light on its tyres. Tricky handling at times: fixing it was the brief for Aston's next Vantage.",
  jaguar_g3:
    "Emil Frey's XKR-based racer: a front-mounted V8 of about 500 hp, built to GT3 rules but homologated as G3. Front-engined, so stable and happy on kerbs. Rarely raced, so little else is on record.",

  // GT4
  porsche_718_cayman_gt4_mr:
    "The class all-rounder: handles brilliantly on most tracks with good straight-line speed, and its pure braking is amazing. Careful lifting into fast corners: the rear can step out on entry.",
  alpine_a110_gt4:
    "Small, light and agile: shines in direction changes and fast corners and holds a high mid-corner speed. Understeers in slow and medium corners; rewards precision rather than a playful style.",
  amr_v8_vantage_gt4:
    "Unmatched stability with some of the best brakes in the field. Same engine and layout as the Mercedes GT4, but the shorter wheelbase makes it a little more agile. Forgiving: throw it over kerbs and into corners.",
  audi_r8_gt4:
    "Solid all-rounder that carries speed well through corners, but braking can be horrible if the setup isn't right.",
  bmw_m4_gt4:
    "Amazing straight-line speed, stable and good over kerbs. Understeers a little and is harder to hustle through tight corners.",
  chevrolet_camaro_gt4r:
    "Big V8 that's surprisingly well balanced: great acceleration from low speed, strong straight-line speed and good brakes. The power can bring oversteer on exit, and it rolls in faster corners.",
  ktm_xbow_gt4:
    "Ultra-light and nimble: very strong mid-corner, able to pull a gap through medium and fast corners. Made for tight, twisty tracks and excellent in the rain.",
  maserati_mc_gt4:
    "Naturally aspirated 4.7 V8 with no traction control and no ABS: tricky on the limit, every input is yours. Weight and power close to the BMW and Mercedes GT4s.",
  mclaren_570s_gt4:
    "Nimble mid-engined car: natural rotation in slow and fast bends lets you carry momentum. Better on slower tracks than the big front-engined cars, but snappier.",
  mercedes_amg_gt4:
    "Very stable and rides kerbs extremely well, so you can attack. The extra weight brings plenty of built-in understeer: work to get the nose turned in slow corners.",
  ginetta_g55_gt4:
    "Light, agile and nimble: carries good mid-corner speed and can be driven on the nose. Quick out of the box, but really benefits from a good setup.",

  // Single-make (Cup)
  porsche_992_gt3_cup:
    "485 hp, minimal aero and no traction control: arguably the most challenging car to drive. Needs a smooth throttle to accelerate well and keep the tyres alive; lift in fast corners and brake earlier than in a GT3.",
  lamborghini_huracan_st_evo2:
    "Same V10 as the GT3 with more power but far less aero, so much slower in fast corners. Prone to turn-in and mid-corner oversteer: smooth throttle and earlier braking. Easier to handle, and faster, than the Porsche Cup.",
  bmw_m2_cs_racing:
    "365 hp straight six to the rear wheels and the least downforce of any car in ACC: expect oversteer and sideways action, especially on throttle.",
  ferrari_488_challenge_evo:
    "More power than the GT3: 10-15 km/h faster on long straights. Far less downforce, so lift in medium and fast corners (Eau Rouge needs a real lift) and brake 30-40 m earlier. Be smooth on the throttle early in the exit.",
  porsche_991ii_gt3_cup:
    "The older Porsche Cup: no traction control and very difficult to handle, a tough challenge for newcomers.",
  lamborghini_huracan_st:
    "The first Super Trofeo Huracán: V10, rear-wheel drive and little aero compared with the GT3. Expect earlier braking and lifts in fast corners.",

  // GT2
  maserati_mc20_gt2:
    "Twin-turbo V6 with plenty of pull and a great launch. Rotates more than its rivals, almost like a rear-engined car: excels in slow corners and holds speed through turns, but gives time away on the straights. Dependable and consistent.",
  mercedes_amg_gt2:
    "Class of the field in a straight line. Front-heavy and struggles through fast corners, but great over kerbs and very forgiving.",
  audi_r8_lms_gt2:
    "Mid-engined with fantastic weight distribution and not very downforce-dependent, so the limit is easy to find. More understeer than the Maserati. Unspectacular but very predictable: the easiest GT2 to master.",
  ktm_xbow_gt2:
    "Lightest and most agile GT2, with great top speed and acceleration. Carry lower speeds through corners and brake earlier. Smooth, easy to get going, and especially reliable in the wet.",
  porsche_991ii_gt2_rs_cs_evo:
    "700 hp rear-engined twin-turbo flat-six: huge on long straights. Less downforce means less cornering grip, but fantastic rotation thanks to the rearward weight. Built for gentleman drivers and easy to drive.",
  porsche_935:
    "The 911 GT2 RS under retro bodywork, and it drives much the same: 700 hp flat-six, monster straight-line speed, fantastic rotation and less cornering grip.",
};
