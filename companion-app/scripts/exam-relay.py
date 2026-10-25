#!/usr/bin/env python3
"""USB serial + exam cloud: start exam, capture SESSION_JSON, score the WAV."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import glob
import json
import os
import sys
import termios
import threading
import time
import urllib.error
import urllib.request

PORT = 3847
MODEL_URL = "http://127.0.0.1:5050/api/predict"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CLOUD_PATH = os.path.join(ROOT, "cloud", "sessions.json")
GROUPS_PATH = os.path.join(ROOT, "cloud", "groups.json")
AUDIO_DIR = os.path.join(ROOT, "cloud", "audio")

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


def score_wav(path):
    boundary = "----recallwav"
    filename = os.path.basename(path)
    with open(path, "rb") as handle:
        payload = handle.read()
    body = b"".join([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="audio"; filename="{filename}"\r\n'.encode(),
        b"Content-Type: audio/wav\r\n\r\n",
        payload,
        f"\r\n--{boundary}--\r\n".encode(),
    ])
    request = urllib.request.Request(
        MODEL_URL,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as err:
        print(f"[relay] model unscored: {err}")
        return None


def attach_voice_result(session_id, wav):
    os.makedirs(AUDIO_DIR, exist_ok=True)
    safe_id = "".join(ch for ch in session_id if ch.isalnum() or ch in "-_") or "session"
    path = os.path.join(AUDIO_DIR, f"{safe_id}.wav")
    with open(path, "wb") as handle:
        handle.write(wav)
    print(f"[relay] saved {path} ({len(wav)} bytes)")

    result = score_wav(path)
    data = load_cloud()
    sessions = data.get("sessions") or []
    found = next((row for row in sessions if row.get("id") == session_id), None)
    if found is None:
        found = {"id": session_id}
        sessions.insert(0, found)
    if result is None:
        found["voiceStatus"] = "unscored"
    else:
        found["voiceStatus"] = "truncated" if found.get("audioTruncated") else "scored"
        found["voicePrediction"] = result.get("prediction")
        found["voiceConfidence"] = result.get("confidence")
        found["voiceFeatures"] = result.get("features")
    data["sessions"] = sessions[:50]
    save_cloud(data)
    print(f"[relay] {session_id} voice {found.get('voiceStatus')} {found.get('voicePrediction') or ''}")


def handle_serial_line(text):
    if text.startswith("SESSION_JSON:"):
        raw = text[len("SESSION_JSON:") :]
        try:
            upsert_session(json.loads(raw))
        except json.JSONDecodeError as err:
            print(f"[cloud] bad JSON: {err}")
        return None
    if text.startswith("AUDIO_BEGIN "):
        parts = text.split()
        if len(parts) == 3 and parts[2].isdigit():
            return parts[1], int(parts[2])
        print(f"[relay] bad AUDIO_BEGIN {text}")
        return None
    if "START_EXAM" in text or "EXAMINATION" in text or "[VOICE]" in text or "[RECALL]" in text:
        print(f"[relay] {text}")
    return None


def serial_reader():
    buf = b""
    audio_id = None
    audio_need = 0
    audio_buf = b""
    while True:
        with _serial_lock:
            fd = ensure_serial()
        if fd is None:
            time.sleep(1)
            continue
        try:
            chunk = os.read(fd, 4096)
        except BlockingIOError:
            time.sleep(0.02)
            continue
        except OSError:
            with _serial_lock:
                _close_serial()
            time.sleep(0.5)
            continue
        if not chunk:
            time.sleep(0.02)
            continue
        buf += chunk
        while True:
            if audio_need:
                if len(buf) < audio_need:
                    audio_buf += buf
                    audio_need -= len(buf)
                    buf = b""
                    break
                audio_buf += buf[:audio_need]
                buf = buf[audio_need:]
                attach_voice_result(audio_id, audio_buf)
                audio_id = None
                audio_need = 0
                audio_buf = b""
                continue
            if b"\n" not in buf:
                break
            line, buf = buf.split(b"\n", 1)
            text = line.decode("utf-8", "ignore").strip()
            if not text:
                continue
            begun = handle_serial_line(text)
            if begun:
                audio_id, audio_need = begun
                audio_buf = b""


_groups_lock = threading.Lock()


def load_groups():
    if not os.path.exists(GROUPS_PATH):
        return []
    try:
        with open(GROUPS_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return []
    groups = data.get("groups") if isinstance(data, dict) else None
    return groups if isinstance(groups, list) else []


def save_groups(groups):
    os.makedirs(os.path.dirname(GROUPS_PATH), exist_ok=True)
    with open(GROUPS_PATH, "w", encoding="utf-8") as handle:
        json.dump({"groups": groups}, handle)


def _clean_member(payload):
    member_id = str(payload.get("memberId") or "").strip()[:40]
    name = str(payload.get("memberName") or "Member").strip()[:80] or "Member"
    if not member_id:
        return None
    return {"id": member_id, "name": name}


def mutate_groups(payload):
    action = payload.get("action")
    with _groups_lock:
        groups = load_groups()
        if action == "create":
            member = _clean_member(payload)
            name = str(payload.get("name") or "").strip()[:80]
            if not member or not name:
                return None
            note = str(payload.get("note") or "").strip()[:500]
            mark = str(payload.get("mark") or "").strip()[:16]
            image = str(payload.get("image") or "")
            if not image.startswith("data:image/") or len(image) > 180000:
                image = ""
            groups.append({
                "id": f"grp-{int(time.time() * 1000)}",
                "name": name,
                "note": note,
                "mark": mark,
                "image": image,
                "createdAt": int(time.time() * 1000),
                "createdBy": member["id"],
                "members": [member],
            })
        elif action == "delete":
            member = _clean_member(payload)
            group_id = str(payload.get("groupId") or "")
            group = next((item for item in groups if item.get("id") == group_id), None)
            if not member or not group:
                return None
            members = group.get("members") or []
            creator = group.get("createdBy") or (members[0].get("id") if members else None)
            if creator != member["id"]:
                return None
            groups = [item for item in groups if item.get("id") != group_id]
        elif action in ("join", "leave"):
            member = _clean_member(payload)
            group_id = str(payload.get("groupId") or "")
            group = next((item for item in groups if item.get("id") == group_id), None)
            if not member or not group:
                return None
            members = [item for item in group.get("members", []) if item.get("id") != member["id"]]
            if action == "join":
                members.append(member)
            group["members"] = members
        else:
            return None
        save_groups(groups)
        return groups


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
        if path == "/cloud/groups":
            self._send(200, {"groups": load_groups()})
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
        if path == "/cloud/groups":
            try:
                payload = json.loads(raw.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                self._send(400, {"error": "invalid json"})
                return
            groups = mutate_groups(payload if isinstance(payload, dict) else {})
            if groups is None:
                self._send(400, {"error": "could not update groups"})
                return
            self._send(200, {"groups": groups})
            return
        ok = send_start_exam()
        self._send(200 if ok else 503, {"status": "started" if ok else "no-serial"})

    def log_message(self, fmt, *args):
        sys.stdout.write("[relay] " + (fmt % args) + "\n")


if __name__ == "__main__":
    os.makedirs(os.path.dirname(CLOUD_PATH), exist_ok=True)
    threading.Thread(target=serial_reader, daemon=True).start()
    print(f"[relay] cloud {CLOUD_PATH}")
    print(f"[relay] model {MODEL_URL}")
    print(f"[relay] listening on 0.0.0.0:{PORT}  serial={find_port() or 'none'}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
