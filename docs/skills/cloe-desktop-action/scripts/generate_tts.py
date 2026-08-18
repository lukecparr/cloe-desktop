#!/usr/bin/env python3
"""
MOSI TTS audio generation script

Reads config from ~/.cloe/tts-config.json and generates an MP3 audio file.
Outputs to the ~/.cloe/audio_cache/ directory.

Usage:
  python3 generate_tts.py --text "what to say"
  python3 generate_tts.py --text "what to say" --output /tmp/custom.mp3
  python3 generate_tts.py --text "what to say" --speak  # auto-trigger desktop speak after generation

Output: prints the generated MP3 file path (convenient for the caller to capture via stdout)
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request


CONFIG_PATH = os.path.expanduser("~/.cloe/tts-config.json")
AUDIO_CACHE = os.path.expanduser("~/.cloe/audio_cache")
BRIDGE_URL = "http://localhost:19851"


def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)


def generate_mosi(text, api_key, voice_id, url):
    """Call the MOSI cloud TTS service, returning WAV byte data"""
    payload = json.dumps({
        "model": "moss-tts",
        "text": text,
        "voice_id": voice_id,
        "sampling_params": {"temperature": 1.7, "top_p": 0.8, "top_k": 25},
    }).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())

    audio_b64 = result.get("audio_data")
    if not audio_b64:
        raise RuntimeError(f"MOSI response missing audio_data: {list(result.keys())}")

    return base64.b64decode(audio_b64)


def generate_cosyvoice(text, api_key, model, voice):
    """Call Alibaba Cloud CosyVoice TTS, returning MP3 byte data"""
    import urllib.request

    payload = json.dumps({
        "model": model,
        "input": {"text": text},
        "parameters": {"voice": voice},
    }).encode()

    req = urllib.request.Request(
        "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "false",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())

    # CosyVoice returns an audio URL, which needs to be downloaded
    audio_url = result.get("output", {}).get("audio_url")
    if not audio_url:
        raise RuntimeError(f"CosyVoice response missing audio_url: {result}")

    with urllib.request.urlopen(audio_url, timeout=30) as audio_resp:
        return audio_resp.read()


def wav_to_mp3(wav_path, mp3_path):
    """Convert WAV to MP3 (Electron's new Audio() plays WAV incompletely, so
    conversion is required)

    Must use CBR + a standard sample rate (44100Hz): Chromium under-buffers
    low-sample-rate VBR MP3 (e.g. the MPEG 2.0 Layer III produced from the
    24000Hz WAV that MOSI returns), causing it to cut off at around 10s.
    CBR 128kbps + 44100Hz plays reliably at any duration.
    """
    subprocess.run([
        "ffmpeg", "-y", "-i", wav_path,
        "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        mp3_path,
    ], check=True, capture_output=True)
    return mp3_path


def trigger_speak(mp3_filename):
    """Trigger the desktop app's speak action to play the audio"""
    import urllib.request

    payload = json.dumps({
        "action": "speak",
        "audio_url": f"{BRIDGE_URL}/tts/{mp3_filename}",
    }).encode()

    req = urllib.request.Request(
        f"{BRIDGE_URL}/action",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def main():
    parser = argparse.ArgumentParser(description="MOSI TTS audio generation")
    parser.add_argument("--text", required=True, help="Text to synthesize")
    parser.add_argument("--output", default=None, help="Output MP3 path (default ~/.cloe/audio_cache/tts_<timestamp>.mp3)")
    parser.add_argument("--speak", action="store_true", help="Auto-trigger desktop speak playback after generation")
    parser.add_argument("--provider", default=None, help="Force a specific provider (mosi/cosyvoice); defaults to reading from config")
    args = parser.parse_args()

    config = load_config()
    provider = args.provider or config.get("provider", "mosi")
    os.makedirs(AUDIO_CACHE, exist_ok=True)

    ts = int(time.time())
    if args.output:
        mp3_path = args.output
    else:
        mp3_path = os.path.join(AUDIO_CACHE, f"tts_{ts}.mp3")

    if provider == "mosi":
        cfg = config["mosi"]
        print(f"[INFO] Generating MOSI TTS...", file=sys.stderr)
        wav_bytes = generate_mosi(args.text, cfg["api_key"], cfg["voice_id"], cfg["url"])
        # Save the temporary WAV
        wav_path = mp3_path + ".wav"
        with open(wav_path, "wb") as f:
            f.write(wav_bytes)
        print(f"[INFO] WAV: {wav_path} ({len(wav_bytes)} bytes)", file=sys.stderr)
        # Convert to MP3
        wav_to_mp3(wav_path, mp3_path)
        os.remove(wav_path)
    elif provider == "cosyvoice":
        cfg = config["cosyvoice"]
        api_key = os.environ.get(cfg["api_key_env"])
        if not api_key:
            raise ValueError(f"Environment variable {cfg['api_key_env']} is not set")
        print(f"[INFO] Generating CosyVoice TTS...", file=sys.stderr)
        mp3_bytes = generate_cosyvoice(args.text, api_key, cfg["model"], cfg["voice"])
        with open(mp3_path, "wb") as f:
            f.write(mp3_bytes)
    else:
        raise ValueError(f"Unknown provider: {provider}")

    size = os.path.getsize(mp3_path)
    print(f"[OK] MP3: {mp3_path} ({size} bytes)", file=sys.stderr)

    if args.speak:
        filename = os.path.basename(mp3_path)
        result = trigger_speak(filename)
        print(f"[OK] speak triggered: {result}", file=sys.stderr)

    # stdout only outputs the path, convenient for the caller to capture
    print(mp3_path)


if __name__ == "__main__":
    main()
