import { Flame, Gauge, Medal, Rocket, Sprout, Swords, Wrench, Zap, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { RANKS, rankFor, type Rank } from "@/lib/ranks";

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

/** Each rank's symbol (its colour is in lib/ranks.ts). */
export const RANK_ICONS: Record<Rank["title"], LucideIcon> = {
  Rookie: Sprout, Apprentice: Wrench, Intermediate: Gauge, Advanced: Zap,
  Contender: Swords, "Front Runner": Flame, Expert: Medal, Alien: Rocket,
};

const rankRange = (r: Rank) => {
  const next = RANKS[RANKS.indexOf(r) - 1];
  return next ? `${r.min}-${next.min - 1}` : `${r.min}+`;
};

/** A driver's rank as its symbol on a tinted square, next to their name (title on hover). */
export function RankIcon({ rating, size = 18 }: { rating: number | null | undefined; size?: number }) {
  if (rating == null) return null;
  const r = rankFor(rating), Icon = RANK_ICONS[r.title];
  return (
    <span title={`${r.title} (${rankRange(r)})`} className="inline-grid shrink-0 place-items-center rounded-md"
          style={{ width: size + 8, height: size + 8, color: r.color, background: `${r.color}1f`, boxShadow: `inset 0 0 0 1px ${r.color}55` }}>
      <Icon size={size - 2} strokeWidth={2.2} />
    </span>
  );
}

/** Rank title of a rating (lib/ranks.ts), as a coloured pill with its symbol. */
export function RankBadge({ rating, size = "sm" }: { rating: number | null | undefined; size?: "sm" | "md" }) {
  if (rating == null) return null;
  const r = rankFor(rating), Icon = RANK_ICONS[r.title];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-semibold uppercase tracking-wider ${size === "md" ? "px-2.5 py-0.5 text-xs" : "px-2 py-px text-[10px]"}`}
          style={{ color: r.color, borderColor: `${r.color}66`, background: `${r.color}14` }}>
      <Icon size={size === "md" ? 13 : 11} strokeWidth={2.4} />
      {r.title}
    </span>
  );
}

/** The rank scale, Rookie to Alien: one coloured segment per rank, as wide as its rating range. */
export function RankScale() {
  const ranks = [...RANKS].reverse();
  return (
    <div className="card rise overflow-x-auto p-4">
      <div className="flex min-w-[480px] gap-1">
        {ranks.map((r, k) => {
          const Icon = RANK_ICONS[r.title], width = (ranks[k + 1]?.min ?? 100) - r.min;
          return (
            <div key={r.title} className="min-w-0 text-center" style={{ flex: `${width} 1 0`, minWidth: 58 }}>
              <div className="mx-auto mb-1.5 grid h-8 w-8 place-items-center rounded-lg" style={{ color: r.color, background: `${r.color}1f`, boxShadow: `inset 0 0 0 1px ${r.color}55` }}>
                <Icon size={17} strokeWidth={2.2} />
              </div>
              <div className="h-1.5 rounded-full" style={{ background: r.color }} />
              <div className="mt-1.5 truncate text-[11px] font-semibold" style={{ color: r.color }}>{r.title}</div>
              <div className="tabular text-[10px] text-zinc-500">{rankRange(r)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
