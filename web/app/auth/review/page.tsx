import { notFound } from "next/navigation";
import { reviewLoginEnabled, safeNext } from "@/lib/auth";

// Test account sign-in for the Microsoft Store's testers (see reviewLoginEnabled in lib/auth.ts):
// username and password, checked by /auth/review/check. ?next= as for Discord (the app's link page).

export default async function ReviewLogin(props: PageProps<"/auth/review">) {
  if (!reviewLoginEnabled()) notFound();
  const { next, error } = await props.searchParams;
  const back = safeNext(typeof next === "string" ? next : null) ?? "";
  return (
    <div className="card card-red rise mx-auto mt-10 max-w-sm p-8">
      <h1 className="display text-center text-2xl text-white">Test account</h1>
      <p className="mt-3 text-center text-sm text-zinc-400">
        For app reviewers (Microsoft Store certification). Team members sign in with Discord.
      </p>
      {error && <p className="mt-4 rounded-md border border-race/40 bg-race/10 px-3 py-2 text-sm text-red-300">Wrong username or password.</p>}
      <form action="/auth/review/check" method="post" className="mt-6 space-y-3">
        <input type="hidden" name="next" value={back} />
        <label className="block text-sm text-zinc-300">Username
          <input name="username" autoComplete="username" required className="input mt-1 w-full" />
        </label>
        <label className="block text-sm text-zinc-300">Password
          <input name="password" type="password" autoComplete="current-password" required className="input mt-1 w-full" />
        </label>
        <button className="btn btn-primary w-full justify-center py-2.5">Sign in</button>
      </form>
    </div>
  );
}
