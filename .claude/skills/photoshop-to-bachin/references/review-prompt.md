# Review prompt for a fresh subagent

Fill in the paths, then hand this to a general-purpose subagent. It's read-only, and it reports back in under 400 words.

---

You are reviewing a pen-plotter rendering of a greeting card. Give critical, specific, actionable feedback.
Read-only: don't modify any files. Crop and zoom with Python/PIL in `<scratch dir>` to compare details.

Images (open them with Read):
1. The source design, split into pen layers: `<plotter-layers/card-*.png>` (or the original art `<path>`).
2. The predicted plot, a full card at 300 dpi, strokes drawn at the measured pen width: `<preview.png>`.
3. Optionally, a side-by-side screenshot from the user: `<path>`.

How the prediction was made:
- BACHIN TA4 pen plotter, `<pen model>` pens, one pen per colour. A pen draws lines only, no fills.
- Layers were traced in the controller's `<Centerline/Outline>` mode at Detail `<Ultra>`, threshold 170, or generated
  as vector strokes. Note any extra processing (doubling, scaling, smoothing).
- Measured limits from calibration plots: line width `<0.25–0.35 mm>`. Parallel lines must be at least 0.8 mm apart to
  stay open, and lines 0.5 mm apart or more read as two lines. Text under about 1.8 mm clogs. Dots under about 0.8 mm
  fade. A stroke that crosses itself many times knots up.
- The plan file: `<plan.boc.json>`; the scripts: `<paths>`.

Evaluate each element (lettering, rules, ornaments, illustrations, tone): how faithful the plot is to the source, and
how it will look printed. For each problem, give its cause and a concrete fix this pipeline can do (re-trace in another
mode, re-split, redraw as vector strokes in code, change the size, drop or change the doubling). Rank the fixes by visual
impact against effort, and list what already works and should be left alone.

Report: a 1-line verdict, the ranked issues with cause and fix, and what to keep. Under 400 words.
