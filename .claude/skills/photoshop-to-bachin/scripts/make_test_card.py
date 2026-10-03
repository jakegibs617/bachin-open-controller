#!/usr/bin/env python3
"""Make a pen calibration card: plot it once per pen to learn what that pen can draw.

Usage:
  make_test_card.py -o pen-test-4x6.png [--card 4x6]
                    [--sample ART.png --sample-box X0,Y0,X1,Y1 --label TEXT ...]

Draws, at the card's real size (0.1 mm per pixel):
  - hatch patches at 0.5-1.2 mm line spacing, single and cross-hatched (where does ink merge?)
  - pairs of parallel lines 0.2-0.8 mm apart (when do two lines read as one?)
  - dashes 0.3-2 mm long (which sizes blot?)
  - capital lettering 2-5 mm tall (is it legible?)
  - optional crops of real art (--sample, repeatable). The art must already be at 0.1 mm/px,
    which is true for a layer whose width or height exactly fills the card (e.g. 1016 px wide on 4x6).
Import the PNG in the controller (Centerline, Detail Ultra), fit it to the card, and plot it.
Then pick --pen/--gap for pen_prep.py from the smallest spacing that stayed open.
"""
import argparse

from PIL import Image, ImageDraw, ImageFont

MM = 25.4
PX = 10                     # pixels per mm


def font(size_mm):
    for f in ("/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(f, int(size_mm * PX * 1.35))
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-o", "--out", default="pen-test-4x6.png")
    ap.add_argument("--card", default="4x6")
    ap.add_argument("--sample", action="append", default=[], help="art PNG at 0.1 mm/px")
    ap.add_argument("--sample-box", action="append", default=[], metavar="X0,Y0,X1,Y1",
                    help="pixel box to crop from the matching --sample")
    ap.add_argument("--label", action="append", default=[], help="caption for the matching --sample")
    a = ap.parse_args()

    cw, ch = (float(v) * MM for v in a.card.lower().split("x"))
    W, H = round(cw * PX), round(ch * PX)     # round: 152.4 * 10 is 1523.999...
    im = Image.new("L", (W, H), 255)
    d = ImageDraw.Draw(im)
    lw = 2                   # 0.2 mm source lines: thin, but they don't fade when traced at Ultra
    small = font(2.2)

    def mm(v):
        return int(round(v * PX))

    d.rectangle((mm(2), mm(2), W - mm(2), H - mm(2)), outline=0, width=lw)
    y, x0, patch, gap_x = 5.0, 5.0, 12.0, 3.5

    # Hatch patches: single direction, then crossed.
    for cross in (False, True):
        d.text((mm(x0), mm(y)), "cross-hatch, line spacing mm" if cross else "hatch, line spacing mm",
               font=small, fill=0)
        y += 4
        for i, s in enumerate((0.5, 0.6, 0.7, 0.8, 1.0, 1.2)):
            px0 = x0 + i * (patch + gap_x)
            k = 0.0
            while k <= patch + 1e-6:
                d.line((mm(px0), mm(y + k), mm(px0 + patch), mm(y + k)), fill=0, width=lw)
                if cross:
                    d.line((mm(px0 + k), mm(y), mm(px0 + k), mm(y + patch)), fill=0, width=lw)
                k += s
            d.text((mm(px0), mm(y + patch + 0.8)), f"{s:g}", font=small, fill=0)
        y += patch + 5

    # Parallel pairs: when do two lines merge into one?
    d.text((mm(x0), mm(y)), "two lines, gap between centers mm", font=small, fill=0)
    y += 4
    for i, g in enumerate((0.2, 0.3, 0.4, 0.5, 0.6, 0.8)):
        px0 = x0 + i * (patch + gap_x)
        for off in (0, g):
            d.line((mm(px0), mm(y + off), mm(px0 + patch), mm(y + off)), fill=0, width=lw)
        d.text((mm(px0), mm(y + 2)), f"{g:g}", font=small, fill=0)
    y += 7

    # Dashes: which sizes blot?
    d.text((mm(x0), mm(y)), "dash length mm (x5 each)", font=small, fill=0)
    y += 4
    for i, length in enumerate((0.3, 0.5, 0.8, 1.0, 1.5, 2.0)):
        px0 = x0 + i * (patch + gap_x)
        for j in range(5):
            cx = px0 + j * 2.5
            d.line((mm(cx), mm(y), mm(cx + length), mm(y)), fill=0, width=lw + 1)
        d.text((mm(px0), mm(y + 1.5)), f"{length:g}", font=small, fill=0)
    y += 6

    # Lettering sizes (the Christmas caption is ~3.4 mm tall).
    for size in (2.0, 3.0, 4.0, 5.0):
        d.text((mm(x0), mm(y)), f"THE RESERVE {size:g}mm", font=font(size), fill=0)
        y += size + 2

    # Real-art samples at plotting scale.
    xs, row_h = x0, 0.0
    for k, path in enumerate(a.sample):
        src = Image.open(path).convert("L")
        box = tuple(int(v) for v in a.sample_box[k].split(",")) if k < len(a.sample_box) else (0, 0, *src.size)
        crop = src.crop(box)
        if xs > x0 and mm(xs) + crop.width > W - mm(4):          # wrap to a new row
            xs, y, row_h = x0, y + row_h + 5, 0.0
        room_h = H - mm(y + 1) - mm(7)
        label = a.label[k] if k < len(a.label) else path.split("/")[-1]
        if room_h < mm(5):                                       # no room left on the card
            print(f"skipped sample {label}: no room left on the card")
            continue
        if crop.height > room_h:
            crop = crop.crop((0, 0, crop.width, room_h))
        row_h = max(row_h, crop.height / PX)
        im.paste(crop, (mm(xs), mm(y + 1)))
        d.text((mm(xs), mm(y + 1) + crop.height + mm(0.8)), label, font=small, fill=0)
        xs += crop.width / PX + 4

    im.save(a.out)
    print(f"Wrote {a.out}: {W}x{H} px ({a.card} card at 0.1 mm/px). Trace at Centerline, Detail Ultra.")


if __name__ == "__main__":
    main()
