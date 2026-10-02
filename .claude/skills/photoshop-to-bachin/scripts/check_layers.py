#!/usr/bin/env python3
"""Check exported pen-layer PNGs before importing them into Bachin Open Controller.

Usage: check_layers.py LAYER.png [LAYER.png ...] [--card 4x6]

Checks:
  - every layer has the same pixel size (a trimmed export can't line up with the other layers)
  - each file is a real PNG, not a renamed PSD (the controller rejects those)
  - ink coverage and solid-fill share per layer (solid fills become thousands of strokes)
  - ink shared by two layers (the same line would be drawn twice, in two colors)
  - aspect ratio vs. the target card
Transparent pixels count as paper, which matches how the controller imports them.
Exit code 1 if any check FAILs; WARNs don't fail.
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

INK_LUMA = 160        # darker than this counts as ink
INK_CHROMA = 80       # or this colorful (catches light inks like yellow; cream paper stays paper)
TRACE_LUMA = 130      # the controller's default trace threshold; lighter ink may not trace
SOLID_RADIUS = 3      # an ink pixel is "solid" if its whole (2r+1)^2 neighborhood is ink


def load_ink(path):
    raw = Path(path).read_bytes()[:4]
    if raw == b"8BPS":
        return None, "is a Photoshop PSD with a .png name. Use File > Export > Export As > PNG."
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    alpha = a[..., 3:4] / 255
    rgb = a[..., :3] * alpha + 255 * (1 - alpha)          # composite onto white paper
    luma = rgb @ np.array([0.299, 0.587, 0.114])
    chroma = rgb.max(axis=-1) - rgb.min(axis=-1)
    ink = (luma < INK_LUMA) | (chroma > INK_CHROMA)
    hue = rgb[ink].mean(axis=0) if ink.any() else np.array([255, 255, 255])
    return (im.size, ink, hue), None


def solid_share(ink):
    """Share of ink pixels that sit inside a solid filled area rather than on a line."""
    if not ink.any():
        return 0.0
    r = SOLID_RADIUS
    s = np.pad(ink.astype(np.int32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    h, w = ink.shape
    k = 2 * r + 1
    win = s[k:, k:] - s[:-k, k:] - s[k:, :-k] + s[:-k, :-k]   # sums of each k x k window
    full = np.zeros_like(ink)
    full[r:h - r, r:w - r] = win == k * k
    return float(full.sum() / ink.sum())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("layers", nargs="+")
    ap.add_argument("--card", default=None, help="target card in inches, WxH, e.g. 4x6")
    a = ap.parse_args()

    failed = False
    layers = []
    for p in a.layers:
        data, err = load_ink(p)
        if err:
            print(f"FAIL {p} {err}")
            failed = True
            continue
        layers.append((p, *data))

    sizes = {size for _, size, _, _ in layers}
    if len(sizes) > 1:
        failed = True
        print("FAIL layers have different pixel sizes, so they can't line up:")
        for p, size, _, _ in layers:
            print(f"     {Path(p).name}: {size[0]}x{size[1]}")
        print("     Export every layer with File > Export > Export As (whole canvas), not by exporting the layer itself, which trims it.")
    elif layers:
        w, h = layers[0][1]
        print(f"OK   all layers are {w}x{h} px")
        if a.card:
            cw, ch = (float(v) for v in a.card.lower().split("x"))
            art, card = w / h, cw / ch
            fit_w = cw if art >= card else ch * art
            fit_h = cw / art if art >= card else ch
            print(f"INFO art ratio {art:.3f} vs {a.card} card {card:.3f}: fits at {fit_w:.2f} x {fit_h:.2f} in")

    for p, size, ink, hue in layers:
        cov = ink.mean() * 100
        solid = solid_share(ink) * 100
        rgb = ",".join(str(int(v)) for v in hue)
        status = "WARN" if solid > 15 or cov > 30 else "OK  "
        print(f"{status} {Path(p).name}: ink {cov:.1f}% of the page, {solid:.0f}% of the ink is solid fill, avg ink color rgb({rgb})")
        if solid > 15:
            print("     Large solid areas plot as dense back-and-forth strokes. Use outlines or hatching instead, or accept a long plot.")
        if ink.any() and float(hue @ np.array([0.299, 0.587, 0.114])) > TRACE_LUMA:
            print(f"WARN {Path(p).name}: the ink is light, and the controller traces by darkness, so parts may not trace.")
            print("     Recolor this layer to black before exporting (Image > Adjustments > Hue/Saturation, Lightness -100). The pen supplies the color.")
        if ink.sum() == 0:
            print(f"WARN {Path(p).name} has no ink at all. Was the wrong layer exported?")

    if len(sizes) == 1 and len(layers) > 1:
        for i in range(len(layers)):
            for j in range(i + 1, len(layers)):
                (pi, _, a_ink, _), (pj, _, b_ink, _) = layers[i], layers[j]
                both = (a_ink & b_ink).sum()
                share = both / max(1, min(a_ink.sum(), b_ink.sum())) * 100
                status = "WARN" if share > 5 else "OK  "
                print(f"{status} {Path(pi).name} + {Path(pj).name}: {share:.1f}% of the smaller layer's ink is also in the other")
                if share > 5:
                    print("     Those lines will be drawn twice, in both colors. Lower Color Range Fuzziness, or delete the overlap from one layer.")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
