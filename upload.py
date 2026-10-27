"""
Upload sessions to the team site.

First time (the token comes from the site's Settings page):
  python upload.py --url https://<team site> --token acc_... --save
Then:
  python upload.py                              your latest recording (recordings/*.accrec)
  python upload.py recordings/<file>.accrec …   specific recordings
  python upload.py <session>.ld                 a MoTeC export (.ldx next to it)

Before processing a session, the team's corner map of the track is downloaded from the site, so
every driver's corners match (the site refuses bundles computed with a different map).
"""
import argparse
import gzip
import json
import urllib.error
import urllib.request
from pathlib import Path

import acc_telemetry as acc
import bundle
import corners as cn

CONFIG = Path(__file__).resolve().parent / ".acc_coach.json"     # url + token (not in git)


def request(url: str, token: str, data: bytes | None = None) -> tuple[int, dict]:
    """(HTTP status, JSON body); status 0 when the site cannot be reached."""
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET",
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/gzip"})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {"error": e.reason}
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return 0, {"error": f"site unreachable ({e})"}


def post_json(url: str, token: str, payload: dict, timeout: float = 15) -> tuple[int, dict]:
    """Post a small authenticated JSON message without changing the session upload protocol."""
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {"error": e.reason}
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return 0, {"error": f"site unreachable ({e})"}


def upload_file(path: Path, url: str, token: str) -> dict:
    """Processes a session and uploads it. Returns {status, message, laps?, session_url?, rating?…} with
    status: uploaded, no_laps, duplicate, unauthorized, offline (retry later) or refused."""
    head, laps, ref = acc.load_any(str(path))
    if not laps:
        return {"status": "no_laps", "message": "no complete lap"}
    status, team_map = request(f"{url}/api/corner-maps/{head.venue}", token)
    if status == 0:
        return {"status": "offline", "message": team_map["error"]}
    if status in (401, 403):
        return {"status": "unauthorized", "message": team_map.get("error", "invalid upload token")}
    if status == 200:
        cn.map_path(head.venue).parent.mkdir(parents=True, exist_ok=True)
        cn.map_path(head.venue).write_text(json.dumps(team_map, ensure_ascii=False, indent=1), encoding="utf-8")
    cmap, _ = acc.corner_map_for(head.venue, laps, ref, path.name)
    data = gzip.compress(json.dumps(bundle.build_bundle(str(path), head, laps, ref, cmap),
                                    ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    status, res = request(f"{url}/api/upload", token, data)
    if status == 200:
        return {"status": "uploaded", "laps": res["laps"], "kb": len(data) / 1024, "track": head.venue,
                "session_url": f"{url}/sessions/{res['session_id']}",
                "message": f"{res['laps']} laps uploaded",
                # The driver's rating after this session (site 2026-10-07+; None: no valid lap)
                **{k: res[k] for k in ("rating", "rating_before", "rank", "rank_before") if k in res}}
    if status == 0:
        return {"status": "offline", "message": res["error"]}
    error = res.get("error", f"error {status}")
    return {"status": "duplicate" if "already uploaded" in error else "refused", "message": error}


def upload(path: Path, url: str, token: str) -> bool:
    r = upload_file(path, url, token)
    if r["status"] == "uploaded":
        print(f"{path.name}: {r['message']} ({r['kb']:.0f} KB) → {r['session_url']}")
    elif r["status"] == "unauthorized":
        print(f"Upload refused: {r['message']}. Check your token (site → Settings).")
    else:
        print(f"{path.name}: {r['message']}")
    return r["status"] == "uploaded"


def main():
    p = argparse.ArgumentParser(description="Upload sessions to the team site")
    p.add_argument("files", nargs="*", help=".accrec recordings or .ld MoTeC exports (default: latest recording)")
    p.add_argument("--url", help="team site address, e.g. https://acc-coach.vercel.app")
    p.add_argument("--token", help="upload token from the site's Settings page")
    p.add_argument("--save", action="store_true", help="remember --url and --token on this PC")
    args = p.parse_args()

    saved = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
    url = (args.url or saved.get("url") or "").rstrip("/")
    token = args.token or saved.get("token")
    if not url or not token:
        raise SystemExit("Give --url and --token once (with --save to remember them).")
    if args.save:
        CONFIG.write_text(json.dumps({"url": url, "token": token}), encoding="utf-8")
        print(f"Saved site address and token in {CONFIG.name}")

    files = [Path(f) for f in args.files]
    if not files:
        recordings = sorted(Path("recordings").glob("*.accrec"), key=lambda f: f.stat().st_mtime)
        if not recordings:
            raise SystemExit("No recording found in recordings/.")
        files = recordings[-1:]
    ok = sum(upload(f, url, token) for f in files)
    if len(files) > 1:
        print(f"{ok}/{len(files)} uploaded")


if __name__ == "__main__":
    main()
