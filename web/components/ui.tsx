import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

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
