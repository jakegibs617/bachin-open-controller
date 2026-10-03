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


def write_plan(tmp_path, paths, speeds=None):
    obj = {"id": "a", "type": "raster_image", "visible": True, "previewColor": "#000000",
           "transform": {"x": 0, "y": 0, "scale": 100, "scaleY": 100, "rotation": 0},
           "paths": paths,
           "metadata": {"fileName": "card-black.png",
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
