---
name: photoshop-to-bachin
description: Take card art from an image or Photoshop file to a print-ready Bachin Open Controller plan for the BACHIN pen plotter. Covers checking that the art is plottable, splitting colors into one PNG per pen with Select > Color Range, checking the exported layers, importing and tracing them in the controller, fitting the plan to a card size and corner (4x6, 5x7), measuring a pen with a test card, previewing the print at the real pen width, and the plotting checklist. Use this whenever the user is making a plotter card, mentions Bachin, the plotter, pen layers, a .boc.json plan, splitting colors for the plotter, or scaling or placing artwork on a card, even if they don't name the skill.
---

# Photoshop → Bachin pen plot

Turns card art into a plan the BACHIN plotter can draw, one pen color per layer, with the layers lined up.

## The setup (why some steps matter)

Scripts live next to this file in `scripts/`. Below, `<skill>` means this skill's folder; run the commands from the card folder.

- **Machine:** BACHIN TA4 pen plotter. The bed is 180 × 210 mm (7.09 × 8.27 in), with the origin at the **top-left**.
  Never connect to or drive the machine from this workflow. Prepare the files, and let the user run the plot
  (often from a different computer than the one doing the prep).
- **Controller:** Bachin Open Controller, this repository's Electron app.
  It traces each PNG into pen strokes **by darkness**, and it only runs **one shown layer** at a time.
  Since v0.0.10 (PR #13) it has **"Layers linked"** (on by default with 2+ layers), so moving or resizing one layer moves all of them.
  The installed copy on the plotter computer may be older. That's fine for plotting, because a saved plan already stores
  each layer's position and scale.
- **Card folders:** keep one folder per card with the `.psd`, a `plotter-layers/` folder of per-pen PNGs named
  `<card>-<color>.png`, and the saved plans (`*.boc.json`). If the working folder has a `CLAUDE.md` or a prompt-notes
  file, read it first: it holds local conventions and lessons from earlier cards.

## Workflow

### 1. Check that the art is plottable
A pen draws lines, so look at the source image for:
- **Solid fills:** a filled shape becomes thousands of back-and-forth strokes (one filled sign on a past card took about 34,000).
  Ask for outlines or hatching instead.
- **Glows, gradients, soft shading:** these turn into noise when traced. The fix is a *targeted edit* of the image, not a
  regeneration, so a pose or face the user likes isn't lost. Describe the rendering you want ("re-render X in the same
  pen-and-ink engraving style as the rest, hatch lines that follow its form, no flat fill").
- **Dense hatching:** lines that are fine at full size merge when scaled down. A 0.1 mm pen helps.
- **Lettering:** image generators misspell. Spell-check every word against the intended text.
- **Colors touching:** two inks that overlap get drawn twice.

### 2. Split colors in Photoshop (one layer per pen)
Use **Select > Color Range**, which is the user's method:
1. Open the art. Image > Mode > RGB if it isn't already.
2. Select > Color Range > *Sampled Colors*. Click a line of the first ink color with the eyedropper.
   Start with **Fuzziness around 40–60**: high enough to pick up anti-aliased edges, low enough not to grab the other ink.
   Shift-click to add shades of the same ink. Check the preview: that ink should be white, everything else black.
3. OK, then **Cmd+J** to copy the selection to its own layer. Name it after the pen color.
4. Repeat for each ink, always selecting from the original image layer.
5. **If an ink is light** (yellow, pale green), make that layer black: Image > Adjustments > Hue/Saturation, Lightness −100.
   The controller traces by darkness, and the pen supplies the color.

### 3. Export each layer at the full canvas size
For each pen layer: hide every other layer, including the original, then **File > Export > Export As > PNG** on the document.
- **Don't** right-click the layer and export it. That trims to the layer's contents. On one past card the blue layer came out
  588×889 against a 600×900 black layer that way, so the layers couldn't line up.
- **Don't** rename a `.psd` to `.png`. The controller rejects it.
- Transparent background is fine, because the controller treats transparency as white paper.
- Save into `<card folder>/plotter-layers/<card>-<color>.png`.

### 4. Check the exported layers
```bash
python3 <skill>/scripts/check_layers.py plotter-layers/*.png --card 4x6
```
It FAILs on mismatched pixel sizes or a renamed PSD. It WARNs on solid fills, light ink that won't trace, and lines that
appear in two layers. It also prints the size the art will reach on the card. Fix any FAIL before going on.

### 4b. Optional: prep for the pen and preview the print
The controller previews every stroke as a hairline, so it can't show where ink will merge. These scripts can:
```bash
python3 <skill>/scripts/pen_prep.py plotter-layers/*.png --card 4x6 --pen 0.25       # writes plotter-layers/print/
python3 <skill>/scripts/simulate_print.py plotter-layers/print/*.png --card 4x6 --pen 0.25 -o preview.png
```
- `pen_prep.py --style keep` (the default) leaves the art as drawn and only drops isolated specks shorter than
  `--min-length` (0.8 mm). Specks near a real stroke, like whisker dots and fur dashes, are kept. Use `--keep-color` for a
  colored layer. `--style thin` redraws dense hatching at the pen's pitch. The user has preferred the as-drawn look, so
  only offer thin as an option, with a simulation beside it.
- `simulate_print.py` draws each stroke at the real pen width in its ink color, writes `preview-muddy.png` (areas where ink
  covers >70% are tinted red), and for a plan prints strokes, draw/travel length and an estimated time.
- **Always pass the measured `--pen`** (see "Pens" below). The scripts default to 0.5 mm, which is too wide for the V5.

### 5. Trace in the controller, on this computer
On the Artwork tab, use **Open file** for each PNG. Each one becomes a layer.
- Raster mode **Centerline** ("finds the skeleton midline of strokes"), Detail **Ultra**, threshold **170**.
- **Change both settings for every import.** A fresh import starts as **Outline + Draft** (`Canvas.tsx:343-344`). Outline
  draws each line as a narrow loop round its edges (hatch becomes hollow bars, letters become outlines). Draft shrinks the
  art to 320 px first, so it plots stair-stepped and loses thin lines.
- Detail sets the size the art is shrunk to before tracing: Draft 320, Normal 512, Fine 1024, **Ultra 1536**, Max 2048 px
  on the long side. Pick the smallest one that is at least the art's size, so nothing is shrunk. Shrinking averages hairlines
  with the paper until they fall under the threshold. That is how "THE" became "THF".
- Threshold 170 is the app default. Raise it if light lines drop out; lower it if paper texture turns into strokes.
- **Save plan.** It saves to Downloads as `<first layer>.png-<timestamp>.boc.json`. The trace settings are stored in the
  plan (`metadata.rasterSettings`).
- **Hand the user a finished, fitted `.boc.json`, never a PNG to import on the plotter computer.** Settings typed in
  instructions get lost there, and a fresh import there goes back to Outline + Draft.

### 6. Fit the plan to the card
Either type it in the controller (with "Layers linked" on, set **W** on any layer, then X/Y), or let the script do it.
The script is exact, and it works on plans that were already scaled or moved:
```bash
python3 <skill>/scripts/fit_plan.py ~/Downloads/<plan>.boc.json --card 4x6 --corner br
```
- `--card WxH` in inches, portrait (`4x6`, `5x7`). `--corner tl|tr|bl|br` picks the bed corner where the card is taped.
- `--inset 1` moves the card 1 in away from that corner's two bed edges (e.g. so it's easier to tape down).
- The art is scaled to fit inside the card (`--fit contain`) and centered on it, with every layer scaled by the same factor.
- It writes `<plan>-<card>-<corner>.boc.json` next to the input, and prints each layer's X/Y/W in inches.
- The art may reach the bed's edge (180 mm or 210 mm). If the machine stops short there, use `--margin 0.05`.

