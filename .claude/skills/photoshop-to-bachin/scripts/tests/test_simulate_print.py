"""CLI tests for simulate_print.py: preview a card at the real pen width, with plot stats."""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPT = Path(__file__).resolve().parent.parent / "simulate_print.py"


def path(pid, pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return {"id": pid, "segments": [{"x": x, "y": y, "penDown": i > 0} for i, (x, y) in enumerate(pts)],
            "bounds": {"minX": min(xs), "maxX": max(xs), "minY": min(ys), "maxY": max(ys)}}


def write_plan(tmp_path, paths, speeds=None, transform=None, file_name="card-black.png", preview_color="#000000"):
    obj = {"id": "a", "type": "raster_image", "visible": True, "previewColor": preview_color,
           "transform": {"x": 0, "y": 0, "scale": 100, "scaleY": 100, "rotation": 0, **(transform or {})},
           "paths": paths,
           "metadata": {"fileName": file_name,
                        "actionSpeeds": speeds or {"travelSpeed": 6000, "drawingSpeed": 1600, "penSpeed": 6000}}}
    plan = {"id": "p", "name": "t", "canvas": {"width": 180, "height": 210}, "objects": [obj]}
    f = tmp_path / "t.boc.json"
    f.write_text(json.dumps(plan))
    return f


def run(*args):
    res = subprocess.run([sys.executable, str(SCRIPT), *map(str, args)], capture_output=True, text=True)
    assert res.returncode == 0, res.stderr
    return res.stdout


def test_plan_stats_count_strokes_lengths_and_time(tmp_path):
    # Two strokes: (10,10)->(110,10) then (110,20)->(110,60). Pen starts at the origin.
    plan = write_plan(tmp_path, [path(1, [(10, 10), (110, 10)]), path(2, [(110, 20), (110, 60)])])

    out = run(plan, "--pen", "0.5", "-o", tmp_path / "preview.png")

    line = next(l for l in out.splitlines() if "card-black.png" in l)
    assert "2 strokes" in line
    assert "draw 0.14 m" in line                      # 100 + 40 mm
    assert "travel 0.02 m" in line                    # 14.1 mm to the first stroke + 10 mm between
    # 140 mm at 1600 mm/min + 24.1 mm at 6000 mm/min = 5.25 + 0.24 s ~ 5.5 s
    assert "~0.1 min" in line


def test_preview_draws_lines_at_the_pen_width(tmp_path):
    plan = write_plan(tmp_path, [path(1, [(10, 50), (150, 50)])])
    out_png = tmp_path / "preview.png"

    run(plan, "--pen", "0.5", "--dpi", "254", "-o", out_png)   # 254 dpi: 1 px = 0.1 mm

    im = np.asarray(Image.open(out_png).convert("L")) < 128
    col = im[:, im.shape[1] // 2]
    assert 4 <= col.sum() <= 6                         # 0.5 mm line = 5 px


def ink_runs(mask_line):
    """Lengths of the ink runs along one row or column."""
    runs, n = [], 0
    for v in mask_line:
        if v:
            n += 1
        elif n:
            runs.append(n); n = 0
    return runs + ([n] if n else [])


def test_rotated_layer_previews_rotated(tmp_path):
    # A 40 mm horizontal line, rotated 90 degrees around the layer centre, plots as a 40 mm vertical line.
    plan = write_plan(tmp_path, [path(1, [(30, 50), (70, 50)])], transform={"rotation": 90})
    out_png = tmp_path / "preview.png"

    run(plan, "--pen", "0.5", "--dpi", "254", "-o", out_png)    # 1 px = 0.1 mm

    im = np.asarray(Image.open(out_png).convert("L")) < 128
    assert im.shape[0] > im.shape[1]                            # taller than wide
    col = im[:, im.shape[1] // 2]
    assert max(ink_runs(col)) >= 395                            # ~400 px tall


def test_flipped_layer_previews_mirrored(tmp_path):
    # An L shape flipped horizontally: its foot points left instead of right.
    plan = write_plan(tmp_path, [path(1, [(50, 10), (50, 50), (70, 50)])], transform={"flipX": True})
    out_png = tmp_path / "preview.png"

    run(plan, "--pen", "0.5", "--dpi", "254", "-o", out_png)

    im = np.asarray(Image.open(out_png).convert("L")) < 128
    ys, xs = np.where(im)
    vertical_x = np.median(xs[ys < ys.min() + 100])             # x of the upright stroke
    foot = xs[ys > ys.max() - 3]
    assert foot.mean() < vertical_x                             # the foot is on the left


def test_plan_layer_uses_its_preview_color_over_a_word_in_its_name(tmp_path):
    # "colored.png" contains "red", but the plan says the layer is green.
    plan = write_plan(tmp_path, [path(1, [(10, 50), (150, 50)])], file_name="colored.png", preview_color="#00a000")
    out_png = tmp_path / "preview.png"

    run(plan, "--pen", "0.5", "--dpi", "254", "-o", out_png)

    rgb = np.asarray(Image.open(out_png).convert("RGB")).astype(int)
    ink = rgb[rgb.sum(-1) < 600]
    r, g, b = ink.mean(0)
    assert g > r + 50                                   # green, not red


def test_png_layers_of_different_sizes_stop_with_a_clear_message(tmp_path):
    a, b = tmp_path / "card-black.png", tmp_path / "card-green.png"
    Image.new("L", (600, 900), 255).save(a)
    Image.new("L", (588, 889), 255).save(b)

    res = subprocess.run([sys.executable, str(SCRIPT), str(a), str(b), "--card", "4x6", "-o", str(tmp_path / "p.png")],
                         capture_output=True, text=True)

    assert res.returncode != 0
    assert "588x889" in res.stderr and "600x900" in res.stderr
    assert "Traceback" not in res.stderr


def test_default_pen_is_the_measured_v5_width(tmp_path):
    plan = write_plan(tmp_path, [path(1, [(10, 50), (150, 50)])])
    out_png = tmp_path / "preview.png"

    run(plan, "--dpi", "254", "-o", out_png)                   # no --pen: 0.35 mm = 3.5 px

    im = np.asarray(Image.open(out_png).convert("L")) < 128
    assert 3 <= im[:, im.shape[1] // 2].sum() <= 4
