#!/usr/bin/env python3
"""Preview how a card will print with a real pen, and how long it will take.

Usage:
  simulate_print.py PLAN.boc.json [--pen 0.35] [--dpi 300] [-o preview.png]
  simulate_print.py LAYER.png [LAYER.png ...] --card 4x6 [--pen 0.35] [-o preview.png]

The controller's preview draws every stroke as a hairline, so dense hatching looks fine on screen
and then merges into a solid mass on paper. This draws each stroke at the pen's real line width,
in its ink color (lightest ink first, overlaps darken like real ink), and writes:
  preview.png        the card as it will look
  preview-muddy.png  the same, with areas where the ink covers more than 70% of the card tinted red
For a plan it also prints, per layer: strokes (each is one pen lift), draw and travel distance,
and an estimated time from the layer's saved speeds (TA4 defaults: draw 1600, travel 6000 mm/min).
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

MM = 25.4
MUDDY_COVERAGE = 0.7
MUDDY_WINDOW_MM = 2.0
INKS = {"black": (25, 25, 25), "green": (40, 100, 35), "red": (200, 30, 40), "yellow": (240, 190, 0),
        "blue": (30, 60, 170), "pink": (230, 80, 150), "orange": (240, 110, 20), "purple": (110, 40, 130)}


def ink_for(name, preview_color=None):
    """The layer's own preview color if it has one; otherwise an ink named as a whole word in the file name
    (card-red.png is red, colored.png is not)."""
    if preview_color and preview_color.startswith("#") and len(preview_color) == 7:
        return tuple(int(preview_color[i:i + 2], 16) for i in (1, 3, 5))
    words = re.split(r"[-_. ]+", name.lower())
    for key, rgb in INKS.items():
        if key in words:
            return rgb
    return INKS["black"]


def placed_strokes(obj):
    """The layer's strokes in bed mm, placed like the app's applyArtworkTransform (src/ui/artworkPlan.ts):
    scale and flip, then rotate, all around the layer's own center, then offset."""
    b = [p["bounds"] for p in obj["paths"]]
    cx = (min(x["minX"] for x in b) + max(x["maxX"] for x in b)) / 2
    cy = (min(x["minY"] for x in b) + max(x["maxY"] for x in b)) / 2
    t = obj["transform"]
    sx = t["scale"] / 100 * (-1 if t.get("flipX") else 1)
    sy = t.get("scaleY", t["scale"]) / 100 * (-1 if t.get("flipY") else 1)
    rad = math.radians(t.get("rotation", 0))
    cos_r, sin_r = math.cos(rad), math.sin(rad)

    def place(x, y):
        u, v = (x - cx) * sx, (y - cy) * sy
        return cx + t["x"] + u * cos_r - v * sin_r, cy + t["y"] + u * sin_r + v * cos_r

    return [[place(s["x"], s["y"]) for s in p["segments"]] for p in obj["paths"]]


def plan_stats(strokes, speeds):
    draw = sum(math.dist(a, b) for s in strokes for a, b in zip(s, s[1:]))
    travel, pos = 0.0, (0.0, 0.0)
    for s in strokes:
        travel += math.dist(pos, s[0])
        pos = s[-1]
    minutes = draw / speeds.get("drawingSpeed", 1600) + travel / speeds.get("travelSpeed", 6000)
    return draw, travel, minutes


def render_strokes(strokes, origin, size_px, px_per_mm, pen):
    im = Image.new("L", size_px, 0)
    d = ImageDraw.Draw(im)
    w = max(1, round(pen * px_per_mm))
    r = w / 2
    for s in strokes:
        pts = [((x - origin[0]) * px_per_mm, (y - origin[1]) * px_per_mm) for x, y in s]
        if len(pts) > 1:
            d.line(pts, fill=255, width=w, joint="curve")
        for x, y in (pts[0], pts[-1]):                       # round pen tip at both ends
            d.ellipse((x - r, y - r, x + r, y + r), fill=255)
    return np.asarray(im) > 127


