import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { LogOut } from "lucide-react";
import Link from "next/link";
import NavLinks, { GetAppLink } from "@/components/NavLinks";
import Tutorial from "@/components/Tutorial";
import { Avatar, Pcgr } from "@/components/ui";
import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// The team's livery font (personal-use licence): headings only
const konexy = localFont({ src: "./fonts/KonexyPersonalUse.otf", variable: "--font-konexy", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ACC Coach", template: "%s · ACC Coach" },
  description: "Telemetry, lap comparison, coaching and rankings for the PCGR team",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const driver = await currentDriver();
  // Whether the guide has been closed once (migration 0013): it opens by itself until then
  const guideSeen = driver
    ? (await sql<{ seen: boolean }[]>`select guide_seen_at is not null as seen from driver where id = ${driver.id}`)[0]?.seen ?? true
    : true;
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${konexy.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="header-skin sticky top-0 z-30 border-t border-white/[0.07] shadow-[0_12px_32px_-12px_rgb(0_0_0/0.9)]">
          {/* Three groups (user's request 2026-10-07): the logo, the sections in a recessed tray
              (components/NavLinks), and on the right "Get the app" + the account capsule (guide,
              profile, sign out, split by thin dividers). Phones: the tray goes to a second row. */}
          <nav className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 md:flex-nowrap lg:gap-x-4 2xl:gap-x-8 2xl:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2.5" title="Dashboard">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/team-helmet.jpg" alt="" width={36} height={36} className="rounded-xl ring-1 ring-white/15 shadow-[0_4px_14px_-4px_rgb(0_0_0/0.9)]" />
              <span className="display text-[15px] leading-none text-white max-[379px]:hidden">
                ACC <span className="text-accent">COACH</span>
              </span>
            </Link>
            {driver && (
              <>
                <NavLinks />
                <div className="ml-auto flex shrink-0 items-center gap-2 2xl:gap-3">
                  <GetAppLink />
                  <div className="flex h-11 items-center rounded-full border border-white/[0.12] bg-white/[0.06] p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.09),0_4px_14px_-6px_rgb(0_0_0/0.9)] backdrop-blur-sm">
                    <Tutorial seen={guideSeen} />
                    <span className="mx-0.5 h-5 w-px bg-white/10" />
                    <Link href="/settings" title="Your profile and settings"
                          className="flex h-9 items-center gap-2 rounded-full pl-1 pr-1 text-sm text-zinc-100 transition-colors hover:bg-white/[0.09] hover:text-white xl:pr-3">
                      <Avatar url={driver.avatar_url} name={driver.display_name} size={28} />
                      <span className="hidden max-w-24 truncate xl:inline">{driver.display_name}</span>
                    </Link>
                    <span className="mx-0.5 h-5 w-px bg-white/10" />
                    <form action="/auth/logout" method="post">
                      <button title="Sign out" aria-label="Sign out"
                              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-race/15 hover:text-red-300">
                        <LogOut size={16} />
                      </button>
                    </form>
                  </div>
                </div>
              </>
            )}
          </nav>
          <div className="stripe h-px" />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-6 text-xs text-zinc-600">
          <Pcgr className="display tracking-wider" />
          <span>ACC Coach</span>
          <Link href="/credits" className="ml-auto hover:text-zinc-400">Credits</Link>
          <Link href="/privacy" className="hover:text-zinc-400">Privacy</Link>
        </footer>
      </body>
    </html>
  );
}
