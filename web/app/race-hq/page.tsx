import { Flag } from "lucide-react";
import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { raceArchive, raceHQ, raceMembers } from "@/lib/race-hq";
import RaceHQ from "./RaceHQ";

export const metadata: Metadata = { title: "Race Day HQ" };

export default async function RaceHQPage(props: PageProps<"/race-hq">) {
  const me = await requireDriver();
  const { event } = await props.searchParams;
  const eventId = typeof event === "string" && /^\d+$/.test(event) ? event : null;
  const [data, archive, members] = await Promise.all([
    raceHQ(eventId, me), raceArchive(), raceMembers(),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle icon={Flag} sub="The live race clock, both cars, stint handovers and team updates in one phone-friendly view.">
        Race Day HQ
      </PageTitle>
      <RaceHQ initial={data} archive={archive} members={members} me={me} />
    </div>
  );
}