def compose(layers, out, px_per_mm):
    """layers: [(name, rgb, mask)]. Lightest ink first; overlapping inks multiply."""
    h, w = layers[0][2].shape
    paper = np.ones((h, w, 3))
    for name, rgb, mask in sorted(layers, key=lambda l: -sum(l[1])):
        paper[mask] *= np.array(rgb) / 255
    img = (paper * 255).astype(np.uint8)
    Image.fromarray(img).save(out)

    k = max(3, int(MUDDY_WINDOW_MM * px_per_mm) | 1)
    muddy = np.zeros((h, w), bool)
    for name, rgb, mask in layers:
        m = nd.uniform_filter(mask.astype(float), k) > MUDDY_COVERAGE
        print(f"     {name}: {m.mean() * 100:.1f}% of the card is muddy (ink covers >{MUDDY_COVERAGE:.0%} of a "
              f"{MUDDY_WINDOW_MM:g} mm square)")
        muddy |= m
    tint = img.copy()
    tint[muddy] = (0.5 * tint[muddy] + 0.5 * np.array([255, 0, 0])).astype(np.uint8)
    muddy_out = out.with_name(out.stem + "-muddy" + out.suffix)
    Image.fromarray(tint).save(muddy_out)
    print(f"Wrote {out} and {muddy_out}")


def simulate_plan(path, a):
    plan = json.loads(Path(path).read_text())
    objs = [o for o in plan["objects"] if o.get("paths") and o.get("visible", True)]
    placed = [(o, placed_strokes(o)) for o in objs]
    xs = [x for _, st in placed for s in st for x, _ in s]
    ys = [y for _, st in placed for s in st for _, y in s]
    margin = 2.0
    origin = (min(xs) - margin, min(ys) - margin)
    px_per_mm = a.dpi / MM
    size = (int((max(xs) - min(xs) + 2 * margin) * px_per_mm) + 1,
            int((max(ys) - min(ys) + 2 * margin) * px_per_mm) + 1)

    layers, total = [], [0.0, 0.0, 0.0, 0]
    for o, strokes in placed:
        name = o.get("metadata", {}).get("fileName", o["id"])
        speeds = o.get("metadata", {}).get("actionSpeeds", {})
        draw, travel, minutes = plan_stats(strokes, speeds)
        total = [total[0] + draw, total[1] + travel, total[2] + minutes, total[3] + len(strokes)]
        print(f"{name}: {len(strokes)} strokes | draw {draw / 1000:.2f} m | travel {travel / 1000:.2f} m "
              f"| ~{minutes:.1f} min")
        layers.append((name, ink_for(name, o.get("previewColor")),
                       render_strokes(strokes, origin, size, px_per_mm, a.pen)))
    if len(placed) > 1:
        print(f"all layers: {total[3]} strokes | draw {total[0] / 1000:.2f} m | travel {total[1] / 1000:.2f} m "
              f"| ~{total[2]:.1f} min")
    compose(layers, Path(a.out), px_per_mm)


def simulate_pngs(paths, a):
    from pen_prep import load_ink, mm_per_px, skeletonize    # the controller draws centerlines

    sizes = {p: Image.open(p).size for p in map(Path, paths)}
    if len(set(sizes.values())) > 1:
        listed = ", ".join(f"{p.name} {w}x{h}" for p, (w, h) in sizes.items())
        sys.exit(f"Layers must all be the same pixel size to line up: {listed}. Re-export the whole canvas.")
    layers = []
    for p in map(Path, paths):
        ink, _ = load_ink(p)
        mmpp = mm_per_px(ink.shape, a.card)
        skel = skeletonize(ink)
        r = a.pen / mmpp / 2
        rr = int(math.ceil(r))
        dy, dx = np.mgrid[-rr:rr + 1, -rr:rr + 1]
        mask = nd.binary_dilation(skel, structure=dy * dy + dx * dx <= r * r + 0.25)
        scale = (a.dpi / MM) * mmpp
        size = (round(mask.shape[1] * scale), round(mask.shape[0] * scale))
        mask = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize(size, Image.BILINEAR)) > 127
        print(f"{p.name}: line length {skel.sum() * mmpp / 1000:.2f} m")
        layers.append((p.name, ink_for(p.name), mask))
    compose(layers, Path(a.out), a.dpi / MM)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+", help="one .boc.json plan, or pen-layer PNGs")
    ap.add_argument("--pen", type=float, default=0.35,
                    help="line width the pen leaves on the paper, mm (default 0.35, a measured Pilot V5)")
    ap.add_argument("--card", default=None, help="card in inches, WxH, e.g. 4x6 (needed for PNGs)")
    ap.add_argument("--dpi", type=float, default=300)
    ap.add_argument("-o", "--out", default="print-preview.png")
    a = ap.parse_args()
    if a.inputs[0].endswith(".json"):
        simulate_plan(a.inputs[0], a)
    else:
        if not a.card:
            ap.error("--card is needed for PNG layers")
        simulate_pngs(a.inputs, a)


if __name__ == "__main__":
    main()
