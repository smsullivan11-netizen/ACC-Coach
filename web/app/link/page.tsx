import { currentDriver } from "@/lib/auth";

// Opened by the desktop app ("Link this PC"): after one click, the browser goes back to the app on
// this PC (http://127.0.0.1:<port>/callback) with a new upload token for the signed-in driver.

const validPort = (p: unknown) => typeof p === "string" && /^\d{4,5}$/.test(p) && +p >= 1024 && +p <= 65535;
const validState = (s: unknown) => typeof s === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(s);

export default async function LinkPage(props: PageProps<"/link">) {
  const { port, state } = await props.searchParams;
  if (!validPort(port) || !validState(state))
    return <p className="card mx-auto mt-16 max-w-md p-6 text-center text-zinc-400">Open this page from the ACC Coach app (tray icon → Link this PC).</p>;

  const driver = await currentDriver();
  const here = `/link?port=${port}&state=${state}`;
  return (
    <div className="card card-red rise mx-auto mt-10 max-w-md p-8 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/team-helmet.jpg" alt="" width={72} height={72} className="mx-auto rounded-2xl ring-1 ring-white/10" />
      <h1 className="display mt-4 text-2xl text-white">Link this PC</h1>
      <p className="mt-3 text-zinc-400">
        The ACC Coach app on this PC will upload your sessions to your account automatically.
      </p>
      {driver ? (
        <form action="/link/confirm" method="post" className="mt-8">
          <input type="hidden" name="port" value={port as string} />
          <input type="hidden" name="state" value={state as string} />
          <button className="btn btn-primary px-5 py-2.5 text-base">
            Link this PC as {driver.display_name}
          </button>
          <p className="mt-3 text-xs text-zinc-500">You can revoke it anytime in Settings.</p>
        </form>
      ) : (
        <a href={`/auth/login?next=${encodeURIComponent(here)}`}
           className="btn btn-primary mt-8 px-5 py-2.5 text-base">
          Sign in with Discord
        </a>
      )}
    </div>
  );
}
