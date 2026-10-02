#!/usr/bin/env python3
"""Fit a Bachin Open Controller plan (.boc.json) onto a card, keeping pen layers aligned.

All layers are scaled by one factor around a shared point and moved together, so the
color layers traced from one image stay lined up. This matches "Layers linked" in the controller.

Usage:
  fit_plan.py PLAN.boc.json --card 4x6 [--corner tl|tr|bl|br] [--fit width|height|contain]
              [--margin 0.0] [--inset 0.0] [--out OUT.boc.json]

Card size is in inches (portrait, width x height). The card is placed in the chosen corner
of the machine bed (the plan's canvas, e.g. 180 x 210 mm for the TA4), --inset inches in from
that corner's two edges, and the art is centered on the card. Prints the X/Y/W values to type into the controller for each layer.
"""
import argparse
import json
import sys
from pathlib import Path

MM = 25.4


def layer_bounds(layer):
    b = [p["bounds"] for p in layer["paths"]]
    return (min(x["minX"] for x in b), max(x["maxX"] for x in b),
            min(x["minY"] for x in b), max(x["maxY"] for x in b))


def placed_bounds(layer):
    """Bounds of a layer after its transform (the controller scales around the layer's own center)."""
    x0, x1, y0, y1 = layer_bounds(layer)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    t = layer["transform"]
    sx, sy = t["scale"] / 100, t.get("scaleY", t["scale"]) / 100
    xs = [cx + t["x"] + (x - cx) * sx for x in (x0, x1)]
    ys = [cy + t["y"] + (y - cy) * sy for y in (y0, y1)]
    return min(xs), max(xs), min(ys), max(ys), (cx, cy)


def fit(plan, card_w_in, card_h_in, corner="tl", mode="contain", margin_in=0.0, inset_in=0.0):
    layers = [o for o in plan["objects"] if o.get("paths")]
    for o in layers:
        t = o["transform"]
        if t.get("rotation", 0) or t.get("flipX") or t.get("flipY"):
            sys.exit(f"{o['metadata'].get('fileName', o['id'])}: rotated or flipped layers aren't supported; reset them first.")

    placed = [placed_bounds(o) for o in layers]
    gx0 = min(p[0] for p in placed); gx1 = max(p[1] for p in placed)
    gy0 = min(p[2] for p in placed); gy1 = max(p[3] for p in placed)
    art_w, art_h = gx1 - gx0, gy1 - gy0

    card_w, card_h = card_w_in * MM, card_h_in * MM
    avail_w, avail_h = card_w - 2 * margin_in * MM, card_h - 2 * margin_in * MM
    fx, fy = avail_w / art_w, avail_h / art_h
    f = {"width": fx, "height": fy}.get(mode, min(fx, fy))

    bed_w, bed_h = plan["canvas"]["width"], plan["canvas"]["height"]
    inset = inset_in * MM
    if card_w + inset > bed_w + 1e-6 or card_h + inset > bed_h + 1e-6:
        sys.exit(f"Card {card_w_in}x{card_h_in} in with a {inset_in} in inset doesn't fit the "
                 f"{bed_w / MM:.2f}x{bed_h / MM:.2f} in bed.")
    card_x = inset if corner in ("tl", "bl") else bed_w - card_w - inset
    card_y = inset if corner in ("tl", "tr") else bed_h - card_h - inset

    # New group bounds: scaled art centered on the card.
    new_w, new_h = art_w * f, art_h * f
    nx0 = card_x + (card_w - new_w) / 2
    ny0 = card_y + (card_h - new_h) / 2

    report = []
    for o, (px0, _, py0, _, (cx, cy)) in zip(layers, placed):
        t = o["transform"]
        # Same scale factor for every layer; each keeps its offset from the group's corner.
        # A raw point p maps to: c + t' + (p - c) * s * f, and the layer's placed min corner
        # must land at n0 + (p0 - g0) * f.
        s_old = t["scale"] / 100
        sy_old = t.get("scaleY", t["scale"]) / 100
        raw_x0, _, raw_y0, _ = layer_bounds(o)
        target_x0 = nx0 + (px0 - gx0) * f
        target_y0 = ny0 + (py0 - gy0) * f
        t["scale"] = s_old * 100 * f
        t["scaleY"] = sy_old * 100 * f
        t["x"] = target_x0 - cx - (raw_x0 - cx) * s_old * f
        t["y"] = target_y0 - cy - (raw_y0 - cy) * sy_old * f
        name = o["metadata"].get("fileName", o["id"])
        lx0, lx1, ly0, ly1, _ = placed_bounds(o)
        report.append(dict(layer=name, scale_pct=round(t["scale"], 3),
                           x_in=round(t["x"] / MM, 4), y_in=round(t["y"] / MM, 4),
                           w_in=round((lx1 - lx0) / MM, 4), h_in=round((ly1 - ly0) / MM, 4)))
    summary = dict(card_in=[card_w_in, card_h_in], corner=corner, factor=round(f, 5),
                   art_in=[round(new_w / MM, 3), round(new_h / MM, 3)],
                   card_origin_in=[round(card_x / MM, 4), round(card_y / MM, 4)])
    return summary, report


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plan")
    ap.add_argument("--card", default="4x6", help="card size in inches, WxH (default 4x6)")
    ap.add_argument("--corner", default="tl", choices=["tl", "tr", "bl", "br"])
    ap.add_argument("--fit", default="contain", choices=["contain", "width", "height"])
    ap.add_argument("--margin", type=float, default=0.0, help="blank margin inside the card, inches")
    ap.add_argument("--inset", type=float, default=0.0, help="gap between the card and the bed edges at the corner, inches")
    ap.add_argument("--out")
    a = ap.parse_args()

    w, h = (float(v) for v in a.card.lower().split("x"))
    plan = json.loads(Path(a.plan).read_text())
    summary, report = fit(plan, w, h, a.corner, a.fit, a.margin, a.inset)
    out = Path(a.out) if a.out else Path(a.plan).with_name(f"{Path(a.plan).name.split('.')[0]}-{a.card}-{a.corner}.boc.json")
    plan["name"] = out.name.removesuffix(".boc.json")
    out.write_text(json.dumps(plan))
    print(json.dumps(summary))
    for r in report:
        print(json.dumps(r))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
