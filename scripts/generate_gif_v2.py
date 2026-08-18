#!/usr/bin/env python3
"""
cloe-desktop GIF generation script v2

Generates a transparent-background GIF from a reference image in one step,
for desktop widget animations.
Supports green screen and blue screen chromakey, with built-in Python
post-processing to remove color fringing.

Usage:
  # Single generation (green screen by default)
  python3 scripts/generate_gif_v2.py --action working \
    --prompt "She types on the keyboard with both hands" \
    --reference public/gifs/_work_idle/01_green_bg_sitting.png

  # Blue screen mode
  python3 scripts/generate_gif_v2.py --action wave \
    --prompt "She waves happily in greeting" \
    --reference reference_upperbody_bluebg.png \
    --chromakey blue

Arguments:
  --action       Action name, also used as the GIF filename (e.g. working -> working.gif)
  --prompt       Video action description (Chinese)
  --duration     Video duration, default 5 seconds
  --reference    Reference image path (green/blue screen background image)
  --output       GIF output path, default public/gifs/{action}.gif
  --chromakey    Chroma key type: green (default) or blue
  --no-copy      Don't auto-copy to public/gifs/
  --work-dir     Intermediate file directory, default public/gifs/_work_{action}

Pipeline:
  1. Compress the reference image (if > 4MB) to fit the API
  2. wan2.7-i2v generates the video (async polling)
  3. ffmpeg chromakey + palette -> GIF
  4. Python post-processing removes color fringing -> transparent GIF
  5. Copy to public/gifs/
"""

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time

import numpy as np
import requests
from PIL import Image
from scipy import ndimage


def get_env(key):
    val = os.environ.get(key)
    if val:
        return val.strip()
    with open(os.path.expanduser("~/.hermes/.env")) as f:
        for line in f:
            if line.startswith(f"{key}="):
                return line.strip().split("=", 1)[1]
    raise ValueError(f"{key} not found in ~/.hermes/.env")


# Chromakey configuration
CHROMAKEY_CONFIG = {
    "green": {
        "hex": "0x00FF00",
        # HSV/hue range for strong key
        "color_high": 80,      # g > 80
        "diff_r": 30,          # g - r > 30
        "diff_b": 30,          # g - b > 30
        # Edge detection thresholds
        "edge_diff": 3,        # g - max(r,b) > 3
    },
    "blue": {
        "hex": "0x0000FF",
        "color_high": 80,
        "diff_r": 30,
        "diff_b": 30,
        "edge_diff": 3,
    },
}

PROJECT_DIR = os.path.expanduser("~/work/cloe-desktop")


def compress_image(path, max_size_mb=4):
    """If the image is larger than max_size_mb, compress it and scale the long edge to 1920px
    (to keep the character sharp), returning (path, is_temp_file)."""
    size_mb = os.path.getsize(path) / 1024 / 1024
    if size_mb <= max_size_mb:
        return path, False

    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp_path = tmp.name
    tmp.close()

    img = Image.open(path)
    # Scale the long edge to 1920 (the padded image is larger, so higher resolution
    # is needed to keep the character sharp)
    w, h = img.size
    if max(w, h) > 1920:
        ratio = 1920 / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    img.save(tmp_path, "PNG", optimize=True)
    new_size = os.path.getsize(tmp_path) / 1024 / 1024
    print(f"  Compressed: {size_mb:.1f}MB -> {new_size:.1f}MB ({tmp_path})")
    return tmp_path, True


def convert_chroma_color(img_path, from_chroma="green", to_chroma="blue"):
    """Convert the reference image's background chroma color from one color to another
    (e.g. green screen -> blue screen).
    Solves the problem where the reference image is green screen but generation needs
    blue screen (green screen triggers Bailian content moderation).
    Returns the converted image path (temp file).
    """
    if from_chroma == to_chroma:
        return img_path, False

    import numpy as np

    img = Image.open(img_path).convert("RGB")
    arr = np.array(img, dtype=np.uint8)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    if from_chroma == "green":
        # Detect green background: g is clearly greater than r and b
        mask = (g > 80) & (g - r > 30) & (g - b > 30)
        target = np.array([0, 0, 255], dtype=np.uint8)  # pure blue
    else:  # blue -> green
        mask = (b > 80) & (b - r > 30) & (b - g > 30)
        target = np.array([0, 255, 0], dtype=np.uint8)  # pure green

    arr[mask] = target

    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp.close()
    Image.fromarray(arr).save(tmp.name, "PNG", optimize=True)
    converted = int(mask.sum() / 3)
    print(f"  Chroma conversion: {from_chroma}->{to_chroma} ({converted}px replaced)")
    return tmp.name, True


