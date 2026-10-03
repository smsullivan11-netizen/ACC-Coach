import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { currentDriver } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ACC Coach",
  description: "Telemetry, lap comparison and rankings for the team",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const driver = await currentDriver();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-white/10">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold tracking-tight text-white">
              ACC Coach
            </Link>
            {driver && (
              <>
                <Link href="/sessions" className="text-zinc-300 hover:text-white">Sessions</Link>
                <Link href="/tracks" className="text-zinc-300 hover:text-white">Leaderboards</Link>
                <Link href="/upload" className="text-zinc-300 hover:text-white">Upload</Link>
                <span className="ml-auto flex items-center gap-4">
                  <Link href="/settings" className="flex items-center gap-2 text-zinc-300 hover:text-white">
                    {driver.avatar_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={driver.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                    )}
                    {driver.display_name}
                  </Link>
                  <form action="/auth/logout" method="post">
                    <button className="text-zinc-500 hover:text-white">Sign out</button>
                  </form>
                </span>
              </>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
