import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { LogOut } from "lucide-react";
import Link from "next/link";
import NavLinks from "@/components/NavLinks";
import { Avatar } from "@/components/ui";
import { currentDriver } from "@/lib/auth";
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
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${konexy.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 bg-black/55 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl backdrop-saturate-150">
          <nav className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/team-helmet.jpg" alt="" width={34} height={34} className="rounded-lg ring-1 ring-white/10" />
              <span className="display hidden text-[15px] leading-none text-white sm:inline">
                ACC <span className="text-accent">COACH</span>
              </span>
            </Link>
            {driver && (
              <>
                <NavLinks />
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <Link href="/settings" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                        title="Settings">
                    <Avatar url={driver.avatar_url} name={driver.display_name} size={26} />
                    <span className="hidden lg:inline">{driver.display_name}</span>
                  </Link>
                  <form action="/auth/logout" method="post">
                    <button title="Sign out" className="rounded-md p-2 text-zinc-500 hover:bg-white/5 hover:text-white">
                      <LogOut size={16} />
                    </button>
                  </form>
                </span>
              </>
            )}
          </nav>
          <div className="stripe h-px" />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-6 text-xs text-zinc-600">
          <span className="display tracking-wider">PCGR</span>
          <span>ACC Coach</span>
          <Link href="/credits" className="ml-auto hover:text-zinc-400">Credits</Link>
          <Link href="/privacy" className="hover:text-zinc-400">Privacy</Link>
        </footer>
      </body>
    </html>
  );
}
