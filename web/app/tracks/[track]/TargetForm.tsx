"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Admins: set or clear the target lap time of a track and car.
export default function TargetForm({ track, car, current }: { track: string; car: string; current: string }) {
  const router = useRouter();
  const [time, setTime] = useState(current);
  const [error, setError] = useState<string | null>(null);

  async function save(value: string | null) {
    setError(null);
    const res = await fetch("/api/targets", {
      method: "POST",
      body: JSON.stringify({ track, car, time: value }),
    });
    if (!res.ok) setError((await res.json()).error ?? "error");
    else {
      if (value === null) setTime("");
      router.refresh();
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="1:24.500"
             className="input w-28 py-1" />
      <button onClick={() => save(time.trim() || null)} className="btn btn-primary px-2.5 py-1 text-xs">
        Set target
      </button>
      {current && <button onClick={() => save(null)} className="text-xs text-zinc-500 hover:text-white">clear</button>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
