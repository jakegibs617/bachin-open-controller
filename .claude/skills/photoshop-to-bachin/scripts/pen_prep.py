#!/usr/bin/env python3
"""Make a pen-layer PNG printable with a real pen: thin dense hatching to the pen's pitch.

Usage:
  pen_prep.py LAYER.png [LAYER.png ...] --card 4x6 [--pen 0.5] [--gap 0.5] [--min-length 0.8]
              [--draw-width 0.3] [--keep-color] [--out-dir DIR]

Lines that are fine on screen merge on paper when they are closer than the pen's line width.
A 0.5 mm Pilot V5 on card leaves a ~0.5-0.6 mm line, so engraving-style hatching 0.4 mm apart
plots as a solid mass. This script:
  1. reads the layer at its size on the card (contain-fit, like fit_plan.py),
  2. reduces every stroke to its 1 px centerline (what the controller's Centerline mode draws),
  3. keeps strokes longest first, dropping the parts that run parallel to an already-kept line
     closer than pen + gap (crossing strokes and letter parts are kept),
  4. drops specks shorter than --min-length (each would be a pen-down blot),
  5. redraws what's left as solid lines --draw-width mm wide, so nothing traces faint.
Writes DIR/<same name>.png (default: a print/ folder next to the input) and never touches the input.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as nd

MM = 25.4
TRACE_THRESHOLD = 170          # the controller's default threshold (Canvas.tsx defaults)
REC709 = np.array([0.2126, 0.7152, 0.0722])
N_BINS = 8                     # stroke directions, 22.5 degrees each (0-180)
EIGHT = np.ones((3, 3), bool)


def load_ink(path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    alpha = a[..., 3:4] / 255
    rgb = a[..., :3] * alpha + 255 * (1 - alpha)          # transparency is paper
    ink = rgb @ REC709 < TRACE_THRESHOLD
    color = np.median(rgb[ink], axis=0) if ink.any() else np.zeros(3)
    return ink, color


def mm_per_px(shape, card):
    cw, ch = (float(v) * MM for v in card.lower().split("x"))
    h, w = shape
    return min(cw / w, ch / h)


def skeletonize(ink):
    """Zhang-Suen thinning to a 1 px centerline (same algorithm as the controller's Centerline mode)."""
    img = np.pad(ink, 1).astype(np.uint8)
    while True:
        changed = False
        for step in (0, 1):
            # neighbours P2..P9, clockwise from north
            p2, p3, p4, p5, p6, p7, p8, p9 = (
                np.roll(np.roll(img, dy, 0), dx, 1)
                for dy, dx in ((1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1)))
            seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            b = sum(seq[:8])
            a = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.uint8) for i in range(8))
            if step == 0:
                c = (p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)
            else:
                c = (p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0)
            rm = (img == 1) & (b >= 2) & (b <= 6) & (a == 1) & c
            if rm.any():
                img = img.copy()
                img[rm] = 0
                changed = True
        if not changed:
            return img[1:-1, 1:-1].astype(bool)


def split_pieces(skel):
    """Split the skeleton at junctions. Returns (pieces as ordered (y, x) arrays, junction mask)."""
    nb = nd.convolve(skel.astype(np.uint8), EIGHT.astype(np.uint8), mode="constant") - 1
    junction = skel & (nb >= 3)
    body = skel & ~junction
    lab, n = nd.label(body, structure=EIGHT)
    pieces = []
    for i, sl in enumerate(nd.find_objects(lab), start=1):
        ys, xs = np.nonzero(lab[sl] == i)
        pieces.append(order_points(np.stack([ys + sl[0].start, xs + sl[1].start], 1)))
    return pieces, junction