To show the user the result on this computer (the window stays open for them):
```bash
node <skill>/scripts/open_in_controller.cjs <fitted-plan>.boc.json /tmp/boc-preview.png
```
Run it in the background, wait for `READY`, then look at the screenshot. Each layer's printed X/Y should differ only by
a small alignment correction, and every layer should show the same scale.

### 7. Plotting checklist (for the user, on the plotter computer)
1. Open the fitted plan and tape the card to the chosen corner of the bed.
2. Machine tab → **Perimeter Test** at the card size, pen up, to confirm where the card sits.
3. Show **one layer** and hide the rest. Plot the **lightest color first**, so the darker ink covers any overlap.
4. Swap pens **without re-homing or moving the card**, show the next layer, and plot.
5. Try a new pen or paper on scrap first (see "Pens" below).

### 8. Log it
If the card folder keeps a prompt log, add a row: the card, the prompt and edits, what worked, what to change next time.

## Pens: measure, don't guess
A pen's nominal size isn't the line it leaves. Calibrate each new pen or paper once:
```bash
python3 <skill>/scripts/make_test_card.py -o pen-test-4x6.png \
  [--sample plotter-layers/card-black.png --sample-box X0,Y0,X1,Y1 --label "as drawn" ...]
```
It draws hatch and cross-hatch patches at 0.5–1.2 mm, line pairs 0.2–0.8 mm apart, dashes 0.3–2 mm, lettering 2–5 mm,
and optional crops of real art at plotting scale. Trace it at Centerline/Ultra, fit it, and hand over the plan (step 5).
To measure, have the user scan the result at 300 dpi. Find the line width and gaps from the scan, not from a photo.

**Pilot V5 Precise 0.5 mm (liquid ink), measured 2026-10-02 on copy paper:**

| Test | Result |
|---|---|
| Line width on paper | **~0.25 mm**, so use `--pen 0.25` |
| Single hatch | stays open at every spacing tested, down to 0.5 mm |
| Cross-hatch | solid at 0.5, dense at 0.6–0.7, **open from 0.8 mm** |
| Two parallel lines | merge at 0.2–0.4 mm; **read as two from 0.5 mm** apart |
| Dashes | under 0.8 mm they fade rather than blot; 0.8 mm and longer are clean |
| Lettering | 2 mm is legible |
| Engraving art (0.4 mm hatch at 4x6) | prints dark but readable, not a blob, when traced at Centerline/Ultra |

Card stock may spread ink more than copy paper. Re-check on the real stock before a big run.

## Gotchas learned the hard way
- **The same scale % on separate layers doesn't keep them lined up** in controller builds before PR #13, because each layer
  scales around its own center. Use "Layers linked" or `fit_plan.py`, never per-layer typing on an old build.
- **Importing a plan while another is open merges them**, adding layers instead of replacing. Clear the canvas first.
- **"G-code 0 lines" with 2+ layers shown** is expected, because only one shown layer can run.
- **Mixed ink in one layer:** if a check shows overlap between layers, lower the Color Range Fuzziness or erase the shared pixels.
- **Hollow bars, outlined letters, stair-steps, missing frame edges:** the layer was traced with the import defaults
  (Outline + Draft). Re-trace at Centerline/Ultra. The first pen test plotted this way and taught nothing about the pen.
- **"THE" plotted as "THF", rules under the caption missing:** Detail was below the art's size (Fine on 1523 px art).
  Use Ultra.
- **Engraving plotted as a solid black mass:** first check the trace settings (above), then simulate at the measured pen
  width. Don't thin the art until a simulation shows it really merges.
