import { Stethoscope } from "lucide-react";
import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { DRIVING_STYLE } from "@/lib/car-driving";
import { carSide } from "@/lib/car-images";
import { CARS, carName } from "@/lib/cars";
import { sql } from "@/lib/db";
import { readState } from "@/lib/setup-doctor";
import CarsTabs from "../../cars/CarsTabs";
import Diagnostic, { type DiagnosticCar } from "./Diagnostic";

export const metadata: Metadata = { title: "Setup diagnostic" };

// Setup diagnostic (user's request, 2026-10-22; lib/setup-doctor.ts): the driver marks where the car
// understeers or oversteers and what else goes wrong; the changes to try are ranked in the browser.
// The report lives in the address (?car=&b=&i=), so it can be shared with a teammate.
export default async function SetupDiagnosticPage(props: PageProps<"/setups/diagnostic">) {
  await requireDriver();
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const notes = await sql<{ car_key: string; note: string | null }[]>`select car_key, note from car_rating`.catch(() => []);
  const cars: DiagnosticCar[] = CARS.map((c) => ({
    key: c.key, name: carName(c.key), cls: c.cls, side: carSide(c.key),
    style: notes.find((n) => n.car_key === c.key)?.note?.trim() || DRIVING_STYLE[c.key] || null,
  }));
  const car = cars.some((c) => c.key === one(sp.car)) ? one(sp.car)! : "";

  return (
    <div className="bleed bleed-lg">
      <PageTitle icon={Stethoscope} sub="Tell where the car misbehaves: the setup changes that fix it, ranked. Rules from vehicle dynamics and ACC's setup guides; no AI, nothing is saved.">
        Setup diagnostic
      </PageTitle>
      <div className="mb-5"><CarsTabs value="diagnostic" /></div>
      <Diagnostic cars={cars} initial={{ car, ...readState(one(sp.b), one(sp.i)) }} />
    </div>
  );
}
