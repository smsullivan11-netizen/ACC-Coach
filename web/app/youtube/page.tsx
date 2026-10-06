import { Clapperboard, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import BackgroundVideo from "@/components/BackgroundVideo";
import { PageTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { CHANNEL_URL, SECTIONS, teamVideos, type YouTubeData } from "@/lib/youtube";
import VideoGrid from "./VideoGrid";

export const metadata: Metadata = { title: "YouTube" };

// The team's YouTube channel, sorted in three sections by its playlists (lib/youtube.ts).
export default async function YouTubePage(props: PageProps<"/youtube">) {
  await requireDriver();
  const { section } = await props.searchParams;
  let data: YouTubeData | null = null, error: string | null = null;
  try {
    data = await teamVideos();
  } catch (e) {
    console.error("youtube", e);
    error = "YouTube could not be reached. Try again in a few minutes.";
  }
  const current = data?.sections.find((s) => s.key === section) ?? data?.sections.find((s) => s.videos.length) ?? data?.sections[0];

  return (
    // The team video behind the page, as on the dashboard (user's request); cards in frosted glass
    <div className="glass">
      <BackgroundVideo src="/media/dashboard-bg.mp4" poster="/media/dashboard-bg.jpg" />
      <PageTitle icon={Clapperboard} sub="The team's videos: livery reveals, hotlaps and highlights.">YouTube</PageTitle>
      {!data && (
        <p className="card p-6 text-zinc-400">
          {error ?? "The YouTube channel is not connected yet (YOUTUBE_API_KEY missing on the server)."}{" "}
          <a href={CHANNEL_URL} target="_blank" rel="noreferrer" className="text-accent underline">Open the channel</a>
        </p>
      )}
      {data && (
        <>
          <div className="card card-red rise flex flex-wrap items-center gap-4 p-5">
            {data.channel.avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.channel.avatar} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full ring-2 ring-accent/80" />
            )}
            <div className="min-w-0">
              <div className="display text-2xl text-white">{data.channel.title}</div>
              <div className="text-sm text-zinc-400">
                {data.channel.subscribers != null && <>{data.channel.subscribers.toLocaleString("en-GB")} subscribers · </>}
                {data.channel.videos} videos
              </div>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <a href={CHANNEL_URL} target="_blank" rel="noreferrer" className="btn btn-ghost"><ExternalLink size={15} /> Channel</a>
              <a href={`${CHANNEL_URL}?sub_confirmation=1`} target="_blank" rel="noreferrer" className="btn btn-primary">Subscribe</a>
            </div>
          </div>

          {data.unsorted ? (
            <>
              <p className="card mt-5 p-4 text-sm text-zinc-400">
                The videos are sorted by the channel&apos;s playlists, and it has none yet: create three public playlists on
                YouTube whose names contain <strong className="text-zinc-200">Livery</strong>,{" "}
                <strong className="text-zinc-200">Hotlap</strong> and <strong className="text-zinc-200">Highlights</strong>, then
                add each video to one. Until then, the latest uploads:
              </p>
              <div className="mt-5"><VideoGrid videos={data.unsorted} /></div>
            </>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap gap-2">
                {data.sections.map((s) => (
                  <Link key={s.key} href={`/youtube?section=${s.key}`} scroll={false}
                        className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                          s.key === current?.key ? "border-race bg-race/20 text-white" : "border-white/10 bg-raised/60 text-zinc-300 hover:border-accent/60 hover:text-white"}`}>
                    {s.title} <span className="ml-1 font-normal text-zinc-400">{s.videos.length}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-5">
                {current && current.videos.length > 0 ? <VideoGrid key={current.key} videos={current.videos} /> : (
                  <p className="card p-6 text-sm text-zinc-400">
                    {current?.playlist ? "This playlist is empty for now."
                      : `No playlist for this section yet: create a public playlist whose name contains "${SECTIONS.find((s) => s.key === current?.key)?.title.split(" ")[0]}" on the channel.`}
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
