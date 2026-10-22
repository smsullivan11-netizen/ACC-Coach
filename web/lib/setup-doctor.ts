// Setup diagnostic (user's request, 2026-10-22): a driver says where the car's balance is wrong
// (understeer or oversteer, by corner speed and corner phase) and which other problems they have
// (lock-ups, wheelspin, kerbs…); the page ranks the setup changes that fix it. Rule-based, no AI
// service. Safe on server and client.
//
// The model. Each balance setting has an effect on the car's rotation in each of the 9 situations
// (corner speed × phase), 0-1: phase weights × speed weights. Its `plus` direction adds rotation (less
// understeer, more oversteer). A reported understeer of severity s asks for +s rotation there, an
// oversteer for −s. For a change, score = Σ effect × ask over the reported situations (it helps, or it
// hurts another reported one) − SIDE × Σ |effect| where the driver said the car is fine (a broad tool
// such as an anti-roll bar moves every corner, a phase tool such as the brake bias only one), × the
// setting's priority (main tools 1, fine tuning less). Other problems vote for changes directly
// (2 × weight, like a clear balance report). The size of the step follows the worst problem it fixes.
// Principles: the end with the stiffer roll stiffness (bars, springs, bump stops) loses grip; in a
// transient, the end whose damping is stiffer in the moving direction takes the load transfer first and
// loses grip (entry: front bump, rear rebound; exit: front rebound, rear bump); rake and wing move the
// aero balance, which only matters from medium speed up; ACC's cars sit on their bump stops in fast
// corners. Steps in the game's units: brake bias 0.2 % per click, preload 10 Nm, ride height 1 mm,
// camber 0.1°, toe 0.01° (lib history: the setups viewer, git c61b07c).


export const PHASES = [
  { key: "entry", label: "Entry", info: "Braking and turn-in: from the braking point until you are off the brake." },
  { key: "mid", label: "Mid-corner", info: "Around the apex: off the brake, coasting or at a light, steady throttle." },
  { key: "exit", label: "Exit", info: "From the throttle pickup until the car is straight again." },
] as const;

export const SPEEDS = [
  { key: "slow", label: "Slow", sub: "under 100 km/h", info: "Hairpins and chicanes: mechanical grip (bars, springs, differential, alignment). The wings do almost nothing here." },
  { key: "medium", label: "Medium", sub: "100-170 km/h", info: "Mechanical grip and aero both count." },
  { key: "fast", label: "Fast", sub: "over 170 km/h", info: "Aero corners: ride heights (rake), wing and bump stops decide the balance." },
] as const;

export const SEVERITIES = ["Slight", "Clear", "Strong"] as const;
export const CELLS = SPEEDS.length * PHASES.length;   // cell index = speed × 3 + phase
export const cellOf = (speed: number, phase: number) => speed * PHASES.length + phase;

/** "Clear understeer", "Fine"… for a cell value −3…3 (negative = understeer). */
export const balanceText = (v: number) =>
  v === 0 ? "Fine" : `${SEVERITIES[Math.abs(v) - 1]} ${v < 0 ? "understeer" : "oversteer"}`;

export type Tab = "Tyres" | "Electronics" | "Mechanical grip" | "Dampers" | "Aero";
type Dir = { label: string; why: string; watch: string };
export type Setting = {
  key: string;
  name: string;
  tab: Tab;
  scope: string;                       // where it acts, shown next to the suggestion
  steps: [string, string, string];     // slight, clear, strong
  plus: Dir;                           // balance settings: the change that adds rotation
  minus: Dir;
  prio: number;                        // 1 = main tool, less = fine tuning
  live?: boolean;                      // changed from the cockpit (test it on the next lap)
  effect?: { phase: [number, number, number]; speed: [number, number, number] };   // rotation per situation
  noCup?: boolean;                     // the Porsche Cup cars have neither TC nor ABS
};

const MECH: [number, number, number] = [1, 0.85, 0.5];   // mechanical grip matters less once aero takes over
const AERO: [number, number, number] = [0.1, 0.6, 1];

