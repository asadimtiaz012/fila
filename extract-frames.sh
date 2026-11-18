#!/usr/bin/env bash
# FILA Disruptor — frame sequence extraction
# Builds the desktop + mobile scroll sequences, the manifest and the product stills.
#
# Usage:  ./extract-frames.sh [path/to/shoe.mp4]
# Needs:  ffmpeg + ffprobe (with libwebp), python3 with Pillow + numpy (for the stills)
set -euo pipefail

cd "$(dirname "$0")"

SRC="${1:-}"
if [ -z "$SRC" ]; then
  for f in shoe.mp4 shoe.mp4.mp4; do [ -f "$f" ] && SRC="$f" && break; done
fi
[ -f "$SRC" ] || { echo "Video not found. Pass the path as the first argument."; exit 1; }

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
DESKTOP_W=1920; DESKTOP_H=1080; DESKTOP_FPS=24; DESKTOP_Q=80
MOBILE_W=720;   MOBILE_FPS=12;  MOBILE_Q=75
# One fixed crop window for the mobile sequence (source pixels, 1280x720 source).
# Measured from the shoe's bounding box across the whole orbit (union x 103..1091,
# y 63..719). The shoe spans ~988px of the 1280px width, so a 4:5 / 3:4 or even 1:1
# window would cut the toe or heel in some frames. The window below keeps the entire
# shoe with ~60px of padding on every side; the site fades its edges into the page.
CROP_W=1120; CROP_H=700; CROP_X=40; CROP_Y=20
MOBILE_H=$(( MOBILE_W * CROP_H / CROP_W ))
PAD=4

echo "Source: $SRC"
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,nb_frames,duration -of default=nw=1 "$SRC"

rm -rf frames/desktop frames/mobile
mkdir -p frames/desktop frames/mobile images/products

# ---------------------------------------------------------------------------
# 1. Desktop sequence — 1920x1080, 24fps, WebP q80
# ---------------------------------------------------------------------------
ffmpeg -v error -y -i "$SRC" -an \
  -vf "fps=${DESKTOP_FPS},scale=${DESKTOP_W}:${DESKTOP_H}:flags=lanczos" \
  -c:v libwebp -quality ${DESKTOP_Q} -compression_level 6 -preset photo \
  "frames/desktop/frame_%0${PAD}d.webp"

# ---------------------------------------------------------------------------
# 2. Mobile sequence — fixed crop, 720px wide, 12fps, WebP q75
# ---------------------------------------------------------------------------
ffmpeg -v error -y -i "$SRC" -an \
  -vf "fps=${MOBILE_FPS},crop=${CROP_W}:${CROP_H}:${CROP_X}:${CROP_Y},scale=${MOBILE_W}:${MOBILE_H}:flags=lanczos" \
  -c:v libwebp -quality ${MOBILE_Q} -compression_level 6 -preset photo \
  "frames/mobile/frame_%0${PAD}d.webp"

DCOUNT=$(ls frames/desktop/*.webp | wc -l | tr -d ' ')
MCOUNT=$(ls frames/mobile/*.webp | wc -l | tr -d ' ')

# ---------------------------------------------------------------------------
# 3. Manifest — the site reads every number from here
# ---------------------------------------------------------------------------
cat > frames/manifest.json <<JSON
{
  "version": 1,
  "extension": "webp",
  "prefix": "frame_",
  "padding": ${PAD},
  "desktop": { "path": "frames/desktop/", "count": ${DCOUNT}, "width": ${DESKTOP_W}, "height": ${DESKTOP_H}, "fps": ${DESKTOP_FPS} },
  "mobile":  { "path": "frames/mobile/",  "count": ${MCOUNT}, "width": ${MOBILE_W}, "height": ${MOBILE_H}, "fps": ${MOBILE_FPS},
               "focus": { "x": 0.5, "y": 0.47 } }
}
JSON

# ---------------------------------------------------------------------------
# 4. Product stills (3:4 portrait, 1000x1333, studio background extended)
#    disruptor-ii-1 = front three-quarter view, disruptor-ii-2 = side profile
# ---------------------------------------------------------------------------
TMP="$(mktemp -d)"
ffmpeg -v error -y -ss 0.04 -i "$SRC" -frames:v 1 "$TMP/still1.png"
ffmpeg -v error -y -ss 3.50 -i "$SRC" -frames:v 1 "$TMP/still2.png"

PY=python3; command -v $PY >/dev/null 2>&1 || PY=python
$PY - "$TMP/still1.png" "$TMP/still2.png" images/products <<'PYCODE'
import sys, os
import numpy as np
from PIL import Image, ImageFilter

W, H = 1000, 1333
def make(src, dst):
    im = Image.open(src).convert("RGB")
    im = im.crop((60, 0, 1220, 720))                     # keep the full shoe
    s = W / im.width
    im = im.resize((W, round(im.height * s)), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    top = a[:6].mean(axis=(0, 1)); bot = a[-6:].mean(axis=(0, 1))
    h = im.height
    y0 = 250                                             # where the frame sits
    ys = np.arange(H, dtype=np.float32)
    dark = np.array([5, 5, 5], np.float32)
    bg = np.zeros((H, 3), np.float32)
    for y in range(H):
        if y < y0 + h / 2:                               # charcoal backdrop above
            t = min(1.0, y / (y0 + 30)); bg[y] = top * (0.45 + 0.55 * t)
        else:                                            # glossy floor fading to black
            t = min(1.0, max(0.0, (y - (y0 + h - 160)) / 260)); bg[y] = bot * (1 - t) + dark * t
    canvas = np.repeat(bg[:, None, :], W, axis=1)
    # feather the frame into the background
    mask = np.ones((h, 1), np.float32)
    f, fb = 60, 200
    mask[:f, 0] = np.linspace(0, 1, f) ** 1.5
    mask[-fb:, 0] = np.linspace(1, 0, fb) ** 1.2
    canvas[y0:y0 + h] = canvas[y0:y0 + h] * (1 - mask[..., None]) + a * mask[..., None]
    # soft vignette
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W * .75)) ** 2 + ((yy - H * .45) / (H * .75)) ** 2)
    canvas *= np.clip(1.08 - d * 0.35, 0.6, 1)[..., None]
    out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    out = out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))
    out.save(dst, "WEBP", quality=84, method=6)
    print("wrote", dst, out.size)

make(sys.argv[1], os.path.join(sys.argv[3], "disruptor-ii-1.webp"))
make(sys.argv[2], os.path.join(sys.argv[3], "disruptor-ii-2.webp"))
PYCODE
rm -rf "$TMP"

echo "Desktop frames: $DCOUNT  ($(du -sh frames/desktop | cut -f1))"
echo "Mobile frames:  $MCOUNT  ($(du -sh frames/mobile | cut -f1))"
