import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { RANKS, rankFor, rankLevel, type Rank } from "@/lib/ranks";

// Small shared pieces of the interface (server and client components).

/** Driver picture, or their initials on a dark disc. */
export function Avatar({ url, name, size = 28, ring = false }: { url: string | null | undefined; name: string; size?: number; ring?: boolean }) {
  const cls = `shrink-0 rounded-full ${ring ? "ring-2 ring-accent/70" : ""}`;
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className={cls} style={{ width: size, height: size }} />;
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className={`${cls} grid place-items-center bg-raised font-semibold text-zinc-300`}
          style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

const TONES = {
  yellow: "border-accent/40 bg-accent/10 text-accent",
  red: "border-race/50 bg-race/10 text-red-300",
  green: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  blue: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  grey: "border-white/10 bg-white/5 text-zinc-400",
} as const;

/** A small label: lap status, session type, personal best… */
export function Chip({ tone = "grey", icon: Icon, children, title }: { tone?: keyof typeof TONES; icon?: LucideIcon; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 ${TONES[tone]}`}>
      {Icon && <Icon size={12} strokeWidth={2.25} />}
      {children}
    </span>
  );
}

/** Section heading: icon, title in the team font, optional link or action on the right. */
export function SectionTitle({ icon: Icon, children, action }: { icon?: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {Icon && <Icon size={16} className="text-race" />}
      <h2 className="display text-sm uppercase tracking-wider text-white">{children}</h2>
      {action && <div className="ml-auto text-xs">{action}</div>}
    </div>
  );
}

/** Page heading in the team font, with an optional line under it. */
export function PageTitle({ children, sub, icon: Icon }: { children: ReactNode; sub?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rise mb-6">
      <h1 className="display flex items-center gap-3 text-2xl text-white">
        {Icon && <Icon size={24} className="text-race" />}
        {children}
      </h1>
      {sub && <p className="mt-1.5 text-sm text-zinc-400">{sub}</p>}
    </div>
  );
}

/** Animation delay for staggered entrances (.rise / .fill). */
export const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/** Leaderboard position: yellow, silver and red badges for the podium. */
export function Position({ n }: { n: number }) {
  const style = n === 1 ? "bg-accent text-ink" : n === 2 ? "bg-zinc-300 text-ink" : n === 3 ? "bg-race text-white" : "bg-white/5 text-zinc-400";
  return <span className={`tabular grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${style}`}>{n}</span>;
}

/** A rank's symbol: a gauge whose needle climbs with the rank (Rookie nearly empty, Expert maxed
 *  out), and an alien head for Alien; in the rank's colour (lib/ranks.ts). */
export function RankSymbol({ rank, size = 16 }: { rank: Rank; size?: number }) {
  if (rank.title === "Alien")
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <path d="M12 2.5C6.6 2.5 3.8 6.3 3.8 10.2c0 4.7 4.6 10.6 8.2 11.3 3.6-.7 8.2-6.6 8.2-11.3 0-3.9-2.8-7.7-8.2-7.7Z" fill={rank.color} />
        <ellipse cx={8.4} cy={11.6} rx={2.9} ry={1.6} transform="rotate(32 8.4 11.6)" fill="#0b0b0d" />
        <ellipse cx={15.6} cy={11.6} rx={2.9} ry={1.6} transform="rotate(-32 15.6 11.6)" fill="#0b0b0d" />
      </svg>
    );
  const f = Math.max(0.04, rankLevel(rank.min) / (RANKS.length - 2));   // Rookie 0 … Expert 1 (a sliver for Rookie)
  const R = 8.5, cx = 12, cy = 13.5, start = 150, sweep = 240;
  const at = (deg: number, r = R) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)].map((v) => v.toFixed(2)).join(" ");
  const arc = (to: number) => `M${at(start)} A${R} ${R} 0 ${to - start > 180 ? 1 : 0} 1 ${at(to)}`;
  const needle = start + sweep * f;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" strokeLinecap="round" aria-hidden>
      <path d={arc(start + sweep)} stroke="currentColor" strokeOpacity={0.22} strokeWidth={2.6} />
      <path d={arc(needle)} stroke={rank.color} strokeWidth={2.6} />
      <path d={`M${cx} ${cy} L${at(needle, R - 2.6)}`} stroke="#f4f4f5" strokeWidth={1.9} />
      <circle cx={cx} cy={cy} r={1.7} fill="#f4f4f5" />
    </svg>
  );
}

const rankRange = (r: Rank) => {
  const next = RANKS[RANKS.indexOf(r) - 1];
  return next ? `${r.min}-${next.min - 1}` : `${r.min}+`;
};

/** A driver's rank as its symbol on a tinted square, next to their name (title on hover). */
export function RankIcon({ rating, size = 18 }: { rating: number | null | undefined; size?: number }) {
  if (rating == null) return null;
  const r = rankFor(rating);
  return (
    <span title={`${r.title} (${rankRange(r)})`} className="inline-grid shrink-0 place-items-center rounded-md"
          style={{ width: size + 8, height: size + 8, color: r.color, background: `${r.color}1f`, boxShadow: `inset 0 0 0 1px ${r.color}55` }}>
      <RankSymbol rank={r} size={size} />
    </span>
  );
}

/** Rank title of a rating (lib/ranks.ts), as a coloured pill with its symbol. */
export function RankBadge({ rating, size = "sm" }: { rating: number | null | undefined; size?: "sm" | "md" }) {
  if (rating == null) return null;
  const r = rankFor(rating);
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-semibold uppercase tracking-wider ${size === "md" ? "px-2.5 py-0.5 text-xs" : "px-2 py-px text-[10px]"}`}
          style={{ color: r.color, borderColor: `${r.color}66`, background: `${r.color}14` }}>
      <RankSymbol rank={r} size={size === "md" ? 14 : 12} />
      {r.title}
    </span>
  );
}

