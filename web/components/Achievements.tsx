import { Activity, Crown, Flag, Gauge, Globe, Hourglass, Lock, Repeat, ShieldCheck, Sparkles, Target, Timer, TrendingUp, Trophy, type LucideIcon } from "lucide-react";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { trackInfo } from "@/lib/tracks";

const ICONS: Record<string, LucideIcon> = { Activity, Crown, Flag, Gauge, Globe, Hourglass, Repeat, ShieldCheck, Sparkles, Target, Timer, TrendingUp, Trophy };
const TIERS = {
  bronze: "from-amber-700/30 text-amber-500 ring-amber-600/40",
  silver: "from-zinc-300/20 text-zinc-200 ring-zinc-300/40",
  gold: "from-accent/30 text-accent ring-accent/50",
};

export type EarnedRow = { code: string; scope: string; detail: string | null; date: string };

// A driver's badges: earned ones in their tier colour (per-track ones counted), locked ones greyed.
export default function Achievements({ earned }: { earned: EarnedRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {ACHIEVEMENTS.map((a) => {
        const got = earned.filter((e) => e.code === a.code);
        const Icon = ICONS[a.icon] ?? Trophy;
        const title = got.length
          ? `${a.description}\n${got.map((g) => `${g.date}${g.scope ? ` · ${trackInfo(g.scope)?.name ?? g.scope}` : ""}${g.detail ? ` · ${g.detail}` : ""}`).join("\n")}`
          : a.description;
        return (
          <div key={a.code} title={title}
               className={`flex items-center gap-3 rounded-xl border border-white/5 p-3 ${got.length ? "bg-white/[0.03]" : "opacity-40"}`}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ${got.length ? `bg-gradient-to-br to-transparent ${TIERS[a.tier]}` : "bg-white/5 text-zinc-600 ring-white/10"}`}>
              {got.length ? <Icon size={19} /> : <Lock size={16} />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium text-white">
                <span className="truncate">{a.title}</span>
                {a.perTrack && got.length > 1 && <span className="text-xs text-accent">×{got.length}</span>}
              </div>
              <div className="truncate text-[11px] text-zinc-500">{got.length ? got[0].detail ?? a.description : a.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
