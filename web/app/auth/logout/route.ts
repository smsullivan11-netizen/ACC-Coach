import { NextResponse } from "next/server";
import { appUrl, endSession } from "@/lib/auth";

export async function POST() {
  await endSession();
  return NextResponse.redirect(`${appUrl()}/`, 303);
}
