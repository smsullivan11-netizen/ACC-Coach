"""
ACC Coach desktop app: records ACC sessions in the background and uploads them to the team site.

Tray icon next to the clock, starts with Windows. Its files:
  %APPDATA%\\ACC Coach\\config.json          site address, upload token, driver name
  %APPDATA%\\ACC Coach\\tracks\\               team corner maps (downloaded from the site)
  %LOCALAPPDATA%\\ACC Coach\\recordings\\      .accrec files, deleted after 30 days once handled
  %LOCALAPPDATA%\\ACC Coach\\uploads.json      what happened to each recording
  %LOCALAPPDATA%\\ACC Coach\\acc-coach.log
Microsoft Store version (MSIX package): the same files in the package's own folders
(%LOCALAPPDATA%\\Packages\\<package>\\LocalState and LocalCache, deleted on uninstall); Windows
starts it at sign-in (startup task in the package manifest) and the Store updates it.

Development: python agent/acc_coach_app.py [--site http://localhost:3000] [--no-tray]
"""
import argparse
import ctypes
import http.server
import json
import logging
import logging.handlers
import os
import queue
import secrets
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # project modules (development)
import acc_shm as shm
import corners as cn
import upload
from engineer_server import LiveEngineer
from recorder import Recorder
from version import __version__

APP = "ACC Coach"
DEFAULT_SITE = "https://acc-coach.vercel.app"
KEEP_DAYS = 30
RETRY_S = 600                       # pending uploads (offline, not linked) are retried every 10 min
FINAL = {"uploaded", "no_laps", "duplicate", "refused", "error"}   # not retried (errors are bugs to fix)
log = logging.getLogger("acc-coach")


def frozen() -> bool:
    return getattr(sys, "frozen", False)


def package_family() -> str | None:
    """Package family name when running as the Microsoft Store app (MSIX), else None."""
    kernel32 = ctypes.WinDLL("kernel32")
    n = ctypes.c_uint32(0)
    if kernel32.GetCurrentPackageFamilyName(ctypes.byref(n), None) != 122:   # 15700: not packaged
        return None
    buf = ctypes.create_unicode_buffer(n.value)
    return buf.value if kernel32.GetCurrentPackageFamilyName(ctypes.byref(n), buf) == 0 else None


PACKAGE = package_family()


def app_dirs() -> tuple[Path, Path]:
    """(settings folder, data folder). ACC_COACH_HOME puts both in one folder (tests)."""
    if os.environ.get("ACC_COACH_HOME"):
        roaming = local = Path(os.environ["ACC_COACH_HOME"])
    elif PACKAGE:
        # The package's own folders, by their real path: Windows would redirect %APPDATA% writes
        # there anyway, but Explorer ("Open recordings folder") only sees real paths
        base = Path(os.environ["LOCALAPPDATA"]) / "Packages" / PACKAGE
        roaming, local = base / "LocalState", base / "LocalCache"
    else:
        roaming = Path(os.environ.get("APPDATA", Path.home())) / APP
        local = Path(os.environ.get("LOCALAPPDATA", Path.home())) / APP
    roaming.mkdir(parents=True, exist_ok=True)
    local.mkdir(parents=True, exist_ok=True)
    return roaming, local


class JsonFile:
    """A small dict saved as JSON on every change (written atomically)."""

    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        try:
            self.data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.data = {}

    def get(self, key, default=None):
        with self.lock:
            return self.data.get(key, default)

    def set(self, key, value):
        with self.lock:
            self.data[key] = value
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, indent=1), encoding="utf-8")
            os.replace(tmp, self.path)


# --- Windows integration ------------------------------------------------------------

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"


def autostart_enabled() -> bool:
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
            winreg.QueryValueEx(k, APP)
            return True
    except OSError:
        return False


def set_autostart(on: bool):
    """Start with Windows (current user only). Only for the installed app, not the dev script;
    the Store app has a startup task instead (switched in Windows settings)."""
    import winreg
    if not frozen() or PACKAGE:
        return
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
        if on:
            winreg.SetValueEx(k, APP, 0, winreg.REG_SZ, f'"{sys.executable}"')
        else:
            try:
                winreg.DeleteValue(k, APP)
            except OSError:
                pass


