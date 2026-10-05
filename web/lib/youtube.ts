import "server-only";
import { env } from "./auth";

// The team's YouTube channel (YouTube Data API v3, key in YOUTUBE_API_KEY; free quota of 10,000
// units a day, each call here costs 1 and results are cached for an hour). Videos are sorted by the
// channel's public playlists (user's choice): a playlist whose title contains "livery", "hotlap" or
// "highlight" feeds that section. Videos in no such playlist are not shown, except while the channel
// has none of these playlists yet (then the latest uploads are shown, unsorted).

export const CHANNEL_HANDLE = "PCGroupRacing";
export const CHANNEL_URL = `https://www.youtube.com/@${CHANNEL_HANDLE}`;

export const SECTIONS = [
  { key: "liveries", title: "Livery reveals", match: /livery|liveries/i },
  { key: "hotlaps", title: "Hotlaps", match: /hot ?laps?/i },
  { key: "highlights", title: "Highlights", match: /highlight/i },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];

export type Video = { id: string; title: string; published: string; thumb: string };
export type Channel = { id: string; title: string; avatar: string; subscribers: number | null; videos: number; uploads: string };
export type YouTubeData = {
  channel: Channel;
  sections: { key: SectionKey; title: string; playlist: string | null; videos: Video[] }[];
  unsorted: Video[] | null;   // latest uploads while no section playlist exists
};

const API = "https://www.googleapis.com/youtube/v3";

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({ ...params, key: env("YOUTUBE_API_KEY") });
  const res = await fetch(`${API}/${path}?${q}`, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`YouTube ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

type Thumbs = Record<string, { url: string } | undefined>;
type ItemsPage<T> = { items: T[]; nextPageToken?: string };

/** Up to `max` public videos of a playlist, in the playlist's order. */
async function playlistVideos(playlistId: string, max = 200): Promise<Video[]> {
  const out: Video[] = [];
  let page: string | undefined;
  do {
    const r = await get<ItemsPage<{ snippet: { title: string; thumbnails: Thumbs; resourceId: { videoId: string } };
                                     contentDetails: { videoPublishedAt?: string }; status?: { privacyStatus: string } }>>(
      "playlistItems", { part: "snippet,contentDetails,status", playlistId, maxResults: "50", ...(page ? { pageToken: page } : {}) });
    for (const it of r.items) {
      if (it.status && it.status.privacyStatus !== "public") continue;   // private or deleted videos
      const t = it.snippet.thumbnails;
      out.push({
        id: it.snippet.resourceId.videoId,
        title: it.snippet.title,
        published: it.contentDetails.videoPublishedAt ?? "",
        thumb: (t.maxres ?? t.high ?? t.medium ?? t.default)?.url ?? `https://i.ytimg.com/vi/${it.snippet.resourceId.videoId}/hqdefault.jpg`,
      });
    }
    page = r.nextPageToken;
  } while (page && out.length < max);
  return out.slice(0, max);
}

/** Channel, its sections and their videos; null when no API key is set. */
export async function teamVideos(): Promise<YouTubeData | null> {
  if (!env("YOUTUBE_API_KEY")) return null;
  const ch = await get<ItemsPage<{ id: string; snippet: { title: string; thumbnails: Thumbs };
                                   statistics: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount: string };
                                   contentDetails: { relatedPlaylists: { uploads: string } } }>>(
    "channels", { part: "snippet,statistics,contentDetails", forHandle: CHANNEL_HANDLE });
  const c = ch.items[0];
  if (!c) throw new Error(`YouTube channel @${CHANNEL_HANDLE} not found`);
  const channel: Channel = {
    id: c.id, title: c.snippet.title,
    avatar: (c.snippet.thumbnails.high ?? c.snippet.thumbnails.medium ?? c.snippet.thumbnails.default)?.url ?? "",
    subscribers: c.statistics.hiddenSubscriberCount ? null : Number(c.statistics.subscriberCount ?? 0),
    videos: Number(c.statistics.videoCount), uploads: c.contentDetails.relatedPlaylists.uploads,
  };

  const lists = await get<ItemsPage<{ id: string; snippet: { title: string } }>>(
    "playlists", { part: "snippet", channelId: c.id, maxResults: "50" });
  const sections = await Promise.all(SECTIONS.map(async (s) => {
    const pl = lists.items.find((p) => s.match.test(p.snippet.title));
    return { key: s.key, title: s.title, playlist: pl?.id ?? null, videos: pl ? await playlistVideos(pl.id) : [] };
  }));
  const unsorted = sections.every((s) => !s.playlist) ? await playlistVideos(channel.uploads, 30) : null;
  return { channel, sections, unsorted };
}