export const SETTINGS: Setting[] = [
  {
    key: "arb_f", name: "Front anti-roll bar", tab: "Mechanical grip", scope: "Whole corner, every speed", prio: 1,
    steps: ["1 click", "1-2 clicks", "2-3 clicks"], effect: { phase: [0.6, 1, 0.6], speed: MECH },
    plus: { label: "softer", why: "A softer front bar spreads the load better across the front tyres: more front grip, mostly from turn-in to the apex.", watch: "lazier response and more roll." },
    minus: { label: "stiffer", why: "A stiffer front bar takes more of the load transfer at the front: the front gives up grip first, the car steadies.", watch: "understeer everywhere; the inside front lifts on kerbs." },
  },
  {
    key: "arb_r", name: "Rear anti-roll bar", tab: "Mechanical grip", scope: "Whole corner, every speed", prio: 1,
    steps: ["1 click", "1-2 clicks", "2-3 clicks"], effect: { phase: [0.5, 1, 0.8], speed: MECH },
    plus: { label: "stiffer", why: "A stiffer rear bar takes more of the load transfer at the rear: the rear gives up grip first and the car rotates.", watch: "less traction out of slow corners (the inside rear spins up) and a snappier rear on kerbs." },
    minus: { label: "softer", why: "A softer rear bar keeps both rear tyres loaded: more rear grip and better traction.", watch: "less rotation: it can bring mid-corner understeer." },
  },
  {
    key: "bias", name: "Brake bias", tab: "Mechanical grip", scope: "Braking and turn-in only", prio: 1, live: true,
    steps: ["0.2 %", "0.4-0.6 %", "0.8-1.0 %"], effect: { phase: [1, 0, 0], speed: [1, 1, 0.9] },
    plus: { label: "rearward (lower %)", why: "More of the braking on the rear tyres: they slip a little while you trail brake and the car turns in more willingly.", watch: "rear locking and a nervous rear under hard braking: small steps." },
    minus: { label: "forward (higher %)", why: "More of the braking on the front tyres keeps the rear calm under braking and on turn-in.", watch: "turn-in understeer and front lock-ups (the ABS works harder)." },
  },
  {
    key: "preload", name: "Preload differential", tab: "Mechanical grip", scope: "Off and part throttle, slow corners most", prio: 1,
    steps: ["10-20 Nm", "20-40 Nm", "40-60 Nm"], effect: { phase: [0.8, 0.5, 0.5], speed: [1, 0.7, 0.4] },
    plus: { label: "lower", why: "Less preload lets the rear wheels turn at different speeds: the car rotates more on entry and through the apex, and pushes less when you pick up the throttle.", watch: "less stable on lift-off and braking; the inside rear spins up on exit." },
    minus: { label: "higher", why: "More preload ties the rear wheels together: steadier under braking and lift-off, better traction in a straight line.", watch: "understeer on entry and on power." },
  },
  {
    key: "spring_f", name: "Front wheel rate (springs)", tab: "Mechanical grip", scope: "Whole corner, slow and medium most", prio: 0.7,
    steps: ["1 step", "1-2 steps", "2-3 steps"], effect: { phase: [0.5, 0.8, 0.5], speed: [1, 0.8, 0.4] },
    plus: { label: "softer", why: "Softer front springs give the front tyres more mechanical grip in slow and medium corners.", watch: "the front drops more under braking and downforce: bottoming, the bump stops sooner, a less stable aero platform." },
    minus: { label: "stiffer", why: "Stiffer front springs take more load transfer at the front and hold the front ride height steady at speed.", watch: "less front grip over bumps and kerbs." },
  },
  {
    key: "spring_r", name: "Rear wheel rate (springs)", tab: "Mechanical grip", scope: "Whole corner, slow and medium most", prio: 0.7,
    steps: ["1 step", "1-2 steps", "2-3 steps"], effect: { phase: [0.4, 0.8, 0.7], speed: [1, 0.8, 0.4] },
    plus: { label: "stiffer", why: "Stiffer rear springs take more load transfer at the rear: the car rotates more.", watch: "less traction, more wheelspin out of slow corners." },
    minus: { label: "softer", why: "Softer rear springs give the rear tyres more mechanical grip and traction.", watch: "the rear squats more under power and can reach its bump stops." },
  },
  {
    key: "bs_range_f", name: "Front bump stop range", tab: "Mechanical grip", scope: "Fast corners (on the bump stops)", prio: 0.9,
    steps: ["2-3 clicks", "4-6 clicks", "8-10 clicks"], effect: { phase: [0.5, 1, 0.5], speed: [0, 0.3, 1] },
    plus: { label: "more range", why: "ACC's cars sit on their bump stops in fast corners. More range means the front reaches its stops later: it keeps grip and runs lower (more front downforce) at speed.", watch: "the front can bottom out over bumps and compressions." },
    minus: { label: "less range", why: "Less range puts the front on its stops sooner under downforce: a steadier platform and a calmer front at speed.", watch: "understeer in fast corners when the front lands on its stops." },
  },
  {
    key: "bs_range_r", name: "Rear bump stop range", tab: "Mechanical grip", scope: "Fast corners (on the bump stops)", prio: 0.9,
    steps: ["2-3 clicks", "4-6 clicks", "8-10 clicks"], effect: { phase: [0.4, 1, 0.6], speed: [0, 0.3, 1] },
    plus: { label: "less range", why: "Less rear range puts the rear on its stops sooner: the rear stays higher (more rake) and gives up grip first at speed.", watch: "a snappy rear in fast corners when it lands on its stops." },
    minus: { label: "more range", why: "More rear range lets the rear compress further before the stops: more rear grip in fast corners and over bumps.", watch: "the rear runs lower at speed: less rake, more understeer in fast corners." },
  },
  {
    key: "rh_f", name: "Front ride height", tab: "Aero", scope: "Medium and fast corners (aero)", prio: 1,
    steps: ["1 mm", "2 mm", "3-4 mm"], effect: { phase: [0.6, 1, 0.6], speed: AERO },
    plus: { label: "lower", why: "A lower front adds rake: the aero balance moves forward, more front downforce at speed.", watch: "bottoming over bumps and kerbs; the front reaches its bump stops sooner." },
    minus: { label: "higher", why: "A higher front reduces rake: the aero balance moves rearward and the car is steadier at speed.", watch: "understeer in fast corners." },
  },
  {
    key: "rh_r", name: "Rear ride height", tab: "Aero", scope: "Medium and fast corners (aero)", prio: 1,
    steps: ["1-2 mm", "2-3 mm", "4-5 mm"], effect: { phase: [0.6, 1, 0.6], speed: AERO },
    plus: { label: "higher", why: "A higher rear adds rake: the aero balance moves forward and the car turns better in fast corners.", watch: "a lighter, more nervous rear at high speed." },
    minus: { label: "lower", why: "A lower rear reduces rake: the aero balance moves rearward, the rear feels planted at speed.", watch: "understeer in fast corners; check the rear is not bottoming." },
  },
  {
    key: "wing", name: "Rear wing", tab: "Aero", scope: "Medium and fast corners (aero)", prio: 1,
    steps: ["1 click", "1-2 clicks", "2-3 clicks"], effect: { phase: [0.5, 1, 0.8], speed: [0, 0.5, 1] },
    plus: { label: "down", why: "Less wing moves the aero balance forward and frees top speed.", watch: "a lighter rear in fast corners and under braking from high speed." },
    minus: { label: "up", why: "More wing = more rear downforce: a planted rear in fast corners and under braking from high speed.", watch: "more drag, lower top speed." },
  },
  {
    key: "splitter", name: "Splitter (if your car has one)", tab: "Aero", scope: "Medium and fast corners (aero)", prio: 0.8,
    steps: ["1 click", "1-2 clicks", "2 clicks"], effect: { phase: [0.5, 1, 0.6], speed: [0, 0.5, 1] },
    plus: { label: "up", why: "More splitter = more front downforce: better turn-in and mid-corner grip at speed.", watch: "a lighter rear at speed. Only some cars can adjust it." },
    minus: { label: "down", why: "Less splitter moves the aero balance rearward: a calmer car at speed.", watch: "understeer in fast corners." },
  },
  {
    key: "toe_f", name: "Front toe", tab: "Tyres", scope: "Turn-in", prio: 0.7,
    steps: ["0.02°", "0.04°", "0.06-0.08°"], effect: { phase: [1, 0.3, 0], speed: [1, 0.8, 0.5] },
    plus: { label: "more toe-out", why: "More front toe-out makes the car react sooner when you start to turn.", watch: "hotter, faster-wearing front tyres, a twitchier car on the straights and a little drag." },
    minus: { label: "less toe-out", why: "Less front toe-out calms the first reaction to the wheel and scrubs the tyres less.", watch: "a lazier turn-in." },
  },
  {
    key: "toe_r", name: "Rear toe", tab: "Tyres", scope: "Everywhere, at speed most", prio: 0.7,
    steps: ["0.02°", "0.04°", "0.06-0.08°"], effect: { phase: [0.6, 0.6, 0.6], speed: [0.8, 1, 1] },
    plus: { label: "less toe-in", why: "Less rear toe-in frees the rear: the car rotates more.", watch: "a nervous rear on lift-off and at high speed." },
    minus: { label: "more toe-in", why: "More rear toe-in steadies the rear everywhere, most of all at speed and on lift-off.", watch: "less rotation, hotter rear tyres, a little drag." },
  },
  {
    key: "camber_f", name: "Front camber", tab: "Tyres", scope: "Mid-corner", prio: 0.6,
    steps: ["0.2°", "0.3-0.4°", "0.5°"], effect: { phase: [0.3, 1, 0.4], speed: [1, 1, 0.8] },
    plus: { label: "more negative", why: "More negative front camber gives more cornering grip mid-corner (often already at the limit, −4.0° on GT3s).", watch: "less braking grip and more wear on the inside edge." },
    minus: { label: "less negative", why: "Less negative front camber puts more of the tyre on the road in a straight line: better braking, less mid-corner grip.", watch: "mid-corner understeer." },
  },
  {
    key: "camber_r", name: "Rear camber", tab: "Tyres", scope: "Mid-corner", prio: 0.5,
    steps: ["0.2°", "0.3-0.4°", "0.5°"], effect: { phase: [0.2, 0.8, 0], speed: [1, 1, 0.8] },
    plus: { label: "less negative", why: "Less negative rear camber gives the rear less cornering grip but a flatter contact patch for traction.", watch: "a looser rear mid-corner." },
    minus: { label: "more negative", why: "More negative rear camber gives the rear more cornering grip mid-corner.", watch: "slightly less traction in a straight line, more inside-edge wear." },
  },
  {
    key: "caster", name: "Caster", tab: "Tyres", scope: "Mid-corner, slow corners most", prio: 0.5,
    steps: ["2-3 clicks", "4-5 clicks", "6+ clicks"], effect: { phase: [0.3, 0.8, 0.3], speed: [1, 0.8, 0.5] },
    plus: { label: "more", why: "More caster adds camber as you steer: more front grip in slow and medium corners, and more self-centring.", watch: "heavier steering." },
    minus: { label: "less", why: "Less caster gives a lighter wheel and less camber gain with lock.", watch: "less front grip in slow corners." },
  },
  {
    key: "bump_f", name: "Front bump", tab: "Dampers", scope: "Entry (weight moving forward)", prio: 0.6,
    steps: ["1-2 clicks", "2-4 clicks", "4-6 clicks"], effect: { phase: [1, 0.2, 0], speed: [1, 1, 0.8] },
    plus: { label: "softer", why: "The front compresses as you brake and turn in: softer front bump lets the load settle onto the front tyres smoothly, more grip on entry.", watch: "more dive: a lower front under braking (bump stops, bottoming)." },
    minus: { label: "stiffer", why: "Stiffer front bump makes the front take the load transfer quickly on entry: a sharper but less grippy front, a calmer car.", watch: "entry understeer." },
  },
  {
    key: "rebound_r", name: "Rear rebound", tab: "Dampers", scope: "Entry (weight moving forward)", prio: 0.6,
    steps: ["1-2 clicks", "2-4 clicks", "4-6 clicks"], effect: { phase: [0.8, 0.2, 0], speed: [1, 1, 0.8] },
    plus: { label: "stiffer", why: "The rear extends as the weight moves forward. Stiffer rear rebound makes the rear take that load transfer first: it lets go a little and the car rotates on entry.", watch: "a nervous rear under trail braking." },
    minus: { label: "softer", why: "Softer rear rebound lets the rear extend freely on entry: the rear keeps its grip, the car is calmer under braking.", watch: "entry understeer." },
  },
  {
    key: "rebound_f", name: "Front rebound", tab: "Dampers", scope: "Exit (weight moving back)", prio: 0.6,
    steps: ["1-2 clicks", "2-4 clicks", "4-6 clicks"], effect: { phase: [0, 0.2, 1], speed: [1, 1, 0.8] },
    plus: { label: "softer", why: "The front extends as you pick up the throttle. Softer front rebound lets it do so freely: the front tyres keep working, less understeer on power.", watch: "the nose rises sooner: less front downforce on fast exits." },
    minus: { label: "stiffer", why: "Stiffer front rebound makes the front take the load transfer on exit: a calmer, more stable exit.", watch: "understeer on power." },
  },
  {
    key: "bump_r", name: "Rear bump", tab: "Dampers", scope: "Exit (weight moving back)", prio: 0.6,
    steps: ["1-2 clicks", "2-4 clicks", "4-6 clicks"], effect: { phase: [0, 0.2, 1], speed: [1, 1, 0.8] },
    plus: { label: "stiffer", why: "Stiffer rear bump makes the rear take the load transfer as you press the throttle: the car rotates more on exit.", watch: "less traction." },
    minus: { label: "softer", why: "Softer rear bump lets the rear squat smoothly onto its tyres under power: more traction, less power oversteer.", watch: "more squat: the rear can reach its bump stops." },
  },
  {
    key: "tc", name: "Traction control (TC)", tab: "Electronics", scope: "On the throttle", prio: 0.9, live: true, noCup: true,
    steps: ["1 step", "1-2 steps", "2 steps"], effect: { phase: [0, 0, 1], speed: [1, 0.7, 0.3] },
    plus: { label: "lower", why: "Less TC lets the rear tyres slip a little more: the car rotates on power.", watch: "wheelspin and hot rear tyres; harder in the rain." },
    minus: { label: "higher", why: "More TC cuts the power when the rear tyres spin: it catches power oversteer on exit.", watch: "too much cuts the drive: you lose time on the straights after." },
  },
  // Not balance tools: only the other problems below ask for them
  {
    key: "abs", name: "ABS", tab: "Electronics", scope: "Under braking", prio: 0.9, live: true, noCup: true,
    steps: ["1 step", "1-2 steps", "2 steps"],
    plus: { label: "higher", why: "More ABS steps in sooner when a tyre starts to lock.", watch: "longer braking distances if it works all the time." },
    minus: { label: "lower", why: "Less ABS lets the tyres slip more under braking: shorter stops for a precise foot.", watch: "lock-ups and flat spots." },
  },
  {
    key: "brake_power", name: "Brake power", tab: "Mechanical grip", scope: "Under braking", prio: 0.7,
    steps: ["2-3 %", "3-5 %", "5-8 %"],
    plus: { label: "higher", why: "More brake torque for the same pedal.", watch: "easier to lock." },
    minus: { label: "lower", why: "Less brake torque for the same pedal: finer control near the limit, fewer lock-ups.", watch: "you need more pedal for the same stop." },
  },
  {
    key: "steer_ratio", name: "Steering ratio", tab: "Mechanical grip", scope: "Response only (no grip change)", prio: 0.6,
    steps: ["1 step", "1 step", "2 steps"],
    plus: { label: "higher (slower)", why: "A higher ratio needs more wheel for the same lock: calmer at high speed.", watch: "more arm work in hairpins." },
    minus: { label: "lower (quicker)", why: "A lower ratio turns the wheels more for the same steering: a quicker, more direct car.", watch: "twitchier at high speed." },
  },
  {
    key: "fast_bump", name: "Fast bump", tab: "Dampers", scope: "Kerbs and bumps", prio: 0.9,
    steps: ["2 clicks", "3-4 clicks", "5-6 clicks"],
    plus: { label: "stiffer", why: "Stiffer fast bump resists quick hits: less travel used over a kerb.", watch: "the car is thrown off the kerbs." },
    minus: { label: "softer", why: "Softer fast bump lets the wheel climb a kerb or a bump without lifting the car.", watch: "the car can bottom over big hits." },
  },
  {
    key: "fast_rebound", name: "Fast rebound", tab: "Dampers", scope: "Kerbs and bumps", prio: 0.8,
    steps: ["2 clicks", "3-4 clicks", "5-6 clicks"],
    plus: { label: "stiffer", why: "Stiffer fast rebound calms the car after a hit.", watch: "the wheel stays in the air after a kerb." },
    minus: { label: "softer", why: "Softer fast rebound lets the wheel drop back onto the road quickly after a kerb.", watch: "the car can bounce after big hits." },
  },
  {
    key: "bs_rate", name: "Bump stop rate", tab: "Mechanical grip", scope: "Fast corners and big hits", prio: 0.7,
    steps: ["1 step", "1-2 steps", "2-3 steps"],
    plus: { label: "stiffer", why: "Stiffer bump stops hold the car up once it reaches them: less bottoming.", watch: "a harsher, snappier car once on the stops." },
    minus: { label: "softer", why: "Softer bump stops make landing on them gentler.", watch: "the car sinks further at speed." },
  },
];