def pad_reference_to_wider(img_path, target_ratio=0.75, chroma="green"):
    """Pad both sides of a portrait reference image with chroma color to make a wider frame,
    leaving room for the character's motion.

    target_ratio: target width/height ratio. 0.75 = 3:4 (much wider than the original 0.52).
    Returns the padded image path (temp file).
    """
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    current_ratio = w / h

    if current_ratio >= target_ratio:
        # Already wide enough, no padding needed
        return img_path, False

    # Compute target width
    target_w = int(h * target_ratio)
    pad_total = target_w - w
    pad_each = pad_total // 2

    # Chroma color
    pad_color = (0, 255, 0) if chroma == "green" else (0, 0, 255)

    # Create a wide canvas and paste the original image centered
    canvas = Image.new("RGB", (target_w, h), pad_color)
    canvas.paste(img, (pad_each, 0))

    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp.close()
    canvas.save(tmp.name, "PNG", optimize=True)

    print(f"  Widened reference image: {w}x{h} -> {target_w}x{h} (padded {pad_each}px {chroma} screen on each side)")
    return tmp.name, True


def generate_video(first_frame_path, prompt, duration=5, action_name="action", chroma="green"):
    """Generate video with wan2.7-i2v, returning the local video path."""
    # If using blue screen but the reference image is green screen, convert the background color first
    conv_temp = None
    if chroma == "blue":
        conv_path, conv_done = convert_chroma_color(first_frame_path, "green", "blue")
        if conv_done:
            first_frame_path = conv_path
            conv_temp = conv_path

    # Widen the reference image first, to leave room for the character's motion
    padded_path, pad_temp = pad_reference_to_wider(first_frame_path, target_ratio=0.75, chroma=chroma)

    compressed_path, is_temp = compress_image(padded_path)

    # Read image into memory first, THEN clean up temp files
    with open(compressed_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    if is_temp:
        os.unlink(compressed_path)
    if pad_temp and os.path.abspath(padded_path) != os.path.abspath(first_frame_path):
        os.unlink(padded_path)
    if conv_temp and os.path.exists(conv_temp):
        os.unlink(conv_temp)

    # Update the prompt to ensure the character stays fully in frame and the background
    # stays a solid color (to keep the model from improvising a different background).
    # NOTE: the strings below are part of the Chinese prompt payload sent to the
    # wan2.7-i2v generation API and must stay in Chinese.
    if pad_temp:
        bg_word = "纯蓝色背景" if chroma == "blue" else "纯绿色背景"
        prompt = prompt.rstrip("。") + f"。{bg_word}。确保人物完整在画面内，不要超出边界。"

    # A green-screen prompt is prone to triggering Bailian moderation; detect and
    # auto-swap the wording before submitting.
    # NOTE: these are substrings matched/replaced within the Chinese prompt payload
    # sent to the API and must stay in Chinese.
    if chroma == "green" and "绿色" in prompt:
        prompt = prompt.replace("纯绿色背景", "纯色单色背景")

    api_key = get_env("BAILIAN_API_KEY")

    media = [{"type": "first_frame", "url": f"data:image/png;base64,{img_b64}"}]
    payload = {
        "model": "wan2.7-i2v",
        "input": {"prompt": prompt, "media": media},
        "parameters": {
            "resolution": "1080P",
            "duration": duration,
            "prompt_extend": False,
            "watermark": False,
        },
    }

    resp = requests.post(
        "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        },
        json=payload,
        timeout=120,
    )

    if resp.status_code != 200:
        print(f"Error submitting task: {resp.text[:500]}")
        sys.exit(1)

    task_id = resp.json()["output"]["task_id"]
    print(f"  Task ID: {task_id}")

    for i in range(60):
        time.sleep(10)
        poll = requests.get(
            f"https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30,
        )
        status = poll.json()["output"]["task_status"]
        if i % 3 == 0 or status in ("SUCCEEDED", "FAILED"):
            print(f"  [{i+1}] {status}")
        if status == "SUCCEEDED":
            video_url = poll.json()["output"]["video_url"]
            video_bytes = requests.get(video_url, timeout=120).content
            return video_bytes
        elif status == "FAILED":
            print(f"FAILED: {poll.json()['output'].get('message')}")
            sys.exit(1)

    print("Timeout waiting for video")
    sys.exit(1)


def video_to_transparent_gif(video_bytes, output_path, action_name="action", chroma="green"):
    """ffmpeg chromakey + Python post-processing to remove color fringing -> transparent GIF."""
    import tempfile

    cfg = CHROMAKEY_CONFIG[chroma]
    ck_hex = cfg["hex"]

    # Write the temp video file
    video_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    video_tmp.write(video_bytes)
    video_tmp.close()

    raw_gif = os.path.join(os.path.dirname(output_path), f"{action_name}_raw.gif")
    palette = os.path.join(os.path.dirname(output_path), f"palette_{action_name}.png")

    # Chromakey parameters: conservative settings (only remove the solid-color background);
    # residual background is cleaned up by Python post-processing.
    # This avoids a high similarity value mistakenly erasing the character's clothing
    # (white clothing gets tinted by the chroma screen lighting).
    ck_sim = "0.15" if chroma == "blue" else "0.08"
    ck_blend = "0.05" if chroma == "blue" else "0.02"

    # Step 1: generate the palette (no chromakey, keep the full color gamut)
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_tmp.name,
            "-vf", f"fps=10,scale=400:-1:flags=lanczos,palettegen=stats_mode=diff",
            palette,
        ],
        capture_output=True,
        timeout=60,
    )

    # Step 2: generate the GIF using the palette (no chromakey, left to Python to handle)
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_tmp.name, "-i", palette,
            "-lavfi", f"[0:v]fps=10,scale=400:-1:flags=lanczos[x];[x][1:v]paletteuse",
            "-loop", "0", raw_gif,
        ],
        capture_output=True,
        timeout=60,
    )

    os.unlink(video_tmp.name)

    # Step 3: Python post-processing to remove color fringing
    img = Image.open(raw_gif)
    frames = []
    durations = []
    try:
        while True:
            frames.append(img.convert("RGBA"))
            durations.append(img.info.get("duration", 100))
            img.seek(img.tell() + 1)
    except EOFError:
        pass

    # Determine the chroma channel index
    if chroma == "green":
        chroma_idx = 1  # G channel
        other_idx = [0, 2]  # R, B
    else:  # blue
        chroma_idx = 2  # B channel
        other_idx = [0, 1]  # R, G

    processed = []
    for frame in frames:
        arr = np.array(frame, dtype=np.float64)
        r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]

        c = arr[:, :, chroma_idx]

        # Strong chroma color -> fully transparent
        if chroma == "green":
            chroma_mask = (g > cfg["color_high"]) & (g - r > cfg["diff_r"]) & (g - b > cfg["diff_b"])
        else:
            chroma_mask = (b > cfg["color_high"]) & (b - r > cfg["diff_r"]) & (b - g > cfg["diff_b"])
        arr[chroma_mask, 3] = 0

        # Edge color-fringe correction (dilation 2)
        alpha_u8 = arr[:, :, 3].astype(np.uint8)
        dilated = ndimage.binary_dilation(alpha_u8 < 128, iterations=2)
        edge_mask = (alpha_u8 >= 128) & dilated

        if chroma == "green":
            green_tint = edge_mask & (g > r) & (g > b) & (g - np.maximum(r, b) > cfg["edge_diff"])
            if green_tint.any():
                target_g = np.maximum(r[green_tint], b[green_tint])
                arr[green_tint, 1] = np.clip(
                    g[green_tint] * 0.4 + target_g * 0.6, 0, 255
                ).astype(np.uint8)
            # Slight correction over a wider range (dilation 3)
            dilated2 = ndimage.binary_dilation(alpha_u8 < 128, iterations=3)
            remaining = (alpha_u8 >= 128) & dilated2 & (g > r + 5) & (g > b + 5)
            if remaining.any():
                arr[remaining, 1] = np.clip(
                    np.minimum(r[remaining], b[remaining]) + 5, 0, 255
                ).astype(np.uint8)
        else:  # blue
            blue_tint = edge_mask & (b > r) & (b > g) & (b - np.maximum(r, g) > cfg["edge_diff"])
            if blue_tint.any():
                target_b = np.maximum(r[blue_tint], g[blue_tint])
                arr[blue_tint, 2] = np.clip(
                    b[blue_tint] * 0.4 + target_b * 0.6, 0, 255
                ).astype(np.uint8)
            dilated2 = ndimage.binary_dilation(alpha_u8 < 128, iterations=3)
            remaining = (alpha_u8 >= 128) & dilated2 & (b > r + 5) & (b > g + 5)
            if remaining.any():
                arr[remaining, 2] = np.clip(
                    np.minimum(r[remaining], g[remaining]) + 5, 0, 255
                ).astype(np.uint8)

        processed.append(Image.fromarray(arr.astype(np.uint8), "RGBA"))

    processed[0].save(
        output_path,
        save_all=True,
        append_images=processed[1:],
        duration=durations[0],
        loop=0,
        disposal=2,
        optimize=False,
    )

    size_mb = os.path.getsize(output_path) / 1024 / 1024
    print(f"  GIF: {output_path} ({len(processed)} frames, {size_mb:.1f}MB)")


