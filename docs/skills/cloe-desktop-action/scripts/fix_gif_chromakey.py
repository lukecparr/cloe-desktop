#!/usr/bin/env python3
"""
Green-screen video to transparent GIF -- two-stage regional matting approach (v5)

A further refinement targeting "transparent gaps still left under the hair": v4 used
closing, but that ends up blurring the hair outline. Better to close the gaps directly
via "aggressive background detection + extremely conservative foreground seed +
dilate + fill_holes".

Stage 1: top half (y < H * top_ratio, hair + head region)
  - Aggressive background detection: even a slight tinge of green counts as
    background, to fully clear the green screen
  - Extremely conservative foreground seed: keep anything that's remotely ambiguous
  - Dark-cluster protection (the core trick): a dark pixel (R<80,G<80,B<80) is forced
    to foreground if its 3x3 neighborhood has >= cluster_thresh dark pixels; this
    protects the hair as a whole from being nibbled away piecemeal
  - **No erode**
  - **dilate=9** to absorb edges and merge hair gaps into closed regions
  - **binary_fill_holes** fills every enclosed hole (gaps become solid -> transparent
    seams disappear)

Stage 2: bottom half (y >= H * top_ratio, body/clothing region)
  - Uses standard HSV detection + moderate dilate (default 9)
  - No hair in this region, so no gap issues

Compositing: stitch the top/bottom masks together -> overall fill_holes -> filter out
             small connected components -> despill -> global palette quantization
             -> output GIF (resistant to inter-frame flicker)

Usage:
  python3 scripts/fix_gif_chromakey.py \
      --video public/gifs/_work_idle/laugh_video.mp4 \
      --output public/gifs/laugh.gif

Arguments:
  --video         Original video path (RGB, not chromakeyed)
  --output        Output GIF path
  --width         Target width (default 400)
  --fps           Frame rate (default 10)
  --top-ratio     Top-half ratio (default 0.5)
  --dilate-top    Top-half dilate kernel (default 9)
  --dilate-bot    Bottom-half dilate kernel (default 9)
  --erode         Erode kernel (default 1, i.e. no erosion)
  --cluster-thresh Dark-cluster protection threshold (dark pixel count in a 3x3
                  neighborhood, default 4)
  --min-blob      Minimum foreground connected-component pixel count (default 1000)
"""

import argparse
import glob
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


