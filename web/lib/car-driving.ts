// How each car drives (user's request, 2026-10-10: replaces the short descriptions under the car on
// its stage with "the car's specific driving style and behaviour, as many details as we can", still
// fitting there, about 450-550 characters). Braking and entry, mid-corner, exit and traction, kerbs,
// high speed, tyres and weather where it matters, and how to drive it. Written from the cars' guides
// already used for the first descriptions (Coach Dave Academy, GOSetups, Traxion, GTPlanet, Overtake),
// the cars' layouts, and for the Ford the user's own words. Shown on the car page and in the finder;
// an admin's own text (car_rating.note) replaces it. Safe on server and client.

export const DRIVING_STYLE_SOURCE = "Researched (Coach Dave Academy, GOSetups, Traxion, GTPlanet, Overtake) and the cars' layouts, October 2026";

export const DRIVING_STYLE: Record<string, string> = {
  // GT3
  ford_mustang_gt3:
    "Absolute V8 freedom power beast that makes most of its time on the straights. Front-heavy, so it understeers into slow corners: brake in a straight line, turn in patiently and let the nose settle before asking for more. Mid-corner it stays calm and very driveable, and the big naturally aspirated V8 gives clean, linear drive out without snapping. Amazing over bumps and kerbs: attack chicanes and ride the sausage kerbs. Great at high speed and stable under braking; keep it straight, keep it smooth, and let the engine do the rest.",
  mclaren_720s_gt3_evo:
    "Downforce monster, the most of any GT3, on a low-rake platform: devastating through fast corners where you can carry huge minimum speeds. Brake hard and early-ish in a straight line, then release smoothly: it rewards trail braking into medium corners. More neutral and predictable on the limit than the 2019 car, with good traction control and lots of feedback. Kerbs are its weakness: big kerbs unsettle the floor, so keep two wheels on the tarmac in chicanes. Strongest at Spa, Silverstone and Barcelona-type tracks.",
  ferrari_296_gt3:
    "Mid-engined twin-turbo V6 with smooth, usable power and a forgiving yet responsive balance. The front bites on turn-in and the rear follows predictably, so you can trail brake deep and trust it on the limit. Rotates well mid-corner without becoming nervous; get on the power early, it puts the torque down cleanly. Copes with kerbs better than the 488 but still prefers smooth lines over the big ones. Excellent on its tyres over a stint and consistent as fuel burns off: a race car more than a one-lap special.",
  porsche_992_gt3_r:
    "Rear-engined rocket: phenomenal launch and traction out of slow corners, good straight-line speed and very strong brakes. The weight behind the rear axle makes entry the critical phase: brake early and in a straight line, release smoothly and use gentle steering, because braking hard while turning brings the rear round. Once rotated, squeeze the throttle progressively and it fires out of the corner. Fast corners need commitment and a calm right foot. Snappy when driven aggressively; precise, patient drivers are rewarded.",
  lamborghini_huracan_gt3_evo2:
    "Naturally aspirated V10, strong on corner exits and off rolling starts. Pointy front end with strong rotation on entry, far less snappy than the old Evo but still lively: a little trail braking turns it, too much spins it. Great brakes, though the rears like to lock in slow corners, so ease off the pedal as you turn in. Stable and planted in medium corners, decent over kerbs. Struggles to keep tyre temperatures in the heat and on low-downforce tracks; superb in the wet, with low fuel use for long stints.",
  audi_r8_lms_evo_ii:
    "Mid-engined V10 with lots of rotation compared with the front-engined cars: it turns in sharply and loves fast, flowing sections. With little weight on the front axle it can understeer in slow corners, so slow the car properly and rotate it off the brakes rather than with more lock. Traction is good but the rear can step out if you hit the throttle with steering on. Traditionally very quick at Spa, where snap oversteer through Eau Rouge is the trap. Less happy over big kerbs than the front-engined cars: ride them carefully.",
  bmw_m4_gt3:
    "Big front-engined car on a fantastic platform that stays stable everywhere on the lap: one of the fastest in ACC. Fairly balanced, with some entry understeer from the weight up front, so brake firmly, turn in a touch early and let it rotate on a light trail of brake. Very strong traction from its turbo straight six. Few cars use the kerbs as well: consistent and supple over them, so attack chicanes. Keep ABS as low as you can or it pushes on the brakes. Easy to be consistent with, from qualifying to long stints.",
  mercedes_amg_gt3_evo:
    "Front-engined torque monster made for low and medium-speed tracks with big kerbs (Imola, Nürburgring, Zolder). Extremely stable under braking: you can brake very late and hard. The weight up front brings understeer into slow corners, so slow it down more than you think and get it turned before the apex. The best traction control on the grid helps, but in slow traction zones the torque can overwhelm the rears: feed the throttle in. Rides kerbs superbly and shrugs off small knocks and aero damage. Forgiving and consistent.",
  ferrari_488_gt3_evo:
    "Great all-rounder: decent top speed, a great aero platform, and its real weapon is mid-corner grip and high minimum speeds. Mid-engined, so it turns in eagerly and carries speed through medium and fast corners better than most. Brake a bit earlier, roll speed through the apex and keep the steering smooth. Sensitive to kerbs and bumps: it rewards a style that dances around the track furniture, so stay off steep kerbs like Zolder's and Imola's. Twin-turbo V8 traction is good once straight; gentle on the throttle while turned.",
  amr_v8_vantage_gt3:
    "Front-engined twin-turbo V8 with neutral, predictable handling and smooth, linear power: one of the best cars to learn ACC with. Strong mid to high-speed acceleration lets it pull away on long straights. Stable on the brakes; a little patience on turn-in avoids understeer, then it rotates nicely on a lift or a trail of brake. Good over kerbs and quick in the wet and the dry. Easy on its tyres, and its fuel economy with a big tank helps in long races: consistency is its strength more than one-lap pace.",
  audi_r8_lms_evo:
    "The Evo II's predecessor and the same recipe: mid-engined V10 with plenty of rotation, sharp turn-in and strength in fast, flowing corners. Understeers in slow corners with little weight on the nose, so slow it properly and turn it off the brakes. Careful with throttle while still turned: the rear can step out. Traditionally very quick at Spa, but beware snap oversteer through Eau Rouge. Less happy over big kerbs than the front-engined cars; smooth lines and a calm right foot get the best from it.",
  honda_nsx_gt3_evo:
    "One of ACC's better-handling cars: even weight distribution and a low centre of gravity make it predictable and consistent. Loves trail braking: carry more speed into the corner than with a front-engined car and let the brakes rotate it. Aggressive steering just brings oversteer, so keep the inputs small and precise. Strong traction out of slow corners from the mid-mounted twin-turbo V6. Rides kerbs reasonably and is easy on its tyres. Famously strong at Mount Panorama, less so on the fast European tracks.",
  lamborghini_huracan_gt3_evo:
    "The EVO2's predecessor: the same V10 punch out of corners and the same pointy, eager front, but it often felt overly snappy. Turn-in is sharp and the rear follows quickly, so trail braking needs a light touch and the throttle must come in gradually while the wheel is turned. Great brakes but the rears lock easily in slow corners. Strong in the wet and on tyre-hungry tracks it can overheat its rears. Needs a careful right foot and a setup that keeps the rear in check; rewarding once tamed.",
  mclaren_720s_gt3:
    "Huge downforce on a low-rake platform keeps speed high through medium and fast corners: commit and it sticks. Brake in a straight line, then trail off smoothly; it can snap on entry when pushed with too much brake and lock together. Weak over kerbs: you lose time at chicanes with big kerbs (Kyalami, Zolder) where the front-engined cars attack, so take them with two wheels on the tarmac. Good traction out of slow corners. A car for flowing, high-speed tracks and drivers who are smooth on entry.",
  porsche_991ii_gt3_r:
    "Rear-engined: superior traction and slow-speed agility that fires you out of corners once you trust it. Braking is excellent and stable in a straight line, but the weight at the back makes it nervous if you brake and turn hard together. Natural understeer in medium and fast bends: be patient for the apex. It hates abrupt inputs or an early throttle, which bring the rear round or wash the nose wide. Measured entries, smooth hands and a progressive throttle are the recipe; then it's a weapon out of slow corners.",
  bentley_continental_gt3_2018:
    "Big front-engined twin-turbo V8 bruiser: strong top speed on long straights, excellent over kerbs and solid in the wet. The heavy nose and high centre of gravity bring roll and mid-corner understeer: brake early, get it turned before the apex, then lean on the throttle to rotate the rear. Stable under heavy braking. Fast changes of direction feel lazy, so straighten chicanes as much as you can. Biggest tank and lowest fuel use: an endurance weapon that's at its best over a stint, not a single lap.",
  ferrari_488_gt3:
    "The Evo's predecessor: the same mid-engined balance and mid-corner grip, turning in eagerly and carrying high minimum speeds through medium and fast corners. Brake a touch early, roll speed through the apex and keep the steering smooth. Same dislike of steep kerbs and bumps as the Evo: they upset the platform, so dance around them. Gentle on the throttle while turned, then the twin-turbo V8 pulls strongly once straight. Smooth drivers get the most from it.",
  nissan_gt_r_gt3_2018:
    "Godzilla. The 2018 update lowered the engine and moved it back, curing most of the old car's heavy understeer. Lots of poise under heavy braking, so you can push deep into the braking zones and brake later than most. Front-engined and stable: some understeer remains in slow corners, so get it rotated early. Strong traction and a punchy twin-turbo V6 out of corners. Rides kerbs well. A confidence car: predictable on the limit and easy to be consistent with.",
  porsche_991_gt3_r:
    "The first 991 GT3 R, with the family's rear-engined traits: great traction and braking, excellent off slow corners. Entry is the delicate phase: brake straight, release smoothly and avoid heavy braking with steering on, or the rear comes round. Understeers in medium and fast bends, so be patient for the apex. No love for abrupt inputs or an early throttle. Measured, precise driving gets the rewards: slow in, fast out.",
  bmw_m6_gt3:
    "Long wheelbase and long undertray make a very stable aero platform: easy to drive at high and low speed alike. Understeers a little out of the box, which lets you attack corners with confidence: brake late, turn in early and the rear stays planted. Big twin-turbo V8 torque gives strong drive off slow corners. Lazy in quick direction changes because of its size, but very stable over kerbs and bumps. Forgiving and consistent, ideal for long races.",
  honda_nsx_gt3:
    "The Evo's predecessor: the same even, mid-engined balance and low centre of gravity, predictable on the limit. Loves trail braking, so carry speed in and let the brakes rotate the car. Punishes aggressive steering with oversteer: keep inputs small. Good traction from the twin-turbo V6 out of slow corners. Consistent and easy on tyres, best on flowing tracks with a smooth driver.",
  lamborghini_gallardo_rex:
    "Reiter's wide-body Gallardo: V10 behind the driver, rear track at the class maximum and a carbon body. Rotates like the other mid-engined cars, turning in eagerly with a rear that follows quickly: trail brake lightly and feed the throttle in gradually. Strong traction out of corners from the wide rear. Like them it prefers the kerbs taken gently. Older aero means less grip in fast corners than modern GT3s: carry speed through slow and medium turns instead.",
  lexus_rc_f_gt3:
    "Heavy front-engined V8, strong on the brakes, in faster corners and in a straight line, and really stable over bumps and kerbs. Brake late and hard, it stays straight. Its weakness is slow, twisty sections: the weight makes it reluctant to rotate, so it understeers there. Slow it down early, get it turned, then use the naturally aspirated V8's linear drive. Not nimble in direction changes. Best on fast, flowing tracks where its stability and top end shine.",
  nissan_gt_r_gt3_2017:
    "The original GT-R GT3, known for lots and lots of understeer before the 2018 update fixed it. Stable under braking and over kerbs, but you'll fight the nose in slow corners: brake early, rotate it off the brakes and don't add lock. Twin-turbo V6 torque gives good drive out once straight. A patient, slow-in fast-out car that rewards consistency more than aggression.",
  bentley_continental_gt3_2016:
    "A tricky beast close to the road car: front-heavy with a high centre of gravity, so it rolls and understeers mid-corner. Brake early and in a straight line, get the nose turned before the apex, then use the big twin-turbo V8 to rotate the rear on throttle. Stable at high speed and strong on long straights. Lazy in quick direction changes: straighten chicanes. Good over kerbs and economical on fuel.",
  audi_r8_lms:
    "The first-generation R8 LMS: mid-engined V10 with plenty of rotation, sharp turn-in and good speed through fast corners, on older aero and electronics than the Evo versions. Understeers in slow corners with a light nose: slow it properly and turn it off the brakes. Careful with the throttle while turned. Less happy over big kerbs; smooth lines work best.",
  lamborghini_huracan_gt3:
    "The original Huracán GT3: V10 punch and a pointy, eager front like its successors, on older aero. Sharp turn-in and a rear that follows quickly: trail brake lightly and bring the throttle in gradually while the wheel is turned. Strong brakes but the rears lock in slow corners. Good traction out of slow corners. Rewards a careful right foot and smooth hands.",
  mclaren_650s_gt3:
    "The 720S's predecessor: mid-engined twin-turbo V8 with good front-end grip and steering feel on turn-in. Turns in sharply and carries speed through medium corners; trail braking works, but too much brake with steering unsettles the rear. Good traction once straight. Like the McLarens after it, it prefers the kerbs taken gently: keep two wheels on the tarmac in chicanes.",
  mercedes_amg_gt3:
    "Front-engined V8 with masses of torque: extremely stable under braking and over kerbs, with great traction control. Brake late and hard, ride the kerbs. Understeers into slow corners, so slow it down early and get it turned before the apex. Can struggle to put the power down in slow traction zones: feed the throttle in. Forgiving and robust; great for learning and for long races.",
  amr_v12_vantage_gt3:
    "Old-school V12 on a short wheelbase: responsive and nimble for a front-engined car, and light on its tyres. Turns in better than most front-engined GT3s but the short wheelbase makes the rear lively on entry and over kerbs: smooth brake release and measured steering. Linear, sonorous power that's easy to modulate on exit. Tricky handling at times: fixing it was the brief for Aston's next Vantage.",
  jaguar_g3:
    "Emil Frey's XKR-based racer: a front-mounted V8 of about 500 hp, built to GT3 rules but homologated as G3. Front-engined, so stable under braking and happy on kerbs; expect understeer into slow corners, so brake early and turn it before the apex. Linear V8 drive out of corners. Rarely raced, so little else is on record.",

  // GT4
  porsche_718_cayman_gt4_mr:
    "The class all-rounder: handles brilliantly on most tracks with good straight-line speed, and its pure braking is amazing: brake late and hard. Mid-engined, so it turns in eagerly and rotates well, but careful lifting into fast corners: the rear can step out on entry. Good traction out of slow corners. Smooth inputs and a confident brake foot are all it asks.",
  alpine_a110_gt4:
    "Small, light and agile: shines in direction changes and fast corners and holds a high mid-corner speed. Understeers in slow and medium corners, so slow it down and be precise with the turn-in point. Low power means momentum is everything: avoid scrubbing speed. Rewards precision rather than a playful style.",
  amr_v8_vantage_gt4:
    "Unmatched stability with some of the best brakes in the field: brake very late and hard. Same engine and layout as the Mercedes GT4, but the shorter wheelbase makes it a little more agile on turn-in. Forgiving: throw it over kerbs and into corners. Strong twin-turbo V8 drive out. An easy car to be fast and consistent in.",
  audi_r8_gt4:
    "Solid all-rounder that carries speed well through corners thanks to its mid-engined balance. Braking can be horrible if the setup isn't right: get the brake bias and ABS sorted, then brake in a straight line. Turns in nicely; take kerbs gently. Smooth and consistent rather than spectacular.",
  bmw_m4_gt4:
    "Amazing straight-line speed, stable and good over kerbs. Understeers a little and is harder to hustle through tight corners: brake early, turn it before the apex and use the turbo straight six's torque out. Stable and predictable at high speed. Best on fast tracks with long straights.",
  chevrolet_camaro_gt4r:
    "Big V8 that's surprisingly well balanced: great acceleration from low speed, strong straight-line speed and good brakes. The power can bring oversteer on exit, so feed the throttle in progressively. It rolls in faster corners: smooth steering keeps it settled. Fun and fast with a patient right foot.",
  ktm_xbow_gt4:
    "Ultra-light and nimble: very strong mid-corner, able to pull a gap through medium and fast corners. Carry speed rather than braking late. Sharp, direct steering: keep inputs small. Made for tight, twisty tracks and excellent in the rain. Less strong on long straights.",
  maserati_mc_gt4:
    "Naturally aspirated 4.7 V8 with no traction control and no ABS: tricky on the limit, every input is yours. Squeeze the brake progressively to avoid locking, and feed the throttle in gently or the rear steps out. Weight and power close to the BMW and Mercedes GT4s. Rewarding for drivers who are smooth and precise.",
  mclaren_570s_gt4:
    "Nimble mid-engined car: natural rotation in slow and fast bends lets you carry momentum. Trail brake lightly and keep the throttle smooth while turned, since it's snappier than the front-engined cars. Better on slower, twisty tracks than the big front-engined cars. Take kerbs gently.",
  mercedes_amg_gt4:
    "Very stable and rides kerbs extremely well, so you can attack chicanes. Brakes are strong and confidence-inspiring. The extra weight brings plenty of built-in understeer: brake early and work to get the nose turned in slow corners, then use the V8 torque out. Forgiving and consistent.",
  ginetta_g55_gt4:
    "Light, agile and nimble: carries good mid-corner speed and can be driven on the nose, turning in eagerly. Keep momentum up and the inputs tidy; it's lively over big kerbs. Quick out of the box, but really benefits from a good setup.",

  // Single-make (Cup)
  porsche_992_gt3_cup:
    "485 hp, minimal aero and no traction control: arguably the most challenging car to drive. Rear-engined: brake early and straight, release gently, and never brake hard with steering on. Lift in fast corners and brake earlier than in a GT3. On exit, a smooth throttle is everything: it accelerates well and keeps the tyres alive only if you don't spin the rears. Fast once you master the rhythm: slow in, fast out.",
  lamborghini_huracan_st_evo2:
    "Same V10 as the GT3 with more power but far less aero, so much slower in fast corners: lift and brake earlier. Prone to turn-in and mid-corner oversteer, so a smooth throttle and a light trail of brake are key. Strong traction and punch out of slow corners. Easier to handle, and faster, than the Porsche Cup.",
  bmw_m2_cs_racing:
    "365 hp straight six to the rear wheels and the least downforce of any car in ACC: expect oversteer and sideways action, especially on throttle. Brake early and in a straight line, turn in gently, and feed the power in progressively. Short wheelbase makes it lively over kerbs. Great for learning car control.",
  ferrari_488_challenge_evo:
    "More power than the GT3: 10-15 km/h faster on long straights. Far less downforce, so lift in medium and fast corners (Eau Rouge needs a real lift) and brake 30-40 m earlier. Mid-engined rotation makes turn-in eager: keep entries smooth. Be smooth on the throttle early in the exit, then the twin-turbo V8 pulls hard.",
  porsche_991ii_gt3_cup:
    "The older Porsche Cup: no traction control and very difficult to handle, a tough challenge for newcomers. Rear-engined: brake straight, release gently, and be very careful with the throttle out of slow corners. Little aero, so lift in fast corners. Rewarding for patient, precise drivers.",
  lamborghini_huracan_st:
    "The first Super Trofeo Huracán: V10, rear-wheel drive and little aero compared with the GT3. Expect earlier braking and lifts in fast corners. Lively on entry: smooth brake release and a progressive throttle. Strong V10 punch out of slow corners.",

  // GT2
  maserati_mc20_gt2:
    "Twin-turbo V6 with plenty of pull and a great launch. Rotates more than its rivals, almost like a rear-engined car: excels in slow corners and holds speed through turns, but gives time away on the straights. Trail brake to use that rotation, then get on the power early. Dependable and consistent.",
  mercedes_amg_gt2:
    "Class of the field in a straight line. Front-heavy and struggles through fast corners: brake early, get the nose turned and use the torque out. Great over kerbs and very forgiving, so attack the chicanes.",
  audi_r8_lms_gt2:
    "Mid-engined with fantastic weight distribution and not very downforce-dependent, so the limit is easy to find. More understeer than the Maserati: slow it properly into slow corners. Unspectacular but very predictable: the easiest GT2 to master.",
  ktm_xbow_gt2:
    "Lightest and most agile GT2, with great top speed and acceleration. Carry lower speeds through corners and brake earlier than its looks suggest. Smooth, easy to get going, and especially reliable in the wet.",
  porsche_991ii_gt2_rs_cs_evo:
    "700 hp rear-engined twin-turbo flat-six: huge on long straights. Less downforce means less cornering grip, but fantastic rotation thanks to the rearward weight. Brake straight, release smoothly, and feed in the power: it's a lot. Built for gentleman drivers and easy to drive.",
  porsche_935:
    "The 911 GT2 RS under retro bodywork, and it drives much the same: 700 hp flat-six, monster straight-line speed, fantastic rotation and less cornering grip. Brake straight, release smoothly, and respect the throttle on exit.",
};
