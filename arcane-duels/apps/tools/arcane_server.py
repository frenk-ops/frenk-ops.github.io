#!/usr/bin/env python3
"""Local Arcane Duels server that exits after the last game tab closes."""

from __future__ import annotations

import argparse
import json
import threading
import time
import urllib.parse
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HEARTBEAT_TTL = 8.0
EMPTY_GRACE = 4.0
STARTUP_GRACE = 180.0
CONTROL_PREFIX = "/__arcane_duels__/"


class ArcaneServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, handler):
        super().__init__(address, handler)
        self.clients: dict[str, float] = {}
        self.clients_lock = threading.Lock()
        self.started_at = time.monotonic()
        self.seen_client = False
        self.empty_since: float | None = None

    def touch(self, client_id: str) -> None:
        if not client_id:
            return
        with self.clients_lock:
            self.clients[client_id] = time.monotonic()
            self.seen_client = True
            self.empty_since = None

    def close_client(self, client_id: str) -> None:
        with self.clients_lock:
            self.clients.pop(client_id, None)

    def active_clients(self) -> int:
        now = time.monotonic()
        with self.clients_lock:
            expired = [key for key, seen in self.clients.items() if now - seen > HEARTBEAT_TTL]
            for key in expired:
                self.clients.pop(key, None)
            return len(self.clients)


class ArcaneHandler(SimpleHTTPRequestHandler):
    server: ArcaneServer

    def _control_request(self) -> tuple[str, str] | None:
        parsed = urllib.parse.urlsplit(self.path)
        if not parsed.path.startswith(CONTROL_PREFIX):
            return None
        client_id = urllib.parse.parse_qs(parsed.query).get("client", [""])[0][:128]
        return parsed.path.removeprefix(CONTROL_PREFIX), client_id

    def _control_response(self, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        control = self._control_request()
        if not control:
            return super().do_GET()
        action, client_id = control
        if action == "heartbeat":
            self.server.touch(client_id)
            return self._control_response({"ok": True, "clients": self.server.active_clients()})
        self.send_error(404)

    def do_POST(self):
        control = self._control_request()
        if not control:
            return self.send_error(404)
        action, client_id = control
        if action == "close":
            self.server.close_client(client_id)
            return self._control_response({"ok": True})
        self.send_error(404)

    def log_message(self, fmt, *args):
        if not self.path.startswith(CONTROL_PREFIX):
            super().log_message(fmt, *args)


def monitor(server: ArcaneServer) -> None:
    while True:
        time.sleep(1.0)
        now = time.monotonic()
        active = server.active_clients()
        if active:
            server.empty_since = None
            continue
        if not server.seen_client and now - server.started_at < STARTUP_GRACE:
            continue
        if server.empty_since is None:
            server.empty_since = now
            continue
        if now - server.empty_since >= EMPTY_GRACE:
            print("Ultima scheda chiusa: arresto del server Arcane Duels.", flush=True)
            server.shutdown()
            return


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()

    app_dir = Path(__file__).resolve().parent.parent
    handler = lambda *handler_args, **kwargs: ArcaneHandler(  # noqa: E731
        *handler_args, directory=str(app_dir), **kwargs
    )
    server = ArcaneServer(("127.0.0.1", args.port), handler)
    threading.Thread(target=monitor, args=(server,), daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/"
    print(f"Arcane Duels disponibile su {url}", flush=True)
    print("Il server si chiuderà automaticamente dopo l'ultima scheda.", flush=True)
    if args.open:
        threading.Timer(0.35, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