# ===== Main =====
parser = argparse.ArgumentParser(description="Generate transparent GIF for cloe-desktop (v2)")
parser.add_argument("--action", required=True, help="Action name (e.g. working, kiss, wave)")
parser.add_argument("--prompt", required=True, help="Video action prompt in Chinese")
parser.add_argument("--duration", type=int, default=5, help="Video duration in seconds (default: 5)")
parser.add_argument("--reference", default=None, help="Reference image path (green/blue bg)")
parser.add_argument("--output", default=None, help="Output GIF path")
parser.add_argument("--chromakey", choices=["green", "blue"], default="green", help="Chroma key color (default: green)")
parser.add_argument("--no-copy", action="store_true", help="Don't copy to public/gifs/")
parser.add_argument("--work-dir", default=None, help="Working directory for intermediate files")
args = parser.parse_args()

# Default reference image
if args.reference:
    reference_path = os.path.expanduser(args.reference)
else:
    # Auto-detect from active action set in ~/.cloe/action-sets.json
    _as_path = os.path.join(PROJECT_DIR, "action-sets.json")
    if os.path.exists(_as_path):
        with open(_as_path) as _f:
            _as_data = json.load(_f)
        _active = next(
            (s for s in _as_data.get("sets", []) if s["id"] == _as_data.get("activeSetId", "default")),
            _as_data["sets"][0] if _as_data.get("sets") else None,
        )
        if _active:
            reference_path = os.path.join(PROJECT_DIR, _active.get("reference", "references/default.png"))
        else:
            reference_path = os.path.join(PROJECT_DIR, "references/default.png")
    else:
        reference_path = os.path.join(PROJECT_DIR, "references/default.png")