def build_dark_cluster_mask(
    R: np.ndarray,
    G: np.ndarray,
    B: np.ndarray,
    rgb_thresh: int = 80,
    kernel: int = 3,
    cluster_thresh: int = 4,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Returns (is_dark_neutral, is_dark_cluster):
      - is_dark_neutral: a single pixel that is neutral dark (all three RGB channels < rgb_thresh)
      - is_dark_cluster: that dark pixel's kernel x kernel neighborhood has
        a dark pixel count >= cluster_thresh
        Used to protect "clustered dark pixels" in the hair from being nibbled away piecemeal
    """
    is_dark_neutral = (R < rgb_thresh) & (G < rgb_thresh) & (B < rgb_thresh)
    # uniform_filter computes the neighborhood mean; multiplying by kernel^2 gives the
    # total count of True values in the neighborhood
    cnt = ndimage.uniform_filter(
        is_dark_neutral.astype(np.float32), size=kernel, mode="reflect"
    ) * (kernel * kernel)
    is_dark_cluster = is_dark_neutral & (cnt >= cluster_thresh)
    return is_dark_neutral, is_dark_cluster


def process_frame(
    rgb: np.ndarray,
    dilate_top: int,
    dilate_bot: int,
    erode_size: int,
    top_ratio: float,
    cluster_thresh: int,
    min_blob: int,
) -> np.ndarray:
    """Single frame RGB -> RGBA: top/bottom regional matting + dark-cluster protection
    + morphology + hole filling + despill."""
    H, W = rgb.shape[:2]
    R = rgb[..., 0].astype(np.int16)
    G = rgb[..., 1].astype(np.int16)
    B = rgb[..., 2].astype(np.int16)
    greenness = G - np.maximum(R, B)

    hsv = np.array(Image.fromarray(rgb).convert("HSV"))
    h = hsv[..., 0].astype(np.int16)
    s = hsv[..., 1].astype(np.int16)
    v = hsv[..., 2].astype(np.int16)

    # Top/bottom regions
    yy = np.arange(H)[:, None]  # (H, 1) -> broadcast to (H, W)
    is_top = yy < int(H * top_ratio)

    # Dark protection (cluster)
    is_dark_neutral, is_dark_cluster = build_dark_cluster_mask(
        R, G, B, rgb_thresh=80, kernel=3, cluster_thresh=cluster_thresh
    )

    # ====== Stage 1: top half (hair/head) ======
    # Relax "dark" in the top half to v < 120: green-reflection pixels along hair edges
    # commonly have v in 50-110, and none of those should be readily classified as background
    is_dark_top = v < 120

    # Top-half background detection (loose/aggressive):
    #   hue 30-120 (wide), s > 35 (low saturation threshold), greenness >= 2 (a slight
    #   tinge of green counts)
    # But strongly protected: pixels in is_dark_top / is_dark_cluster are never background
    is_bg_top = (
        (h >= 30) & (h <= 120) &
        (s > 35) &
        (greenness >= 2) &
        (~is_dark_top) &
        (~is_dark_cluster)
    )

    # Top-half foreground seed (conservative/loose):
    #   - greenness <= 8 all count as foreground candidates (tolerates a lot of
    #     green-reflection hair strands)
    #   - Neutral-dark / dark-cluster pixels are forced to foreground
    fg_seed_top = ((greenness <= 8) & (v > 10)) | is_dark_neutral | is_dark_cluster
    fg_seed_top = fg_seed_top & (~is_bg_top)

    # ====== Stage 2: bottom half (body/clothing) ======
    is_dark_bot = v < 80
    is_bg_bot = (
        (h >= 35) & (h <= 110) &
        (s > 60) &
        (greenness > 5) &
        (~is_dark_bot)
    )
    fg_seed_bot = (greenness <= 2) & (v > 25)
    fg_seed_bot = (fg_seed_bot | is_dark_neutral) & (~is_bg_bot)

    # ====== Merge the initial mask ======
    is_fg_seed = np.where(is_top, fg_seed_top, fg_seed_bot)

    # Morphology: optional erode (generally left off)
    fg_pil = Image.fromarray((is_fg_seed * 255).astype(np.uint8), "L")
    if erode_size >= 3 and erode_size % 2 == 1:
        fg_pil = fg_pil.filter(ImageFilter.MinFilter(size=erode_size))
    seed_arr = np.array(fg_pil) > 128

    # Top half: dilate (absorb edges + merge hair gaps into closed regions) -> fill_holes
    if dilate_top >= 3 and dilate_top % 2 == 1:
        top_arr = np.array(
            Image.fromarray((seed_arr * 255).astype(np.uint8), "L")
            .filter(ImageFilter.MaxFilter(size=dilate_top))
        ) > 128
    else:
        top_arr = seed_arr.copy()
    top_arr = ndimage.binary_fill_holes(top_arr)

    # Bottom half: standard dilate
    if dilate_bot >= 3 and dilate_bot % 2 == 1:
        bot_arr = np.array(
            Image.fromarray((seed_arr * 255).astype(np.uint8), "L")
            .filter(ImageFilter.MaxFilter(size=dilate_bot))
        ) > 128
    else:
        bot_arr = seed_arr.copy()

    # Stitch the top and bottom segments together
    final_mask = np.where(is_top, top_arr, bot_arr)

    # Run fill_holes again on the whole (fallback to close any enclosed hole that may
    # form at the boundary between the two segments)
    final_mask = ndimage.binary_fill_holes(final_mask)

    # Filter out small connected components (corner marks / watermarks / noise)
    if min_blob > 0:
        labeled, n_comp = ndimage.label(final_mask)
        if n_comp > 1:
            sizes = ndimage.sum(final_mask, labeled, range(1, n_comp + 1))
            keep = np.zeros(n_comp + 1, dtype=bool)
            keep[1:] = sizes >= min_blob
            final_mask = keep[labeled]

    # Despill: only despill pixels with an obvious green-screen reflection
    # (greenness > 8), to avoid mistakenly affecting skin tones (a hand's natural
    # G-R difference is usually < 8)
    rgb_clean = rgb.copy()
    avg_rb = ((R + B) // 2).clip(0, 255).astype(np.int16)
    needs_despill = final_mask & (greenness > 8)
    rgb_clean[..., 1] = np.where(needs_despill, np.minimum(G, avg_rb), G).astype(np.uint8)

    # Alpha: 255 inside the mask / 0 outside -> slight feathering -> binarize
    # (GIF only supports binary transparency)
    alpha = np.where(final_mask, 255, 0).astype(np.uint8)
    alpha_pil = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(radius=0.7))
    alpha = np.array(alpha_pil)
    alpha[alpha < 80] = 0
    alpha[alpha >= 80] = 255

    rgba = np.dstack([rgb_clean, alpha]).astype(np.uint8)
    return rgba


def main():
    parser = argparse.ArgumentParser(
        description="Convert green-screen video to transparent GIF (two-stage regional matting + dark-cluster protection + anti-flicker)"
    )
    parser.add_argument("--video", required=True, help="Original video path")
    parser.add_argument("--output", required=True, help="Output GIF path")
    parser.add_argument("--width", type=int, default=400, help="Target width (default 400)")
    parser.add_argument("--fps", type=int, default=10, help="Frame rate (default 10)")
    parser.add_argument("--top-ratio", type=float, default=0.5,
                        help="Top-half ratio (default 0.5)")
    parser.add_argument("--dilate-top", type=int, default=9,
                        help="Top-half dilate kernel (default 9)")
    parser.add_argument("--dilate-bot", type=int, default=9,
                        help="Bottom-half dilate kernel (default 9)")
    parser.add_argument("--erode", type=int, default=1,
                        help="Erode kernel (default 1 = no erosion)")
    parser.add_argument("--cluster-thresh", type=int, default=4,
                        help="Dark-cluster protection threshold: dark pixel count in a 3x3 neighborhood (default 4)")
    parser.add_argument("--min-blob", type=int, default=1000,
                        help="Minimum foreground connected-component pixel count (default 1000)")
    args = parser.parse_args()

    if not os.path.exists(args.video):
        print(f"Error: video not found: {args.video}", file=sys.stderr)
        sys.exit(1)

    tmp = tempfile.mkdtemp(prefix="gif_fix_")
    print(f"[tmp] {tmp}")

    print("[ffmpeg] extracting frames...")
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", args.video,
            "-vf", f"fps={args.fps},scale={args.width}:-1:flags=lanczos",
            "-pix_fmt", "rgb24",
            os.path.join(tmp, "f_%04d.png"),
        ],
        check=True,
    )

    frame_files = sorted(glob.glob(os.path.join(tmp, "f_*.png")))
    print(f"[frames] {len(frame_files)}")

    if not frame_files:
        print("Error: no frames extracted", file=sys.stderr)
        shutil.rmtree(tmp)
        sys.exit(1)

    print("[process] running per-frame two-stage chromakey...")
    processed = []
    for i, fp in enumerate(frame_files):
        if i % 10 == 0:
            print(f"  frame {i}/{len(frame_files)}")
        img = Image.open(fp).convert("RGB")
        rgba = process_frame(
            np.array(img),
            args.dilate_top,
            args.dilate_bot,
            args.erode,
            args.top_ratio,
            args.cluster_thresh,
            args.min_blob,
        )
        processed.append(Image.fromarray(rgba, "RGBA"))

    # Global palette (eliminates inter-frame palette dithering)
    print("[palette] building global palette across all frames...")
    W, H = processed[0].size
    strip = Image.new("RGB", (W, H * len(processed)), (0, 0, 0))
    for i, rgba in enumerate(processed):
        strip.paste(rgba.convert("RGB"), (0, i * H))

    master = strip.quantize(
        colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
    )
    master_palette = master.getpalette()[: 255 * 3]
    # index 255 = the dedicated transparency slot. Its color is set to a bizarre color
    # that "won't appear in the foreground" (bright magenta), to prevent dark
    # foreground content like black hair from being quantized to index 255 and
    # accidentally made transparent.
    # This slot is skipped by transparency at render time, so the color is just a placeholder.
    master_palette += [255, 0, 255]

    pal_template = Image.new("P", (1, 1))
    pal_template.putpalette(master_palette)

    print("[quantize] mapping frames to global palette...")
    p_frames = []
    for rgba in processed:
        q = rgba.convert("RGB").quantize(
            palette=pal_template, dither=Image.Dither.NONE
        )
        arr = np.array(q)
        alpha = np.array(rgba)[..., 3]
        # Fallback: if any foreground pixel gets mistakenly quantized to index 255
        # (the transparency slot), remap it to 254 (the last real color in the
        # palette, virtually imperceptible to the eye)
        fg_mask = alpha >= 128
        misrouted = fg_mask & (arr == 255)
        if misrouted.any():
            arr[misrouted] = 254
        # Uniformly map transparent regions to index 255
        arr[~fg_mask] = 255
        p_img = Image.fromarray(arr, "P")
        p_img.putpalette(master_palette)
        p_frames.append(p_img)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    print(f"[save] writing {args.output}")
    p_frames[0].save(
        args.output,
        save_all=True,
        append_images=p_frames[1:],
        duration=100,
        loop=0,
        disposal=2,
        transparency=255,
        optimize=False,
    )

    shutil.rmtree(tmp)
    size_mb = os.path.getsize(args.output) / (1024 * 1024)
    print(f"[done] {args.output} ({len(p_frames)} frames, {size_mb:.1f}MB)")


if __name__ == "__main__":
    main()
