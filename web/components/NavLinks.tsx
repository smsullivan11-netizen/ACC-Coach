"use client";

import { CalendarDays, Download, Flag, LayoutDashboard, MonitorPlay, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/telemetry", label: "Telemetry", icon: MonitorPlay },
  { href: "/sessions", label: "Sessions", icon: Flag },
  { href: "/tracks", label: "Leaderboards", icon: Trophy },
  { href: "/drivers", label: "Drivers", icon: Users },
  { href: "/events", label: "Events", icon: CalendarDays },
];

// Main navigation; the current section is marked with a red bar.
export default function NavLinks() {
  const path = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(`${href}/`));
  return (
    <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const on = active(href, exact);
        return (
          <Link key={href} href={href}
                className={`relative flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm transition-colors sm:px-3 ${
                  on ? "text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}>
            <Icon size={16} className={on ? "text-accent" : ""} />
            <span className="hidden sm:inline">{label}</span>
            {on && <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-race sm:inset-x-3" />}
          </Link>
        );
      })}
      <Link href="/download"
            className={`ml-1 flex items-center gap-1.5 rounded-md border border-accent/40 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10 ${
              active("/download") ? "bg-accent/10" : ""}`}>
        <Download size={15} />
        <span className="hidden md:inline">Get the app</span>
      </Link>
    </div>
  );
}
