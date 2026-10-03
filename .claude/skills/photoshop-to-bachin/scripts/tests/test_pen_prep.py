"""CLI tests for pen_prep.py: make a pen layer printable with a given pen width."""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPT = Path(__file__).resolve().parent.parent / "pen_prep.py"

# 1016 x 1524 px fits a 4x6 card exactly, so 1 px = 0.1 mm.
W, H = 1016, 1524


def run(tmp_path, ink, *args):
    src = tmp_path / "card-black.png"
    Image.fromarray(np.where(ink, 0, 255).astype(np.uint8), "L").save(src)
    out_dir = tmp_path / "print"
    res = subprocess.run(
        [sys.executable, str(SCRIPT), str(src), "--card", "4x6", "--out-dir", str(out_dir), *args],
        capture_output=True, text=True,
    )
    assert res.returncode == 0, res.stderr
    out = np.asarray(Image.open(out_dir / "card-black.png").convert("L")) < 128
    return out, res.stdout


def line_centers(column):
    """Centers of the ink runs down one pixel column."""
    centers, start = [], None
    for y, v in enumerate(column):
        if v and start is None:
            start = y
        if not v and start is not None:
            centers.append((start + y - 1) / 2)
            start = None
    return centers


def test_dense_hatching_is_thinned_to_the_pen_pitch(tmp_path):
    ink = np.zeros((H, W), bool)
    for y in range(300, 700, 4):          # 2 px lines every 0.4 mm, 30 mm long
        ink[y:y + 2, 200:500] = True

    out, _ = run(tmp_path, ink, "--style", "thin", "--pen", "0.5", "--gap", "0.5")

    centers = line_centers(out[:, 350])
    gaps = np.diff(centers)
    assert len(centers) >= 30                      # the hatching is thinned, not wiped out
    assert gaps.min() >= 9.5                       # 0.5 mm pen + 0.5 mm gap = 10 px pitch


def test_letter_e_keeps_all_three_bars(tmp_path):
    # A caption-size "E": 3.4 mm tall, bars 1.6 mm apart (wider than the 1.0 mm pitch).
    ink = np.zeros((H, W), bool)
    ink[500:534, 300:303] = True            # stem
    for y in (500, 516, 531):               # top, middle, bottom bars
        ink[y:y + 3, 300:322] = True

    out, _ = run(tmp_path, ink, "--style", "thin", "--pen", "0.5", "--gap", "0.5")

    for y in (501, 517, 532):
        assert out[y - 2:y + 3, 312:320].any(), f"bar at y={y} was dropped"


def test_specks_are_dropped_but_short_strokes_are_kept(tmp_path):
    ink = np.zeros((H, W), bool)
    ink[200:203, 200:203] = True            # 0.3 mm speck: would plot as a blot
    ink[400:402, 200:215] = True            # 1.5 mm dash: real art

    out, _ = run(tmp_path, ink, "--style", "thin", "--min-length", "0.8")

    assert not out[190:215, 190:215].any()
    assert out[395:407, 200:215].any()


def test_engraved_letter_stroke_becomes_one_line(tmp_path):
    # A letter stem drawn as two 2 px lines with a 1 px white line between them (0.5 mm wide in all):
    # the pen can't draw the white line, so the stem should come out as a single centerline.
    ink = np.zeros((H, W), bool)
    ink[500:540, 300:302] = True
    ink[500:540, 303:305] = True

    out, _ = run(tmp_path, ink, "--style", "thin")

    row = out[520, 290:315]
    runs = np.count_nonzero(np.diff(row.astype(int)) == 1)
    assert runs == 1


def test_outline_survives_next_to_dense_hatching(tmp_path):
    # A 5 mm square of 0.4 mm hatching inside a thick outline; the hatch touches the outline.
    ink = np.zeros((H, W), bool)
    ink[400:404, 300:350] = True; ink[446:450, 300:350] = True   # top / bottom outline
    ink[400:450, 300:304] = True; ink[400:450, 346:350] = True   # left / right outline
    for y in range(406, 445, 4):
        ink[y:y + 2, 304:346] = True                              # hatch, touching both sides

    out, _ = run(tmp_path, ink, "--style", "thin")

    assert out[395:410, 325].any() and out[440:455, 325].any()   # top and bottom edges kept
    assert out[425, 295:310].any() and out[425, 340:355].any()   # left and right edges kept
    assert len(line_centers(out[408:444, 325])) <= 4             # inside: ~1 mm pitch, not 9 lines


def test_keep_box_preserves_lettering_exactly(tmp_path):
    # Bold engraved lettering is as dense as shading, so it must be marked: inside --keep the
    # letter strokes are drawn as centerlines and never thinned, even when bars are < 1 mm apart.
    ink = np.zeros((H, W), bool)
    ink[500:530, 300:305] = True                    # stem, 0.5 mm wide
    for y in (500, 512, 525):                        # bars only 1.2-1.3 mm apart, 0.5 mm thick
        ink[y:y + 5, 300:325] = True

    out, _ = run(tmp_path, ink, "--style", "thin", "--keep", "290,490,340,540")

    for y in (502, 514, 527):
        assert out[y - 2:y + 3, 315:322].any(), f"bar at y={y} was dropped"


def test_long_frame_line_survives_beside_dense_shading(tmp_path):
    # A 60 mm card-border line that runs through dense hatching for half its length
    # (like the trees against the frame): the border must stay one continuous line.
    ink = np.zeros((H, W), bool)
    ink[200:800, 50:54] = True
    for x in range(20, 300, 4):
        ink[300:600, x:x + 2] = True

    out, _ = run(tmp_path, ink, "--style", "thin")

    border_rows = out[200:800, 45:60].any(axis=1)
    assert border_rows.mean() > 0.95


def test_keep_style_leaves_the_art_alone_but_drops_specks(tmp_path):
    ink = np.zeros((H, W), bool)
    for y in range(300, 400, 4):                     # dense engraving hatch: kept exactly as drawn
        ink[y:y + 2, 200:500] = True
    ink[600:602, 600:602] = True                     # stray 0.2 mm dot: dropped

    out, _ = run(tmp_path, ink, "--style", "keep")

    assert (out[300:400, 200:500] == ink[300:400, 200:500]).all()
    assert not out[590:612, 590:612].any()


def test_keep_style_keeps_texture_dots_among_other_ink(tmp_path):
    # Whisker dots on a muzzle sit among other strokes: they are drawing, not stray specks.
    ink = np.zeros((H, W), bool)
    ink[500:502, 400:600] = True                     # a line (the muzzle edge)
    for x in range(420, 580, 15):
        ink[510:513, x:x + 3] = True                 # 0.3 mm dots 1 mm below it

    out, _ = run(tmp_path, ink, "--style", "keep")

    assert out[508:515, 420:580].sum() >= 9 * 9 * 0.9
