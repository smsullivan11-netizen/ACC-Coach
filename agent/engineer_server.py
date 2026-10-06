"""Live race engineer page: a thread reads ACC's shared memory (~20 Hz) into engineer.Engineer, and a
small web server shows its state at http://localhost:8780 (the page polls /state twice a second).
"Share on my network" makes it reachable from a phone, tablet or a teammate's PC on the same Wi-Fi
(read-only: nothing can be changed in the game from the page; only the page's own settings).
"""
import http.server
import json
import socket
import threading
import time
from pathlib import Path

import acc_shm as shm
from engineer import DEFAULT_SETTINGS, Engineer

PORTS = (8780, 8781, 8782)


def lan_address() -> str | None:
    """This PC's address on the local network (a UDP 'connection' sends nothing)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.168.1.1", 9))
            return s.getsockname()[0]
    except OSError:
        return None


class LiveEngineer:
    def __init__(self, page: Path, settings: dict, save_settings, prefix: str = shm.DEFAULT_PREFIX):
        self.engineer = Engineer(settings)
        self.page = page
        self.save_settings = save_settings
        self.prefix = prefix
        self.lock = threading.Lock()
        self.server = None
        self.port = None
        self.shared = False

    # --- reading the game -----------------------------------------------------------------

    def run(self, stop: threading.Event):
        mem = shm.SharedMemory(self.prefix)
        last_id = None
        while not stop.is_set():
            if not mem.open():
                stop.wait(2.0)
                continue
            try:
                g = shm.decode("graphics", mem.snapshot("graphics"))
                if int(g["packetId"]) == last_id:          # game paused, closed or loading
                    stop.wait(0.5)
                    if int(shm.decode("graphics", mem.snapshot("graphics"))["packetId"]) == last_id:
                        mem.close()
                        last_id = None
                    continue
                last_id = int(g["packetId"])
                if int(g["status"]) == shm.STATUS_LIVE:
                    p = shm.decode("physics", mem.snapshot("physics"))
                    st = shm.decode("static", mem.snapshot("static"))
                    with self.lock:
                        self.engineer.feed(time.perf_counter(), p, g, st)
            except (OSError, ValueError):
                mem.close()
                last_id = None
            stop.wait(0.05)

    def state(self) -> dict:
        with self.lock:
            s = self.engineer.state()
        s["share"] = {"on": self.shared, "url": f"http://{lan_address()}:{self.port}" if self.shared and lan_address() else None}
        return s

    def update_settings(self, values: dict):
        clean = {k: float(v) for k, v in values.items() if k in DEFAULT_SETTINGS and isinstance(v, (int, float))}
        with self.lock:
            self.engineer.settings.update(clean)
            settings = dict(self.engineer.settings)
        self.save_settings(settings)

    # --- web page -------------------------------------------------------------------------

    def serve(self, shared: bool = False):
        """(Re)starts the page's server, on this PC only or on the local network too."""
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None
        live = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def _send(self, code: int, body: bytes, kind: str):
                self.send_response(code)
                self.send_header("Content-Type", kind)
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                if self.path in ("/", "/index.html"):
                    self._send(200, live.page.read_bytes(), "text/html; charset=utf-8")
                elif self.path == "/state":
                    self._send(200, json.dumps(live.state(), default=float).encode(), "application/json")
                else:
                    self._send(404, b"not found", "text/plain")

            def do_POST(self):
                if self.path != "/settings":
                    return self._send(404, b"not found", "text/plain")
                try:
                    live.update_settings(json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0)))
                    self._send(200, b'{"ok":true}', "application/json")
                except (ValueError, TypeError):
                    self._send(400, b'{"error":"bad settings"}', "application/json")

            def log_message(self, *args):
                pass

        host = "0.0.0.0" if shared else "127.0.0.1"
        for port in PORTS:
            try:
                self.server = http.server.ThreadingHTTPServer((host, port), Handler)
                self.port, self.shared = port, shared
                break
            except OSError:
                continue
        if self.server:
            threading.Thread(target=self.server.serve_forever, daemon=True).start()

    @property
    def url(self) -> str:
        return f"http://localhost:{self.port}" if self.port else ""
