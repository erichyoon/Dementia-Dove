#!/usr/bin/env python3
"""Bake ElevenLabs pcm_24000 clips into C headers. Key from env only."""
import os
import sys
import json
import urllib.request

VOICE_ID = "EXAVITQu4vr4xnSDxMaL"
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

CLIPS = [
    ("scan", "Scan this code with the app to begin the exam."),
    ("welcome", "Welcome to the exam. We will complete six speaking tasks, in order."),
    ("t0", "First, ten seconds of room tone. Please stay quiet. Examiner, tap Start, then Done."),
    ("t1", "Now sustain the vowel ahh. You will have three attempts. Examiner, mark each one valid or invalid."),
    ("t2", "Please read the sentence on the card out loud, clearly."),
    ("t3", "Please describe the picture in front of you. Say what you see."),
    ("t4", "Name as many animals as you can. You have sixty seconds."),
    ("t5", "Tell a short story from your day. You have sixty seconds."),
    ("done", "The exam is complete. Thank you."),
]


def write_header(name, data):
    path = os.path.join(OUT_DIR, f"voice_{name}_pcm.h")
    with open(path, "w") as handle:
        handle.write("#pragma once\n#include <stdint.h>\n\n")
        handle.write(f"static const unsigned voice_{name}_pcm_len = {len(data)};\n")
        handle.write(f"static const uint8_t voice_{name}_pcm[] = {{\n")
        for i in range(0, len(data), 16):
            chunk = data[i : i + 16]
            handle.write("  " + ", ".join(f"0x{b:02x}" for b in chunk) + ",\n")
        handle.write("};\n")
    print(f"wrote {path} ({len(data)} bytes, {len(data)/48000:.1f}s)")


def fetch_pcm(api_key, text):
    url = (
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
        "?output_format=pcm_24000"
    )
    body = json.dumps(
        {
            "text": text,
            "model_id": "eleven_turbo_v2_5",
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.75},
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/octet-stream",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def main():
    api_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        print("ELEVENLABS_API_KEY is required", file=sys.stderr)
        return 1
    for name, text in CLIPS:
        data = fetch_pcm(api_key, text)
        if len(data) < 1000:
            print(f"clip {name} too small: {data[:200]!r}", file=sys.stderr)
            return 1
        write_header(name, data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