def order_points(pts):
    """Walk a thin, branch-free pixel set from one end to the other."""
    if len(pts) <= 2:
        return pts
    idx = {(int(y), int(x)): k for k, (y, x) in enumerate(pts)}

    def nbrs(k):
        y, x = pts[k]
        return [idx[(y + dy, x + dx)] for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                if (dy or dx) and (y + dy, x + dx) in idx]

    start = next((k for k in range(len(pts)) if len(nbrs(k)) <= 1), 0)   # an end, or anywhere on a loop
    order, seen = [start], {start}
    while True:
        nxt = [k for k in nbrs(order[-1]) if k not in seen]
        if not nxt:
            break
        y, x = pts[order[-1]]
        nxt.sort(key=lambda k: abs(pts[k][0] - y) + abs(pts[k][1] - x))   # 4-connected steps first
        order.append(nxt[0])
        seen.add(nxt[0])
    return pts[order + [k for k in range(len(pts)) if k not in seen]]


def direction_bins(pts, k=3):
    """Direction (0-180 deg) of each point along an ordered piece, as a bin index."""
    n = len(pts)
    if n < 2:
        return np.zeros(n, int)
    lo = np.clip(np.arange(n) - k, 0, n - 1)
    hi = np.clip(np.arange(n) + k, 0, n - 1)
    d = pts[hi] - pts[lo]
    ang = np.degrees(np.arctan2(d[:, 0], d[:, 1])) % 180
    return np.round(ang / (180 / N_BINS)).astype(int) % N_BINS


def disk_offsets(r):
    """Pixel offsets strictly closer than r."""
    rr = int(np.ceil(r))
    dy, dx = np.mgrid[-rr:rr + 1, -rr:rr + 1]
    keep = dy * dy + dx * dx < r * r
    return dy[keep], dx[keep]


def disk_struct(r):
    rr = int(np.ceil(r))
    dy, dx = np.mgrid[-rr:rr + 1, -rr:rr + 1]
    return dy * dy + dx * dx <= r * r + 0.5


def free_runs(free):
    runs, start = [], None
    for i, f in enumerate(np.append(free, False)):
        if f and start is None:
            start = i
        elif not f and start is not None:
            runs.append((start, i))
            start = None
    return runs


def close_one_px_gaps(ink):
    """Fill 1 px white lines inside strokes (engraved lettering): the pen can't draw them."""
    p = np.pad(ink, 1)
    gap = ((p[:-2, 1:-1] & p[2:, 1:-1]) | (p[1:-1, :-2] & p[1:-1, 2:])
           | (p[:-2, :-2] & p[2:, 2:]) | (p[:-2, 2:] & p[2:, :-2]))
    return ink | gap


SPACINGS = (1.0, 1.4, 2.0, 3.0)   # hatch spacing levels, in pen pitches (pen + gap)
PAPER_TONE = 0.06    # below this the card is blank: a shaded area's edge against it is a silhouette
LONG_LINE_MM = 15    # strokes at least this long are structure (frame, horizon, rules), drawn first
CROSS_TONE = 0.5     # tone above which shading is cross-hatched
SEED_FACTOR = 0.8     # seed spacing / target spacing (tuned so plotted coverage matches the art's tone)


def stroke_orientation(ink, sigma):
    """Unit vectors along the local stroke direction (structure tensor of the ink)."""
    f = nd.gaussian_filter(ink.astype(float), 1.5)
    gx, gy = nd.sobel(f, axis=1), nd.sobel(f, axis=0)
    jxx = nd.gaussian_filter(gx * gx, sigma)
    jyy = nd.gaussian_filter(gy * gy, sigma)
    jxy = nd.gaussian_filter(gx * gy, sigma)
    phi = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + np.pi / 2    # along the strokes, not across
    return np.cos(phi), np.sin(phi)                          # (x, y) components


