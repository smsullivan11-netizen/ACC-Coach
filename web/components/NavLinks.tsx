"use client";

import { CarFront, Clapperboard, Download, Flag, LayoutDashboard, MonitorPlay, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/telemetry", label: "Telemetry", icon: MonitorPlay },
  { href: "/sessions", label: "Sessions", icon: Flag },
  { href: "/tracks", label: "Leaderboards", icon: Trophy },
  { href: "/cars", label: "Cars", icon: CarFront },
  { href: "/drivers", label: "Drivers", icon: Users },
  { href: "/youtube", label: "YouTube", icon: Clapperboard },
];

function useActive() {
  const path = usePathname();
  // The progression page is part of the Dashboard (opened from its "Your progression" block)
  return (href: string, exact?: boolean) =>
    (exact ? path === href || (href === "/" && path === "/progress") : path === href || path.startsWith(`${href}/`));
}

// Main navigation (header redesign, user's request 2026-10-07): the sections sit in a recessed tray,
// the current one is a raised tile with a yellow icon and the red bar. Labels from xl up (icons with
// tooltips below); on phones the tray takes a row of its own under the logo (see app/layout.tsx).
export default function NavLinks() {
  const active = useActive();
  return (
    <div className="order-last flex w-full min-w-0 items-center justify-between gap-0.5 overflow-x-auto [scrollbar-width:none] md:shrink-0 md:overflow-visible [&::-webkit-scrollbar]:hidden rounded-xl border border-white/[0.07] bg-black/40 p-1 shadow-[inset_0_1px_3px_rgb(0_0_0/0.6)] md:order-none md:w-auto md:justify-start">
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const on = active(href, exact);
        return (
          <Link key={href} href={href} title={label} aria-current={on ? "page" : undefined}
                className={`relative flex h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors xl:px-3 ${
                  on ? "bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_2px_6px_-2px_rgb(0_0_0/0.8)] ring-1 ring-white/10"
                     : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"}`}>
            <Icon size={16} className={on ? "text-accent" : ""} />
            <span className="hidden whitespace-nowrap xl:inline">{label}</span>
            {on && <span className="absolute inset-x-2.5 bottom-[3px] h-0.5 rounded-full bg-race xl:inset-x-3" />}
          </Link>
        );
      })}
    </div>
  );
}

/** "Get the app": the one yellow button of the header. */
export function GetAppLink() {
  const on = useActive()("/download");
  return (
    <Link href="/download" title="Get the app"
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-accent/45 px-2.5 text-sm font-medium text-accent shadow-[0_0_24px_-10px] shadow-accent/50 transition-colors hover:bg-accent/10 lg:px-3 ${
            on ? "bg-accent/10" : "bg-accent/[0.03]"}`}>
      <Download size={15} />
      <span className="hidden whitespace-nowrap lg:inline xl:hidden 2xl:inline">Get the app</span>
    </Link>
  );
}
