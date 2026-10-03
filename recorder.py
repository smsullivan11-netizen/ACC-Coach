"""
ACC recorder: records the game's shared memory while you drive, one .accrec file per session.

Usage: python recorder.py [--out recordings] [--poll-ms 0.5]
Start it before or after ACC and leave it running; stop it with Ctrl+C.

Every physics packet the game publishes (400 Hz since ACC v1.8) and every graphics frame is
recorded as raw bytes. Packets the recorder missed are counted (gaps in packetId) and reported.
Nothing is recorded in menus or replays.
"""
import argparse
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import acc_shm as shm
import accrec

G = shm.Graphics


def _int(raw: bytes, field) -> int:
    return int.from_bytes(raw[field.offset:field.offset + 4], "little", signed=True)


def _slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", s).strip("_") or "unknown"


class Recorder:
    def __init__(self, out_dir="recordings", prefix: str = shm.DEFAULT_PREFIX, poll_s: float = 0.0005,
                 stale_s: float = 5.0, chunk_s: float = 1.0, log=print):
        self.out_dir = Path(out_dir)
        self.prefix, self.poll_s, self.stale_s, self.chunk_s = prefix, poll_s, stale_s, chunk_s
        self.log = log
        self.files = []          # summaries of finished recordings
        self.writer = None
        self._closing = []       # threads closing finished files

    # --- Session files ------------------------------------------------------------

    def _start(self, mem: shm.SharedMemory, key: tuple, now_ns: int):
        static_raw = mem.snapshot("static")
        st = shm.decode("static", static_raw)
        track, car = shm.text(st["track"]), shm.text(st["carModel"])
        session = shm.SESSION_TYPES.get(key[2], str(key[2]))
        started = datetime.now()
        self.out_dir.mkdir(parents=True, exist_ok=True)
        path = self.out_dir / f"{started:%Y%m%d-%H%M%S}_{_slug(track)}_{_slug(car)}_{session}.accrec"
        info = {
            "created_at": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "local_time": started.isoformat(timespec="milliseconds"),
            "recorder": {"poll_s": self.poll_s, "shm_prefix": self.prefix},
            "session": {"track": track, "car": car, "type": session, "index": key[3],
                        "player": " ".join(x for x in (shm.text(st["playerName"]),
                                                       shm.text(st["playerSurname"])) if x),
                        "online": bool(st["isOnline"])},
        }
        self.writer = accrec.Writer(path, static_raw, info)
        self.key, self.t0 = key, now_ns
        self.last_physics, self.missed = None, 0
        self.log(f"Recording {path.name}")

    def _finish(self):
        """Ends the current file. Closing (last compression and write) happens in the background so
        the polling loop does not lose packets at a session change."""
        if not self.writer:
            return
        w, missed = self.writer, self.missed
        seconds = (time.perf_counter_ns() - self.t0) / 1e9
        summary = {"path": str(w.path), "seconds": seconds, "physics": w.counts["physics"],
                   "graphics": w.counts["graphics"], "missed": missed}
        self.files.append(summary)
        self.writer = None

        def close():
            w.close()
            summary["bytes"] = w.path.stat().st_size
            total = w.counts["physics"] + missed
            self.log(f"Saved {w.path.name}: {seconds / 60:.1f} min, {w.counts['physics']} physics packets "
                     f"({100 * missed / max(total, 1):.2f} % missed), {w.counts['graphics']} graphics frames, "
                     f"{summary['bytes'] / 1e6:.1f} MB")

        thread = threading.Thread(target=close)
        thread.start()
        self._closing.append(thread)

    # --- Main loop ------------------------------------------------------------------

    def run(self, stop: threading.Event | None = None):
        stop = stop or threading.Event()
        mem = shm.SharedMemory(self.prefix)
        last_graphics = last_change = None
        status = shm.STATUS_OFF
        waiting_logged = False
        last_flush = last_report = time.perf_counter_ns()
        report = {"physics": 0, "graphics": 0}
        try:
            while not stop.is_set():
                if not mem.open():
                    if not waiting_logged:
                        self.log("Waiting for ACC...")
                        waiting_logged = True
                    stop.wait(1.0)
                    continue
                waiting_logged = False
                now = time.perf_counter_ns()

                g_id = mem.packet_id("graphics")
                g_raw = None
                if g_id != last_graphics:
                    g_raw = mem.snapshot("graphics")
                    last_graphics, last_change = g_id, now
                    status = _int(g_raw, G.status)
                elif now - last_change > self.stale_s * 1e9:
                    # No new frame for a while: game closed or loading. Release the pages so
                    # that a restarted game gets fresh ones.
                    self._finish()
                    mem.close()
                    last_graphics = None
                    status = shm.STATUS_OFF
                    stop.wait(1.0)
                    continue

                if status not in (shm.STATUS_LIVE, shm.STATUS_PAUSE):
                    self._finish()        # menu or replay: nothing to record
                    stop.wait(0.01)
                    continue

                if g_raw is not None:
                    # New file when a session starts or changes (practice → qualifying…); the track
                    # and car can only change through the menus, which already end the file.
                    session = (_int(g_raw, G.session), _int(g_raw, G.sessionIndex))
                    if self.writer is None or session != self.key[2:]:
                        st = shm.decode("static", mem.snapshot("static"))
                        self._finish()
                        self._start(mem, (shm.text(st["track"]), shm.text(st["carModel"]), *session), now)
                    self.writer.add("graphics", now - self.t0, g_raw)
                    report["graphics"] += 1

                if self.writer is not None:
                    p_id = mem.packet_id("physics")
                    if p_id != self.last_physics:
                        raw = mem.snapshot("physics")
                        p_id = int.from_bytes(raw[:4], "little", signed=True)
                        if self.last_physics is not None and p_id > self.last_physics + 1:
                            self.missed += p_id - self.last_physics - 1
                        self.last_physics = p_id
                        self.writer.add("physics", time.perf_counter_ns() - self.t0, raw)
                        report["physics"] += 1

                    if now - last_flush > self.chunk_s * 1e9:
                        self.writer.flush()
                        last_flush = now
                    if now - last_report > 1e9:
                        secs = (now - last_report) / 1e9
                        self.log(f"  {shm.STATUS[status]:5s} physics {report['physics'] / secs:4.0f} Hz, "
                                 f"graphics {report['graphics'] / secs:4.0f} Hz, missed {self.missed}, "
                                 f"{self.writer.bytes_written / 1e6:6.1f} MB", end="\r")
                        report = {"physics": 0, "graphics": 0}
                        last_report = now
                time.sleep(self.poll_s)
        finally:
            self._finish()
            mem.close()
            for thread in self._closing:
                thread.join()
        return self.files


def main():
    p = argparse.ArgumentParser(description="Record ACC telemetry from the game's shared memory")
    p.add_argument("--out", default="recordings", help="output folder (default: recordings)")
    p.add_argument("--poll-ms", type=float, default=0.5, help="polling interval in ms (default: 0.5)")
    p.add_argument("--shm-prefix", default=shm.DEFAULT_PREFIX, help=argparse.SUPPRESS)  # tests only
    args = p.parse_args()

    def log(msg, end="\n"):
        print(f"{msg:<100}", end=end, flush=True)

    rec = Recorder(args.out, args.shm_prefix, args.poll_ms / 1000, log=log)
    try:
        rec.run()
    except KeyboardInterrupt:
        pass    # run() saved the current file on the way out
    print()


if __name__ == "__main__":
    main()