def streamline_hatch(dense, levels, ux, uy, pitch_px, min_len_px, blocked):
    """Evenly spaced streamlines (Jobard & Lefer) through `dense`, following (ux, uy).

    `levels` picks a spacing from SPACINGS for each pixel. Lines start ~1.15 x that spacing apart and
    stop before they come closer than it to another line, or closer than one pitch to `blocked`.
    """
    h, w = dense.shape
    # Streamlines settle ~1.3x further apart than their seed spacing, so seed closer than the target,
    # but never let two lines come closer than one pitch.
    seps = tuple(max(1.15 * pitch_px, SEED_FACTOR * m * pitch_px) for m in SPACINGS)
    tests = tuple(max(pitch_px, 0.8 * sp) for sp in seps)
    occ_sep = [np.zeros((h, w), bool) for _ in seps]
    occ_test = [np.zeros((h, w), bool) for _ in seps]
    offs_sep = [disk_offsets(s) for s in seps]
    offs_test = [disk_offsets(t) for t in tests]

    def stamp(pts):
        for occ, (dy, dx) in zip(occ_sep + occ_test, offs_sep + offs_test):
            ys = np.clip(pts[:, 0:1] + dy, 0, h - 1)
            xs = np.clip(pts[:, 1:2] + dx, 0, w - 1)
            occ[ys, xs] = True

    if blocked.any():                              # existing lines keep hatching one pitch away
        pts = np.argwhere(blocked)
        dy, dx = disk_offsets(pitch_px)
        ys = np.clip(pts[:, 0:1] + dy, 0, h - 1)
        xs = np.clip(pts[:, 1:2] + dx, 0, w - 1)
        for occ in occ_sep + occ_test:
            occ[ys, xs] = True

    def level(y, x):
        return levels[y, x]

    def trace(y, x, sign):
        pts, py, px = [], float(y), float(x)
        vx, vy = ux[y, x] * sign, uy[y, x] * sign
        for _ in range(4000):
            px, py = px + vx, py + vy
            iy, ix = int(round(py)), int(round(px))
            if not (0 <= iy < h and 0 <= ix < w) or not dense[iy, ix] or occ_test[level(iy, ix)][iy, ix]:
                break
            pts.append((iy, ix))
            nx, ny = ux[iy, ix], uy[iy, ix]
            if nx * vx + ny * vy < 0:                 # orientation has no sign: keep going the same way
                nx, ny = -nx, -ny
            vx, vy = nx, ny
        return pts

    lines = []
    step = max(1, int(pitch_px / 3))
    for y in range(0, h, step):
        for x in range(0, w, step):
            if not dense[y, x] or occ_sep[level(y, x)][y, x]:
                continue
            line = trace(y, x, -1)[::-1] + [(y, x)] + trace(y, x, 1)
            if len(line) < min_len_px:
                continue
            pts = np.array(line)
            lines.append(pts)
            stamp(pts)
    return lines


