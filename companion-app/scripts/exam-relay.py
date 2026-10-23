#!/usr/bin/env python3
"""USB serial + exam cloud: start exam, capture SESSION_JSON, store sessions."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import glob
import json
import os
import sys
import termios
import threading
import time

PORT = 3847
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CLOUD_PATH = os.path.join(ROOT, "cloud", "sessions.json")

_serial_lock = threading.Lock()
_serial_fd = None
_serial_path = None


def find_port():
    ports = sorted(
        glob.glob("/dev/cu.usbmodem*")
        + glob.glob("/dev/cu.wchusbserial*")
        + glob.glob("/dev/cu.SLAB_USBtoUART*")
    )
    return ports[0] if ports else None


def _configure_tty(fd):
    attrs = termios.tcgetattr(fd)
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
    if hasattr(termios, "HUPCL"):
        attrs[2] &= ~termios.HUPCL
    attrs[3] = 0
    attrs[4] = termios.B115200
    attrs[5] = termios.B115200
    termios.tcsetattr(fd, termios.TCSANOW, attrs)


def _close_serial():
    global _serial_fd, _serial_path
    if _serial_fd is not None:
        try:
            os.close(_serial_fd)
        except OSError:
            pass
    _serial_fd = None
    _serial_path = None


def ensure_serial():
    global _serial_fd, _serial_path
    port = find_port()
    if not port:
        _close_serial()
        return None
    if _serial_fd is not None and _serial_path == port:
        return _serial_fd
    _close_serial()
    fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    _configure_tty(fd)
    _serial_fd = fd
    _serial_path = port
    print(f"[relay] serial open {port} (held open, no DTR drop)")
    return fd


def load_cloud():
    os.makedirs(os.path.dirname(CLOUD_PATH), exist_ok=True)
    if not os.path.exists(CLOUD_PATH):
        data = {"deviceId": "ESP32-8F24", "examType": "Tap Speed Exam", "sessions": []}
        with open(CLOUD_PATH, "w") as handle:
            json.dump(data, handle, indent=2)
        return data
    with open(CLOUD_PATH, "r") as handle:
        return json.load(handle)


def save_cloud(data):
    with open(CLOUD_PATH, "w") as handle:
        json.dump(data, handle, indent=2)


def upsert_session(session):
    data = load_cloud()
    sessions = data.get("sessions") or []
    sid = session.get("id")
    sessions = [row for row in sessions if row.get("id") != sid]
    sessions.insert(0, session)
    data["sessions"] = sessions[:50]
    save_cloud(data)
    print(f"[cloud] stored {sid}")
    return data


def send_start_exam():
    with _serial_lock:
        fd = ensure_serial()
        if fd is None:
            print("[relay] no ESP32 serial port found")
            return False
        try:
            os.write(fd, b"START_EXAM\nSTART_EXAM\n")
            print(f"[relay] START_EXAM -> {_serial_path}")
            return True
        except OSError as err:
            print(f"[relay] serial write failed: {err}")
            _close_serial()
            return False


def serial_reader():
    buf = b""
    while True:
        with _serial_lock:
            fd = ensure_serial()
        if fd is None:
            time.sleep(1)
            continue
        try:
            chunk = os.read(fd, 1024)
        except BlockingIOError:
            time.sleep(0.05)
            continue
        except OSError:
            with _serial_lock:
                _close_serial()
            time.sleep(0.5)
            continue
        if not chunk:
            time.sleep(0.05)
            continue
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            text = line.decode("utf-8", "ignore").strip()
            if text.startswith("SESSION_JSON:"):
                raw = text[len("SESSION_JSON:") :]
                try:
                    upsert_session(json.loads(raw))
                except json.JSONDecodeError as err:
                    print(f"[cloud] bad JSON: {err}")
            elif "START_EXAM" in text or "EXAMINATION" in text or "[VOICE]" in text:
                print(f"[relay] {text}")


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def _send(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/cloud/sessions", "/sessions"):
            self._send(200, load_cloud())
            return
        ok = send_start_exam()
        self._send(200 if ok else 503, {"status": "started" if ok else "no-serial"})

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        if path in ("/cloud/sessions", "/sessions"):
            try:
                session = json.loads(raw.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                self._send(400, {"error": "invalid json"})
                return
            self._send(200, upsert_session(session))
            return
        ok = send_start_exam()
        self._send(200 if ok else 503, {"status": "started" if ok else "no-serial"})

    def log_message(self, fmt, *args):
        sys.stdout.write("[relay] " + (fmt % args) + "\n")


if __name__ == "__main__":
    os.makedirs(os.path.dirname(CLOUD_PATH), exist_ok=True)
    threading.Thread(target=serial_reader, daemon=True).start()
    print(f"[relay] cloud {CLOUD_PATH}")
    print(f"[relay] listening on 0.0.0.0:{PORT}  serial={find_port() or 'none'}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