type Vote = { s: string; d: 1 | -1; w: number };   // d: 1 = the setting's `plus`

/** Problems that are not a balance: each votes for its usual fixes, the first ones first. */
export const ISSUES: { key: string; label: string; votes: Vote[] }[] = [
  { key: "front_lock", label: "Fronts lock under braking", votes: [
    { s: "bias", d: 1, w: 1 }, { s: "abs", d: 1, w: 0.8 }, { s: "brake_power", d: -1, w: 0.6 }] },
  { key: "rear_brake", label: "Rear unstable under braking", votes: [
    { s: "bias", d: -1, w: 1 }, { s: "preload", d: -1, w: 0.8 }, { s: "abs", d: 1, w: 0.6 }, { s: "toe_r", d: -1, w: 0.6 },
    { s: "rebound_r", d: -1, w: 0.4 }, { s: "wing", d: -1, w: 0.3 }] },
  { key: "wheelspin", label: "Wheelspin on exit", votes: [
    { s: "tc", d: -1, w: 1 }, { s: "arb_r", d: -1, w: 0.8 }, { s: "preload", d: -1, w: 0.6 }, { s: "bump_r", d: -1, w: 0.6 },
    { s: "spring_r", d: -1, w: 0.5 }] },
  { key: "kerbs", label: "Kerbs upset the car", votes: [
    { s: "fast_bump", d: -1, w: 1 }, { s: "fast_rebound", d: -1, w: 0.7 }, { s: "arb_f", d: 1, w: 0.4 }, { s: "arb_r", d: -1, w: 0.4 },
    { s: "rh_f", d: -1, w: 0.3 }, { s: "rh_r", d: 1, w: 0.3 }] },
  { key: "bottoming", label: "Bottoming or scraping", votes: [
    { s: "rh_f", d: -1, w: 0.9 }, { s: "rh_r", d: 1, w: 0.9 }, { s: "bs_rate", d: 1, w: 0.7 }, { s: "spring_f", d: -1, w: 0.5 },
    { s: "spring_r", d: 1, w: 0.5 }] },
  { key: "lazy", label: "Lazy turn-in", votes: [{ s: "toe_f", d: 1, w: 1 }, { s: "steer_ratio", d: -1, w: 0.8 }] },
  { key: "nervous", label: "Nervous at high speed", votes: [
    { s: "toe_r", d: -1, w: 1 }, { s: "wing", d: -1, w: 0.8 }, { s: "rh_r", d: -1, w: 0.6 }, { s: "preload", d: -1, w: 0.4 },
    { s: "steer_ratio", d: 1, w: 0.4 }] },
  { key: "top_speed", label: "Slow on the straights", votes: [
    { s: "wing", d: 1, w: 1 }, { s: "rh_r", d: -1, w: 0.5 }, { s: "toe_f", d: -1, w: 0.3 }, { s: "toe_r", d: 1, w: 0.3 }] },
  { key: "front_hot", label: "Front tyres overheat", votes: [
    { s: "toe_f", d: -1, w: 0.7 }, { s: "camber_f", d: -1, w: 0.6 }, { s: "arb_f", d: 1, w: 0.5 }] },
  { key: "rear_hot", label: "Rear tyres overheat", votes: [
    { s: "toe_r", d: 1, w: 0.7 }, { s: "camber_r", d: 1, w: 0.6 }, { s: "tc", d: -1, w: 0.5 }, { s: "arb_r", d: -1, w: 0.5 }] },
];

