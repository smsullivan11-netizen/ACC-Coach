import { BarChart3, Gauge, Route } from "lucide-react";
import { delay, Pcgr } from "@/components/ui";
import { currentDriver, devLoginEnabled, discordConfigured, reviewLoginEnabled } from "@/lib/auth";
import Dashboard from "./Dashboard";

const ERRORS: Record<string, string> = {
  "not-in-team": "Your Discord account is not a member of the team's Discord server.",
  "sign-in-expired": "The sign-in took too long or was interrupted. Please try again.",
  "discord-error": "Discord did not answer as expected. Please try again.",
  "discord-not-configured": "Discord sign-in is not configured on this server yet.",
};

// Signed in: the dashboard. Signed out: the team's sign-in page.
export default async function Home(props: PageProps<"/">) {
  const driver = await currentDriver();
  if (driver) return <Dashboard me={driver} />;
  const { error } = await props.searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 py-6 md:grid-cols-[1.1fr_1fr]">
      <div className="rise order-2 md:order-1">
        <p className="display text-xs tracking-[0.3em] text-race"><Pcgr /> · PCGROUP RACING</p>
        <h1 className="display mt-3 text-5xl leading-tight text-white">
          ACC <span className="text-accent">COACH</span>
        </h1>
        <p className="mt-4 max-w-md text-lg text-zinc-300">
          The team&apos;s telemetry: every lap, every corner, every driver, side by side.
        </p>
        <ul className="mt-6 space-y-2.5 text-sm text-zinc-400">
          <li className="flex items-center gap-2.5"><Route size={16} className="text-accent" /> Compare your laps with your teammates&apos;, corner by corner</li>
          <li className="flex items-center gap-2.5"><Gauge size={16} className="text-accent" /> Coaching after every session: where the time goes and what to change</li>
          <li className="flex items-center gap-2.5"><BarChart3 size={16} className="text-accent" /> Leaderboards, targets and the Overall Driver Rating</li>
        </ul>
        {message && <p className="mt-6 rounded-md border border-race/40 bg-race/10 px-3 py-2 text-sm text-red-300">{message}</p>}
        {discordConfigured() && (
          <a href="/auth/login"
             className="mt-8 inline-flex items-center gap-2.5 rounded-lg bg-accent px-5 py-3 font-semibold text-ink shadow-[0_0_40px_-10px] shadow-accent/60 transition hover:brightness-110">
            <DiscordIcon /> Sign in with Discord
          </a>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          For members of the team&apos;s Discord server.
          {reviewLoginEnabled() && <> App reviewer? <a className="underline hover:text-white" href="/auth/review">Use the test account</a></>}
        </p>
        {devLoginEnabled() && (
          <p className="mt-6 text-sm text-zinc-500">
            Development: <a className="underline" href="/auth/dev?name=Alice">sign in as Alice</a> or{" "}
            <a className="underline" href="/auth/dev?name=Bob">Bob</a>
          </p>
        )}
      </div>
      <div className="rise order-1 flex justify-center md:order-2" style={delay(120)}>
        <div className="relative">
          <div className="absolute inset-6 rounded-full bg-accent/15 blur-3xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/team-logo.jpg" alt="PCGR mascot" width={360} height={360}
               className="relative rounded-3xl ring-1 ring-white/10" />
        </div>
      </div>
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.7 3a19.7 19.7 0 0 0-4.9 1.5C.7 9.2-.2 13.8.3 18.3a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4a13 13 0 0 1-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.8-3.8-13.9ZM8.5 15.6c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
    </svg>
  );
}
