"use client";

import { useRouter } from "next/navigation";

// The library's filters: car, track and type; each change reloads the list.
export default function Filters({ cars, tracks, kinds, car, track, kind }: {
  cars: { value: string; label: string }[]; tracks: { value: string; label: string }[]; kinds: { value: string; label: string }[];
  car: string; track: string; kind: string;
}) {
  const router = useRouter();
  const go = (next: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ car, track, kind, ...next })) if (v) q.set(k, v);
    router.push(`/setups${q.size ? `?${q}` : ""}`);
  };
  const select = (label: string, value: string, options: { value: string; label: string }[], key: string) => (
    <select aria-label={label} value={value} onChange={(e) => go({ [key]: e.target.value })} className="input py-1.5">
      <option value="">{label}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {select("All cars", car, cars, "car")}
      {select("All tracks", track, tracks, "track")}
      {select("All types", kind, kinds, "kind")}
      {(car || track || kind) && <button type="button" onClick={() => router.push("/setups")} className="text-xs text-zinc-400 underline hover:text-white">Clear</button>}
    </div>
  );
}