def single_instance() -> bool:
    """False if ACC Coach is already running (the installer uses the same mutex name)."""
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.restype = ctypes.c_void_p
    single_instance.handle = kernel32.CreateMutexW(None, False, "ACCCoachAgent")
    return ctypes.get_last_error() != 183          # ERROR_ALREADY_EXISTS


# --- The app's work -------------------------------------------------------------------

class Agent:
    def __init__(self, site: str | None = None, shm_prefix: str = shm.DEFAULT_PREFIX, notify=None):
        roaming, local = app_dirs()
        self.config = JsonFile(roaming / "config.json")
        if site:
            self.config.set("site", site)
        self.site = (self.config.get("site") or DEFAULT_SITE).rstrip("/")
        self.uploads = JsonFile(local / "uploads.json")
        self.rec_dir = local / "recordings"
        cn.TRACKS_DIR = roaming / "tracks"
        self.notify = notify or (lambda title, message: log.info("%s: %s", title, message))
        self.stop = threading.Event()
        self.queue = queue.Queue()
        self.busy = False
        self.last_result = ""
        self.update_url = None
        self.recorder = Recorder(self.rec_dir, shm_prefix, log=lambda m, end="\n": log.debug(m.strip()),
                                 on_file=lambda summary: self.queue.put(Path(summary["path"])))
        self._link_server = None
        # Live race engineer page (engineer_server.py), on this PC or shared on the local network
        self.engineer = LiveEngineer(ASSETS / "engineer.html", self.config.get("engineer") or {},
                                     lambda s: self.config.set("engineer", s), shm_prefix)

    # Status for the tray menu
    def linked(self) -> bool:
        return bool(self.config.get("token"))

    def status_line(self) -> str:
        r = self.recorder
        if self.busy:
            return "Uploading a session…"
        if r.state == "recording" and r.session:
            return f"Recording: {r.session['track'].replace('_', ' ').title()}"
        if r.state == "menu":
            return "ACC is open, waiting for a session"
        return "Waiting for ACC"

    def pending(self) -> list[Path]:
        """Finished recordings not handled yet. The file being recorded (or closed: touched in the
        last minute) is left alone, or half a session would be uploaded."""
        done = {k for k, v in self.uploads.data.items() if v.get("status") in FINAL}
        writer = self.recorder.writer
        current = writer.path.name if writer else None
        recent = time.time() - 60
        return sorted(p for p in self.rec_dir.glob("*.accrec")
                      if p.name not in done and p.name != current and p.stat().st_mtime < recent)

    # Threads
    def start(self):
        for target in (self._record, self._worker, self._housekeeping, self._engineer):
            threading.Thread(target=target, daemon=True).start()
        self.engineer.serve(shared=bool(self.config.get("engineer_shared")))

    def _engineer(self):
        while not self.stop.is_set():
            try:
                self.engineer.run(self.stop)
            except Exception:
                log.exception("race engineer crashed, restarting")
                self.stop.wait(5)

    def share_engineer(self, on: bool):
        self.config.set("engineer_shared", on)
        self.engineer.serve(shared=on)

    def _record(self):
        while not self.stop.is_set():
            try:
                self.recorder.run(self.stop)
            except Exception:
                log.exception("recorder crashed, restarting")
                self.stop.wait(5)

    def _worker(self):
        while not self.stop.is_set():
            try:
                path = self.queue.get(timeout=1)
            except queue.Empty:
                continue
            try:
                self.busy = True
                self.process(path)
            except Exception:                      # never let one bad file stop the app
                log.exception("processing %s failed", path)
                self.uploads.set(path.name, {"status": "error", "at": time.time()})
            finally:
                self.busy = False

    def _housekeeping(self):
        self.check_update()
        self.cleanup()
        while not self.stop.is_set():
            for path in self.pending():
                self.queue.put(path)
            self.stop.wait(RETRY_S)

    def process(self, path: Path):
        if not path.exists():
            return
        if not self.linked():
            self.uploads.set(path.name, {"status": "not_linked", "at": time.time()})
            self.notify(APP, "Session recorded. Link this PC to your account to upload it (right-click the icon).")
            return
        log.info("uploading %s", path.name)
        r = upload.upload_file(path, self.site, self.config.get("token"))
        log.info("%s: %s", path.name, r)
        self.uploads.set(path.name, {**r, "at": time.time()})
        track = r.get("track", "").replace("_", " ").title()
        if r["status"] == "uploaded":
            self.last_result = f"Last upload: {track}, {r['laps']} laps"
            self.notify(APP, f"{track}: {r['laps']} laps uploaded")
        elif r["status"] == "unauthorized":
            self.config.set("token", None)
            self.notify(APP, "This PC is no longer linked to your account: link it again (right-click the icon).")
        elif r["status"] == "refused":
            self.notify(APP, f"The site refused a session: {r['message']}")

    def cleanup(self):
        """Deletes recordings older than KEEP_DAYS once they are handled (uploaded or nothing to upload)."""
        limit = (datetime.now() - timedelta(days=KEEP_DAYS)).timestamp()
        for p in self.rec_dir.glob("*.accrec"):
            state = self.uploads.get(p.name, {})
            if state.get("status") in FINAL and p.stat().st_mtime < limit:
                p.unlink(missing_ok=True)
                log.info("deleted old recording %s", p.name)

    def check_update(self):
        if PACKAGE:                                # the Microsoft Store updates the app
            return
        try:
            with urllib.request.urlopen(f"{self.site}/api/app/latest", timeout=15) as res:
                latest = json.loads(res.read())
        except Exception as e:                     # offline: try again next start
            log.info("update check failed: %s", e)
            return
        version = lambda v: tuple(int(x) for x in v.split("."))
        if version(latest["version"]) > version(__version__):
            self.update_url = latest["url"]
            self.notify(APP, f"Version {latest['version']} is available: right-click the icon to download it.")

    # Linking this PC to a driver's account (browser sign-in with Discord, then back to the app)
    def link(self):
        if self._link_server:
            self._link_server.shutdown()
        state = secrets.token_urlsafe(24)
        agent = self

        class Callback(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                url = urllib.parse.urlparse(self.path)
                q = urllib.parse.parse_qs(url.query)
                ok = url.path == "/callback" and q.get("state", [""])[0] == state and q.get("token")
                if ok:
                    agent.config.set("token", q["token"][0])
                    agent.config.set("driver", q.get("name", [""])[0])
                body = (f"<h2>ACC Coach is linked to {q.get('name', [''])[0]}.</h2><p>You can close this tab.</p>"
                        if ok else "<h2>This link request is not valid.</h2><p>Use the ACC Coach menu again.</p>")
                self.send_response(200 if ok else 400)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(f"<body style='font-family:sans-serif;background:#070707;color:#eee;"
                                 f"text-align:center;padding-top:15vh'>{body}</body>".encode("utf-8"))
                if ok:
                    threading.Thread(target=agent._linked, daemon=True).start()

            def log_message(self, *args):
                pass

        server = http.server.HTTPServer(("127.0.0.1", 0), Callback)
        self._link_server = server
        threading.Thread(target=server.serve_forever, daemon=True).start()
        port = server.server_address[1]
        webbrowser.open(f"{self.site}/link?port={port}&state={state}")
        log.info("link page opened (port %s)", port)
        return port, state

    def _linked(self):
        self._link_server.shutdown()
        self._link_server = None
        self.notify(APP, f"Linked to {self.config.get('driver')}. Your sessions will upload automatically.")
        for path in self.pending():
            self.queue.put(path)


# --- Tray icon -------------------------------------------------------------------------

ASSETS = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent)) / "assets"