/** Driving before setup: the usual technique behind each reported balance (phase × understeer / oversteer). */
export const DRIVING_TIPS: Record<string, string> = {
  "entry-u": "Entry understeer: brake a touch earlier and trail the brake into the turn, the load on the front makes it bite.",
  "entry-o": "Entry oversteer: release the brake progressively as you turn, and downshift a little later.",
  "mid-u": "Mid-corner understeer: too much speed at the apex; slow a bit more and wait for the front.",
  "mid-o": "Mid-corner oversteer: keep a light, steady throttle through the apex; a sudden lift steps the rear out.",
  "exit-u": "Exit understeer: get the car turned before the throttle, then open the steering as you press.",
  "exit-o": "Exit oversteer: unwind the steering as you add throttle, and squeeze the pedal rather than stab it.",
};

const SIDE = 0.12;       // weight of a change's effect where the car is fine
const MIN_SCORE = 0.6;   // below: not worth trying, unless it is the only answer to a reported problem
const SHOWN = 6;

export type Suggestion = {
  setting: Setting;
  dir: Dir;
  d: 1 | -1;
  score: number;
  step: string;
  fixes: string[];     // what it helps with
  worsens: string[];   // other reported problems it makes worse
  fixed: Set<string>;  // ids of the reported problems it helps: cell index or issue key
};

