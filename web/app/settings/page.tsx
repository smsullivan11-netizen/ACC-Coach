import { requireDriver } from "@/lib/auth";
import Tokens from "./Tokens";

export default async function SettingsPage() {
  const driver = await requireDriver();
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">Settings</h1>
      <p className="mt-1 text-sm text-zinc-400">Signed in as {driver.display_name}.</p>
      <h2 className="mt-8 font-medium text-white">Upload tokens</h2>
      <p className="mt-1 text-sm text-zinc-400">
        One per PC: it lets the upload script (and later the desktop app) send your sessions without signing in.
        Revoke it if a PC is lost or shared.
      </p>
      <Tokens />
    </div>
  );
}