def make_icon(size: int = 64, recording: bool = False):
    """Tray icon: the team mascot's helmet (assets/helmet.png), red dot while recording."""
    from PIL import Image, ImageDraw
    img = Image.open(ASSETS / "helmet.png").convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=max(2, size // 6), fill=255)
    img.putalpha(mask)
    d = ImageDraw.Draw(img)
    if recording:
        r = size // 5
        d.ellipse((size - 2 * r - 2, 2, size - 2, 2 * r + 2), fill="#e11d48", outline="#070707", width=max(1, size // 32))
    return img


def run_tray(agent: Agent):
    import pystray
    from pystray import Menu, MenuItem as Item

    images = {False: make_icon(64), True: make_icon(64, recording=True)}
    open_url = lambda path: (lambda: webbrowser.open(f"{agent.site}{path}"))

    def toggle_autostart():
        on = not autostart_enabled()
        set_autostart(on)
        agent.config.set("autostart", on)

    def quit_app(icon):
        agent.stop.set()
        icon.stop()

    menu = Menu(
        Item(lambda _: agent.status_line(), None, enabled=False),
        Item(lambda _: agent.last_result, None, enabled=False, visible=lambda _: bool(agent.last_result)),
        Menu.SEPARATOR,
        Item(lambda _: f"Linked to {agent.config.get('driver')}" if agent.linked() else "Link this PC to my account…",
             lambda: agent.link(), enabled=lambda _: not agent.linked()),
        Item("Race engineer (live)", lambda: webbrowser.open(agent.engineer.url), enabled=lambda _: bool(agent.engineer.port)),
        Item("Share the engineer on my network", lambda: agent.share_engineer(not agent.engineer.shared),
             checked=lambda _: agent.engineer.shared),
        Menu.SEPARATOR,
        Item("Open my sessions", open_url("/sessions"), default=True),
        Item("Leaderboards", open_url("/tracks")),
        Item(lambda _: f"Upload {len(agent.pending())} waiting session(s)",
             lambda: [agent.queue.put(p) for p in agent.pending()],
             visible=lambda _: agent.linked() and bool(agent.pending())),
        Item("Download the new version…", lambda: webbrowser.open(agent.update_url), visible=lambda _: bool(agent.update_url)),
        Menu.SEPARATOR,
        Item("Start with Windows", toggle_autostart, checked=lambda _: autostart_enabled(),
             visible=lambda _: frozen() and not PACKAGE),
        Item("Start with Windows…", lambda: os.startfile("ms-settings:startupapps"), visible=lambda _: bool(PACKAGE)),
        Item("Open recordings folder", lambda: os.startfile(agent.rec_dir) if agent.rec_dir.exists() else None),
        Item(f"About ACC Coach {__version__}", open_url("/download")),
        Item("Quit", quit_app),
    )
    icon = pystray.Icon(APP, images[False], APP, menu)
    agent.notify = lambda title, message: icon.notify(message, title)

    def refresh():                       # status in the tooltip and the icon (red dot while recording)
        while not agent.stop.is_set():
            recording = agent.recorder.state == "recording"
            icon.icon = images[recording]
            icon.title = f"{APP}: {agent.status_line()}"
            agent.stop.wait(2)

    def setup(icon):
        icon.visible = True
        agent.start()
        threading.Thread(target=refresh, daemon=True).start()
        if not agent.linked():
            agent.notify(APP, "Welcome! Sign in on the page that just opened to link this PC to your account.")
            agent.link()

    icon.run(setup=setup)


def main():
    p = argparse.ArgumentParser(description="ACC Coach desktop app")
    p.add_argument("--site", default=None, help=f"team site (default {DEFAULT_SITE})")
    p.add_argument("--no-tray", action="store_true", help="run without the tray icon (development)")
    p.add_argument("--shm-prefix", default=shm.DEFAULT_PREFIX, help=argparse.SUPPRESS)   # tests only
    args = p.parse_args()

    _, local = app_dirs()
    handler = logging.handlers.RotatingFileHandler(local / "acc-coach.log", maxBytes=1_000_000, backupCount=3,
                                                   encoding="utf-8")
    logging.basicConfig(level=logging.INFO, handlers=[handler] + ([] if frozen() else [logging.StreamHandler()]),
                        format="%(asctime)s %(levelname)s %(message)s")
    if not single_instance():
        log.info("already running")
        return
    agent = Agent(args.site, args.shm_prefix)
    log.info("ACC Coach %s started (site %s%s)", __version__, agent.site, f", package {PACKAGE}" if PACKAGE else "")
    if agent.config.get("autostart") is None:          # first run: start with Windows by default
        set_autostart(True)
        agent.config.set("autostart", True)
    if args.no_tray:
        agent.start()
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            agent.stop.set()
    else:
        run_tray(agent)


if __name__ == "__main__":
    main()