type Spot = { speed: number; phase: number; under: boolean };

/** Groups situations by phase and balance: "Entry understeer · slow, medium" (no speeds when all three). */
function situations(spots: Spot[]) {
  const groups = new Map<string, { phase: number; under: boolean; speeds: number[] }>();
  for (const c of spots) {
    const k = `${c.phase}${c.under}`;
    const g = groups.get(k) ?? { phase: c.phase, under: c.under, speeds: [] };
    g.speeds.push(c.speed);
    groups.set(k, g);
  }
  return [...groups.values()].map((g) =>
    `${PHASES[g.phase].label} ${g.under ? "understeer" : "oversteer"}${g.speeds.length === SPEEDS.length ? "" : ` · ${g.speeds.sort().map((s) => SPEEDS[s].label.toLowerCase()).join(", ")}`}`);
}

/** One setting changed one way, against a report. */
function evaluate(s: Setting, d: 1 | -1, cells: number[], active: typeof ISSUES): Suggestion {
  let benefit = 0, side = 0, sev = 0;
  const helped: Spot[] = [], hurt: Spot[] = [], fixes: string[] = [], worsens: string[] = [], fixed = new Set<string>();
  if (s.effect)
    for (let sp = 0; sp < SPEEDS.length; sp++)
      for (let ph = 0; ph < PHASES.length; ph++) {
        const e = s.effect.phase[ph] * s.effect.speed[sp];
        if (!e) continue;
        const v = cells[cellOf(sp, ph)] ?? 0, r = d * e;
        if (v === 0) { side += Math.abs(r); continue; }
        const gain = r * -v;   // understeer (v < 0) asks for rotation
        benefit += gain;
        if (gain >= 0.5) {
          helped.push({ speed: sp, phase: ph, under: v < 0 });
          fixed.add(String(cellOf(sp, ph)));
          if (e >= 0.5) sev = Math.max(sev, Math.abs(v));
        } else if (gain <= -0.5) hurt.push({ speed: sp, phase: ph, under: v < 0 });
      }
  for (const i of active)
    for (const v of i.votes.filter((x) => x.s === s.key)) {
      const gain = 2 * v.w * (v.d === d ? 1 : -1);
      benefit += gain;
      if (gain > 0) { fixes.push(i.label); fixed.add(i.key); sev = Math.max(sev, 2); }
      else worsens.push(i.label);
    }
  return {
    setting: s, dir: d === 1 ? s.plus : s.minus, d, score: (benefit - SIDE * side) * s.prio,
    step: s.steps[Math.max(0, Math.min(2, sev - 1))],
    fixes: [...situations(helped), ...fixes], worsens: [...situations(hurt), ...worsens], fixed,
  };
}

