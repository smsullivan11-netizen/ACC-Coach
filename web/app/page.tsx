import { redirect } from "next/navigation";
import { currentDriver, devLoginEnabled, discordConfigured } from "@/lib/auth";

const ERRORS: Record<string, string> = {
  "not-in-team": "Your Discord account is not a member of the team's Discord server.",
  "sign-in-expired": "The sign-in took too long or was interrupted. Please try again.",
  "discord-error": "Discord did not answer as expected. Please try again.",
  "discord-not-configured": "Discord sign-in is not configured on this server yet.",
};

export default async function Home(props: PageProps<"/">) {
  if (await currentDriver()) redirect("/sessions");
  const { error } = await props.searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-white">ACC Coach</h1>
      <p className="mt-3 text-zinc-400">
        The team&apos;s telemetry: every lap, every corner, every driver, side by side.
      </p>
      {message && <p className="mt-6 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{message}</p>}
      {discordConfigured() && (
        <a
          href="/auth/login"
          className="mt-8 inline-block rounded-md bg-[#5865F2] px-5 py-2.5 font-medium text-white hover:bg-[#4752c4]"
        >
          Sign in with Discord
        </a>
      )}
      {devLoginEnabled() && (
        <p className="mt-6 text-sm text-zinc-500">
          Development: <a className="underline" href="/auth/dev?name=Alice">sign in as Alice</a> or{" "}
          <a className="underline" href="/auth/dev?name=Bob">Bob</a>
        </p>
      )}
    </div>
  );
}
