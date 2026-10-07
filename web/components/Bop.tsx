// BoP badge (user's request, 2026-10-07): on leaderboard entries and the session page. Default BoP =
// the game's own (the team's usual championships); LFM BoP with LFM's ballast and restrictor for that
// car and track at the session's date (lib/references.ts). Safe on server and client.

export type BopInfo = { bop: string | null; ballast_kg?: number | null; restrictor_pct?: number | null };

const kg = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(Math.round(v))} kg`;

/** "LFM · +12 kg · 20 % restrictor" / "Default BoP". */
export function bopText({ bop, ballast_kg, restrictor_pct }: BopInfo, short = false) {
  if (bop !== "lfm") return short ? "Default" : "Default BoP";
  const parts = [short ? "LFM" : "LFM BoP"];
  if (ballast_kg != null) parts.push(kg(ballast_kg));
  if (restrictor_pct) parts.push(`${Math.round(restrictor_pct)} %${short ? "" : " restrictor"}`);
  return parts.join(" · ");
}

export default function BopBadge({ info, short = true }: { info: BopInfo; short?: boolean }) {
  const lfm = info.bop === "lfm";
  return (
    <span title={lfm ? "LFM BoP: Low Fuel Motorsport's ballast and restrictor for this car and track" : "Default BoP: the game's own balance of performance"}
          className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
            lfm ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 bg-white/[0.04] text-zinc-400"}`}>
      {bopText(info, short)}
    </span>
  );
}
