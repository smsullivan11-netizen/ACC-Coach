import Link from "next/link";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import AdminPanel from "./AdminPanel";
import Tokens from "./Tokens";

export default async function SettingsPage() {
  const driver = await requireDriver();
  const members = driver.is_admin
    ? await sql<{ id: string; display_name: string; is_admin: boolean }[]>`
        select id, display_name, is_admin from driver order by display_name`
    : [];
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">Settings</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Signed in as <Link href={`/drivers/${driver.id}`} className="text-white underline">{driver.display_name}</Link>
        {driver.is_admin && " (admin)"}.
      </p>
      <h2 className="mt-8 font-medium text-white">Upload tokens</h2>
      <p className="mt-1 text-sm text-zinc-400">
        The ACC Coach app gets one automatically when you link a PC. Manual tokens are for the upload script.
        Revoke a token if a PC is lost or shared.
      </p>
      <Tokens />
      {driver.is_admin && (
        <>
          <h2 className="mt-10 font-medium text-white">Admin</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Admins set the target lap times (on each leaderboard), manage other admins, and delete a member&apos;s
            data when they ask (<Link href="/privacy" className="underline">privacy policy</Link>).
          </p>
          <AdminPanel members={members} me={driver.id} />
        </>
      )}
    </div>
  );
}
