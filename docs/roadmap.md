# Roadmap

## Phase 0: Planning

- Define scope and legal boundaries.
- Capture known machine settings.
- Choose initial app stack.
- Decide profile file format.

## Phase 1: GRBL Connection Prototype

- List serial ports.
- Connect at configurable baud rate.
- Read startup banner.
- Send simple commands.
- Poll status with `?`.
- Implement unlock, soft reset, and safe disconnect.

## Phase 2: Job Streaming Core

- Build a line-by-line G-code sender.
- Track accepted lines and progress.
- Handle `ok`, `error`, `ALARM`, and disconnects.
- Add pause, resume, cancel, and tool-off-on-cancel.
- Add fake GRBL test server.

## Phase 3: SVG To Pen Plot

- Import simple SVG paths.
- Normalize coordinates to millimeters.
- Scale, translate, rotate, and compute bounds.
- Generate pen-up travel and pen-down drawing G-code.
- Preview job order and extents.

## Phase 4: Usable MVP

- ✅ Connect/start/pause/stop controls.
- ✅ Manual pen controls (pen up/down, safe position).
- ✅ SVG and raster image (PNG/JPG) import.
- ✅ Canvas work area preview with grid overlay.
- ✅ Image drag-to-move and scale (corner handle + numeric controls).
- ✅ G-code regeneration on every transform change.
- ✅ Save/load project files.
- ✅ Basic Windows packaging (Squirrel installer).
- ⏳ Machine profile editor UI.
- ⏳ Artwork rotation on canvas.

## Phase 5: Feature Growth

- DXF import.
- Text and single-line font support.
- QR code generation.
- Image tracing.
- Laser mode with PWM controls.
- Multi-color pen prompts.
- More machine presets.