def thin(ink, pitch_px, min_len_px, keep_mask=None, pen_px=0.0, long_min_px=None, cross=True):
    """Returns (skeleton of the input, kept skeleton).

    keep_mask: areas (lettering) whose strokes are drawn as centerlines without any thinning.
    """
    h, w = ink.shape
    keep_mask = np.zeros((h, w), bool) if keep_mask is None else keep_mask
    long_min_px = 15 * pitch_px if long_min_px is None else long_min_px
    zone = np.zeros((N_BINS, h, w), bool)       # "a kept line runs within pitch of here, in this direction"
    kept = np.zeros((h, w), bool)
    ody, odx = disk_offsets(pitch_px)

    def keep(seg, sb):
        kept[seg[:, 0], seg[:, 1]] = True
        ys = np.clip(seg[:, 0:1] + ody, 0, h - 1)
        xs = np.clip(seg[:, 1:2] + odx, 0, w - 1)
        for off in (-1, 0, 1):                    # within 22.5 degrees counts as parallel
            zone[((sb + off) % N_BINS)[:, None].repeat(ys.shape[1], 1), ys, xs] = True

    def keep_pieces(pieces, thin_parallel=True):
        """Longest first; drop the parts that run parallel to a kept line closer than the pitch."""
        for pts in sorted(pieces, key=len, reverse=True):
            bins = direction_bins(pts)
            free = ~zone[bins, pts[:, 0], pts[:, 1]] if thin_parallel else np.ones(len(pts), bool)
            for a, b in free_runs(free):
                whole = a == 0 and b == len(pts)  # a short piece that is all free is part of a shape
                if b - a < min_len_px and not whole:
                    continue
                keep(pts[a:b], bins[a:b])

    # Pass 1: lettering (--keep areas) is drawn as is.
    letters = skeletonize(close_one_px_gaps(ink & keep_mask))
    pieces, junction_k = split_pieces(letters)
    keep_pieces(pieces, thin_parallel=False)
    kept |= junction_k

    # Lines closer than the pen width merge on paper anyway, so merge them first (one centerline).
    free_ink = ink & ~keep_mask
    merged = nd.binary_closing(free_ink, structure=disk_struct(pen_px / 2)) if pen_px >= 2 else free_ink
    merged_skel = skeletonize(merged)

    # Pass 2: long, line-like strokes are structure (frame, ribbon edges, horizon): they go first.
    width = 2 * nd.distance_transform_edt(merged)
    pieces, _ = split_pieces(merged_skel)
    structural = [p for p in pieces if len(p) >= long_min_px
                  and np.median(width[p[:, 0], p[:, 1]]) <= max(3.0, 1.6 * pen_px)]
    keep_pieces(structural)

    # Pass 3: dense shading is redrawn as streamlines whose spacing matches the original tone
    # (a pen line of width w every s mm covers w/s of the card), following the engraving's direction,
    # with a contour where the shading meets white paper (that is the subject's silhouette).
    tone = nd.gaussian_filter(free_ink.astype(float), pitch_px * 0.8)
    pen_share = pen_px / pitch_px if pen_px else 0.5
    thresholds = [pen_share / m for m in SPACINGS]          # tone needed for each spacing level
    levels = np.full((h, w), len(SPACINGS) - 1)
    for i in reversed(range(len(SPACINGS))):
        levels[tone >= thresholds[i]] = i
    # shading is a broad area: at least ~2.4 mm across (small letters and outlines aren't shading)
    dense = nd.binary_opening(tone >= thresholds[-1], structure=disk_struct(1.2 * pitch_px))
    dense = nd.binary_fill_holes(nd.binary_closing(dense, structure=disk_struct(pitch_px / 2))) & ~keep_mask
    edge = dense & ~nd.binary_erosion(dense, structure=EIGHT)
    edge &= nd.binary_dilation(free_ink, structure=disk_struct(3))      # only where there is real ink
    edge &= nd.binary_dilation(tone < PAPER_TONE, structure=disk_struct(pitch_px))   # and blank card beyond
    pieces, _ = split_pieces(skeletonize(nd.binary_dilation(edge, structure=EIGHT)))
    keep_pieces(pieces, thin_parallel=False)
    ux, uy = stroke_orientation(free_ink, sigma=pitch_px * 0.4)
    structure = kept.copy()
    hatch_area = nd.binary_erosion(dense, structure=EIGHT)
    for pts in streamline_hatch(hatch_area, levels, ux, uy, pitch_px, min_len_px, blocked=structure):
        keep(pts, direction_bins(pts))
    # the darkest areas get a second, crossing layer two pitches apart (classic engraving cross-hatch)
    darkest = nd.binary_opening(hatch_area & (tone >= CROSS_TONE), structure=disk_struct(pitch_px)) if cross \
        else np.zeros((h, w), bool)
    cross_levels = np.full((h, w), SPACINGS.index(2.0))
    for pts in streamline_hatch(darkest, cross_levels, -uy, ux, pitch_px, min_len_px, blocked=structure):
        keep(pts, direction_bins(pts))

    # Pass 4: lines in sparse areas keep their own shape, minus parallel crowding.
    sparse_skel = merged_skel & ~nd.binary_dilation(dense, structure=disk_struct(2))
    pieces, junction = split_pieces(sparse_skel)
    keep_pieces(pieces)

    # put back junction pixels that join kept strokes, then drop specks
    kept |= junction & nd.binary_dilation(kept, structure=EIGHT)
    lab, n = nd.label(kept & ~keep_mask, structure=EIGHT)
    if n:
        sizes = nd.sum(kept, lab, range(1, n + 1))
        kept &= ~np.isin(lab, np.nonzero(sizes < min_len_px)[0] + 1)
    return skeletonize(ink), kept


