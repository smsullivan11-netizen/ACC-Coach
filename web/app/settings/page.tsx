import { KeyRound, Settings, Shield } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, delay, PageTitle, SectionTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import AdminPanel from "./AdminPanel";
import Tokens from "./Tokens";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const driver = await requireDriver();
  const members = driver.is_admin
    ? await sql<{ id: string; display_name: string; is_admin: boolean }[]>`
        select id, display_name, is_admin from driver order by display_name`
    : [];
  return (
    <div className="max-w-3xl">
      <PageTitle icon={Settings} sub={
        <span className="inline-flex items-center gap-2">
          <Avatar url={driver.avatar_url} name={driver.display_name} size={20} />
          Signed in as <Link href={`/drivers/${driver.id}`} className="text-white underline">{driver.display_name}</Link>
          {driver.is_admin && " (admin)"}
        </span>}>
        Settings
      </PageTitle>
      <section className="card rise p-5" style={delay(40)}>
        <SectionTitle icon={KeyRound}>Upload tokens</SectionTitle>
        <p className="text-sm text-zinc-400">
          The ACC Coach app gets one automatically when you link a PC. Manual tokens are for the upload script.
          Revoke a token if a PC is lost or shared.
        </p>
        <Tokens />
      </section>
      {driver.is_admin && (
        <section className="card card-red rise mt-5 p-5" style={delay(100)}>
          <SectionTitle icon={Shield}>Admin</SectionTitle>
          <p className="text-sm text-zinc-400">
            Admins set the target lap times (on each leaderboard), manage other admins, and delete a member&apos;s
            data when they ask (<Link href="/privacy" className="underline">privacy policy</Link>).
          </p>
          <AdminPanel members={members} me={driver.id} />
        </section>
      )}
    </div>
  );
}