if not os.path.exists(reference_path):
    print(f"Error: reference image not found: {reference_path}")
    sys.exit(1)

# Working directory
work_dir = args.work_dir or os.path.join(PROJECT_DIR, f"gifs/_work_{args.action}")
os.makedirs(work_dir, exist_ok=True)

gif_path = args.output or os.path.join(work_dir, f"{args.action}.gif")

print(f"=== Generating GIF: {args.action} ===")
print(f"  Reference image: {reference_path} ({os.path.getsize(reference_path)/1024/1024:.1f}MB)")
print(f"  Prompt: {args.prompt}")
print(f"  Chroma key: {args.chromakey}")

# Step 1: generate the video
print(f"\n[1/3] Generating video (wan2.7-i2v)...")
video_bytes = generate_video(reference_path, args.prompt, args.duration, args.action, args.chromakey)
print(f"  Video download complete ({len(video_bytes)} bytes)")

# Save the video to the working directory
video_path = os.path.join(work_dir, f"{args.action}_video.mp4")
with open(video_path, "wb") as f:
    f.write(video_bytes)

# Step 2+3: Chromakey + remove color fringing -> transparent GIF
print(f"\n[2/3] Converting to transparent GIF (chromakey={args.chromakey})...")
video_to_transparent_gif(video_bytes, gif_path, args.action, args.chromakey)

# Step 4: copy to public/gifs/
if not args.no_copy:
    public_dir = os.path.join(PROJECT_DIR, "gifs")
    public_path = os.path.join(public_dir, f"{args.action}.gif")
    shutil.copy(gif_path, public_path)
    print(f"\n[3/3] Copied to {public_path}")

print(f"\n=== Done! ===")
print(f"  GIF: {gif_path}")
if not args.no_copy:
    print(f"  Deployed: ~/.cloe/gifs/{args.action}.gif")
print(f"\nNext:")
print(f'  curl -s http://localhost:19851/action -d \'{{"action":"{args.action}"}}\' to test')