def drop_specks(ink, min_len_px, near_px):
    """Remove stray ink blobs smaller than min_len_px (each would plot as a blot).

    A small blob within near_px of a real stroke is texture (whisker dots, stipple), so it stays.
    """
    lab, n = nd.label(ink, structure=EIGHT)
    small = np.zeros(n + 1, bool)
    for i, sl in enumerate(nd.find_objects(lab), start=1):
        small[i] = max(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start) < min_len_px
    strokes = ink & ~small[lab]
    near = nd.binary_dilation(strokes, structure=disk_struct(near_px)) if strokes.any() else strokes
    stray = small[lab] & ink
    keep_ids = np.unique(lab[stray & near])
    stray &= ~np.isin(lab, keep_ids)
    return ink & ~stray, n


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("layers", nargs="+")
    ap.add_argument("--card", required=True, help="card in inches, WxH, e.g. 4x6")
    ap.add_argument("--style", choices=("keep", "thin"), default="keep",
                    help="keep: the art as drawn, minus specks (default). thin: redraw dense shading "
                         "at the pen's pitch so it can't merge into a solid mass")
    ap.add_argument("--pen", type=float, default=0.5, help="line width the pen leaves on the card, mm (default 0.5)")
    ap.add_argument("--gap", type=float, default=0.5, help="white space to keep between parallel lines, mm (default 0.5)")
    ap.add_argument("--min-length", type=float, default=0.8, help="drop strokes shorter than this, mm (default 0.8)")
    ap.add_argument("--draw-width", type=float, default=0.3, help="width of the output lines, mm (default 0.3)")
    ap.add_argument("--keep-color", action="store_true", help="draw in the layer's ink color instead of black")
    ap.add_argument("--no-cross", action="store_true", help="don't cross-hatch the darkest areas")
    ap.add_argument("--keep", action="append", default=[], metavar="X0,Y0,X1,Y1",
                    help="pixel box drawn as is, never thinned (lettering); repeat for more boxes")
    ap.add_argument("--out-dir", default=None, help="output folder (default: print/ next to each input)")
    a = ap.parse_args()

    for path in map(Path, a.layers):
        ink, color = load_ink(path)
        mmpp = mm_per_px(ink.shape, a.card)
        out_dir = Path(a.out_dir) if a.out_dir else path.parent / "print"
        out_dir.mkdir(parents=True, exist_ok=True)
        if a.style == "keep":
            clean, n = drop_specks(ink, a.min_length / mmpp, 1.5 / mmpp)
            rgb = np.full(ink.shape + (3,), 255, np.uint8)
            rgb[clean] = color.astype(np.uint8) if a.keep_color else 0
            Image.fromarray(rgb).save(out_dir / path.name)
            removed = n - nd.label(clean, structure=EIGHT)[1]
            print(f"{path.name}: kept as drawn, removed {removed} specks under {a.min_length} mm "
                  f"| -> {out_dir / path.name}")
            continue
        pitch_px = (a.pen + a.gap) / mmpp
        keep_mask = np.zeros(ink.shape, bool)
        for box in a.keep:
            x0, y0, x1, y1 = (int(v) for v in box.split(","))
            keep_mask[y0:y1, x0:x1] = True
        skel, kept = thin(ink, pitch_px, a.min_length / mmpp, keep_mask, a.pen / mmpp, LONG_LINE_MM / mmpp,
                          cross=not a.no_cross)

        r = a.draw_width / mmpp / 2
        line = nd.binary_dilation(kept, structure=disk_struct(r)) if r >= 1 else kept
        rgb = np.full(ink.shape + (3,), 255, np.uint8)
        rgb[line] = color.astype(np.uint8) if a.keep_color else 0
        Image.fromarray(rgb).save(out_dir / path.name)

        before, after = skel.sum() * mmpp / 1000, kept.sum() * mmpp / 1000
        n_before = nd.label(skel, structure=EIGHT)[1]
        n_after = nd.label(kept, structure=EIGHT)[1]
        print(f"{path.name}: {mmpp:.3f} mm/px, pitch {pitch_px:.1f} px | line length {before:.1f} m -> {after:.1f} m "
              f"({100 * after / max(before, 1e-9):.0f}%) | connected strokes {n_before} -> {n_after} | -> {out_dir / path.name}")


if __name__ == "__main__":
    main()
