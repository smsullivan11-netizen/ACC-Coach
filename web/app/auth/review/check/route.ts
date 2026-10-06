import { NextResponse } from "next/server";
import { appUrl, REVIEW_DISCORD_ID, reviewLoginEnabled, reviewPasswordOk, safeNext, startSession, upsertDiscordDriver } from "@/lib/auth";

// The test account's sign-in form (/auth/review) posts here. A wrong password waits a second, which
// with a long random REVIEW_PASSWORD makes guessing hopeless.
export async function POST(request: Request) {
  if (!reviewLoginEnabled()) return new Response("Not found", { status: 404 });
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? ""));
  if (!reviewPasswordOk(String(form.get("username") ?? ""), String(form.get("password") ?? ""))) {
    await new Promise((r) => setTimeout(r, 1000));
    const q = new URLSearchParams({ error: "1", ...(next ? { next } : {}) });
    return NextResponse.redirect(`${appUrl()}/auth/review?${q}`, 303);
  }
  const driverId = await upsertDiscordDriver({ id: REVIEW_DISCORD_ID, name: "Store Reviewer", avatar: null });
  await startSession(driverId);
  return NextResponse.redirect(`${appUrl()}${next ?? "/"}`, 303);
}