/** The changes to try for a report: `cells` = 9 values −3…3 (negative = understeer, cellOf()),
 *  `issues` = keys of ISSUES, `cup` = a car without TC and ABS. `top`: the best SHOWN changes (one per
 *  setting), then for each reported problem none of them helps, its best answer even if it costs
 *  elsewhere (slow-corner understeer with fast-corner oversteer: the mechanical fix loosens the fast
 *  corners, which the aero fix above it covers); `more`: the other worthwhile changes. */
export function diagnose(cells: number[], issues: string[], cup = false) {
  const active = ISSUES.filter((i) => issues.includes(i.key));
  const all = SETTINGS.filter((s) => !(cup && s.noCup))
    .flatMap((s) => [evaluate(s, 1, cells, active), evaluate(s, -1, cells, active)])
    .filter((x) => x.fixes.length && x.score > 0)
    .sort((a, b) => b.score - a.score);
  const used = new Set<string>(), ranked: Suggestion[] = [];
  for (const x of all) if (x.score >= MIN_SCORE && !used.has(x.setting.key)) { ranked.push(x); used.add(x.setting.key); }
  const top = ranked.slice(0, SHOWN), more = ranked.slice(SHOWN);
  const reported = [...cells.flatMap((v, k) => (v ? [String(k)] : [])), ...active.map((i) => i.key)];
  for (const id of reported) {
    if (top.some((x) => x.fixed.has(id))) continue;
    const inTop = new Set(top.map((x) => x.setting.key));
    const answer = all.find((x) => x.fixed.has(id) && !inTop.has(x.setting.key));
    if (!answer) continue;
    top.push(answer);
    const k = more.findIndex((x) => x.setting.key === answer.setting.key);
    if (k >= 0) more.splice(k, 1);
  }
  return { top, more };
}

/** The state in the page's address, so a diagnosis can be shared: b = the 9 cells as digits 0-6
 *  (value + 3), i = issue keys. */
export function readState(b: string | undefined, i: string | undefined) {
  const cells = Array.from({ length: CELLS }, (_, k) => {
    const n = Number(b?.[k]);
    return Number.isInteger(n) && n >= 0 && n <= 6 ? n - 3 : 0;
  });
  const issues = (i ?? "").split(",").filter((k) => ISSUES.some((x) => x.key === k));
  return { cells, issues };
}
export const writeState = (cells: number[], issues: string[]) => ({
  b: cells.some((v) => v !== 0) ? cells.map((v) => v + 3).join("") : "",
  i: issues.join(","),
});

/** Cars without traction control or ABS in ACC. */
export const NO_AIDS = new Set(["porsche_991ii_gt3_cup", "porsche_992_gt3_cup"]);