/** Progress to the next rank: its symbol, the points still needed and a bar from the current
 *  rank's floor to the next one's (in the rank colours). */
export function NextRank({ rating, className = "" }: { rating: number | null | undefined; className?: string }) {
  if (rating == null) return null;
  const r = rankFor(rating), next = RANKS[RANKS.indexOf(r) - 1];
  if (!next)
    return (
      <div className={`flex items-center gap-2 text-sm ${className}`} style={{ color: r.color }}>
        <RankSymbol rank={r} size={18} /> Top rank reached
      </div>
    );
  const share = Math.max(0, Math.min(1, (rating - r.min) / (next.min - r.min)));
  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <span className="tabular font-semibold text-white">{(next.min - rating).toFixed(1)}</span> points to
        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: next.color }}>
          <RankSymbol rank={next} size={16} /> {next.title}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/5">
        <div className="fill h-full rounded-full" style={{ width: `${share * 100}%`, background: `linear-gradient(90deg, ${r.color}, ${next.color})` }} />
      </div>
    </div>
  );
}

/** The rank scale, Rookie to Alien: one segment per rank, as wide as its rating range, the colours
 *  blending into each other like a temperature map. */
export function RankScale() {
  const ranks = [...RANKS].reverse();
  return (
    <div className="card rise overflow-x-auto p-4">
      <div className="flex min-w-[480px] gap-1">
        {ranks.map((r, k) => {
          const width = (ranks[k + 1]?.min ?? 100) - r.min, next = ranks[k + 1]?.color ?? r.color;
          return (
            <div key={r.title} className="min-w-0 text-center" style={{ flex: `${width} 1 0`, minWidth: 58 }}>
              <div className="mx-auto mb-1.5 grid h-8 w-8 place-items-center rounded-lg" style={{ color: r.color, background: `${r.color}1f`, boxShadow: `inset 0 0 0 1px ${r.color}55` }}>
                <RankSymbol rank={r} size={22} />
              </div>
              <div className="h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${r.color}, ${next})` }} />
              <div className="mt-1.5 truncate text-[11px] font-semibold" style={{ color: r.color }}>{r.title}</div>
              <div className="tabular text-[10px] text-zinc-500">{rankRange(r)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
