"""CLI tests for make_test_card.py: a pen calibration card, with optional crops of real art."""
import subprocess
import sys
from pathlib import Path

from PIL import Image

SCRIPT = Path(__file__).resolve().parent.parent / "make_test_card.py"


def run(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *map(str, args)], capture_output=True, text=True)


def test_makes_a_4x6_card_at_a_tenth_of_a_mm_per_pixel(tmp_path):
    out = tmp_path / "card.png"
    res = run("-o", out)
    assert res.returncode == 0, res.stderr
    assert Image.open(out).size == (1016, 1524)


def test_samples_that_run_off_the_card_are_skipped_not_a_crash(tmp_path):
    big = tmp_path / "art.png"
    Image.new("L", (900, 1400), 0).save(big)                    # each sample nearly fills the card
    out = tmp_path / "card.png"

    res = run("-o", out, "--sample", big, "--sample", big, "--sample", big)

    assert res.returncode == 0, res.stderr
    assert out.exists()
    assert "skipped" in res.stdout
