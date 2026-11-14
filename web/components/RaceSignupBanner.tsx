import Link from "next/link";

export default function RaceSignupBanner({ signedIn = false }: { signedIn?: boolean }) {
  return <section className="card card-red my-5 flex flex-wrap items-center justify-between gap-4 p-5" aria-label="Next race signup">
    <div>
      <h2 className="text-xl font-semibold text-white">Ready for the next race?</h2>
      <p className="mt-1 text-sm text-zinc-300">{signedIn ? "Sign up in Race Day HQ and see who’s joining the grid." : "Sign in with Discord, then sign up for the next race in Race Day HQ."}</p>
    </div>
    <Link href={signedIn ? "/race-hq#signup" : "/auth/login?next=%2Frace-hq%23signup"}
      className="inline-flex rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-ink transition hover:brightness-110">
      {signedIn ? "Sign up for the next race" : "Sign in to sign up"}
    </Link>
  </section>;
}
