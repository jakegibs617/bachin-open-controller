# Bachin Open Controller

An open, from-scratch controller for GRBL-based Bachin-style pen plotters, writing machines, and small laser/drawing machines.

## Project Structure

```
src/
├── core/
│   ├── serial-grbl/        Phase 1: GRBL serial communication
│   ├── geometry/           Phase 2: Coordinate transforms and bounds
│   └── gcode/              Phase 3: G-code generation
├── importers/
│   └── svg/                Phase 2: SVG file parsing
├── ui/
│   ├── pages/              Phase 4: Canvas, Controls, Settings pages
│   ├── components/         Phase 4: Reusable UI components
│   └── App.tsx             Phase 4: Root component
├── types/                  Shared TypeScript types

electron/
├── main.ts                 Phase 4: Main process
└── preload.ts              Phase 4: IPC bridge

tests/                      Unit and integration tests
profiles/                   Machine profiles (ta4.json, etc.)
```

## Phases

### Phase 0: Hardware Protocol Discovery (BLOCKING for Phase 1)
- Test TA4 serial connection
- Confirm pen up/down command format
- Lock machine profile

### Phase 1: GRBL Connection & Streaming Core
- Serial port detection and connection
- G-code line-by-line streaming with backpressure
- Status polling and response parsing
- Pause/resume/cancel with safe tool-off
- Fake GRBL server for testing

### Phase 2: Geometry & SVG Import
- 2D transform engine (translate, rotate, scale)
- Bounding box calculations
- SVG parsing and path extraction
- Unit conversion (px to mm)
- Curve sampling (Bezier to line segments)

### Phase 3: G-code Generation
- Pen plotter G-code synthesis
- Safety validation (bounds, coordinates)
- Profile-specific command injection
- Warning system for boundary violations

### Phase 4: MVP UI & Integration
- Electron main/renderer process
- React UI with Canvas, Controls, Settings pages
- Project save/load (JSON format)
- IPC communication for serial and file I/O
- End-to-end workflow testing

### Phase 5: Feature Growth (Post-MVP)
- DXF import
- Text + single-line fonts
- QR code generation
- Image tracing
- Laser mode with PWM
- Multi-color pen management
- Advanced path optimization
- Manual jog controls

## Machine Profile Format

See `profiles/ta4.json` for example structure. Profiles define:
- Work area dimensions
- Baud rate and connection settings
- Pen/laser control commands
- Startup/shutdown sequences
- Safe movement parameters

## Getting Started

```bash
# Install dependencies (after Phase 0)
npm install

# Run tests
npm test

# Start dev server (Phase 4)
npm run dev

# Build for distribution
npm run package
```

## Implementation Status

### ✅ Phase 0 — Hardware Protocol Discovery
- TA4 serial connection confirmed
- Pen up/down command format validated on hardware
- Machine profile (`profiles/ta4.json`) locked

### ✅ Phase 1 — GRBL Connection & Streaming Core
- Serial port detection and connection (via Electron IPC)
- Line-by-line G-code streaming with backpressure (`ok`-gated)
- Status polling and GRBL response parsing
- Pause / resume / cancel with safe pen-up on cancel

### ✅ Phase 2 — Geometry & SVG Import
- SVG path parsing (M, L, H, V, C, S, Q, T, A, Z)
- ViewBox scaling and unit conversion (px → mm)
- Bezier curve sampling to line segments
- Bounding box computation
- Coordinate normalization to machine work area (centered, aspect-ratio-preserving)
- Raster image tracing (PNG / JPG → outline or fill-line paths)

### ✅ Phase 3 — G-code Generation
- Pen plotter G-code synthesis with pen-up travel + pen-down draw
- Safety bounds validation with warning system
- Profile-specific startup/shutdown sequence injection

### 🟡 Phase 4 — MVP UI & Integration (in progress)
**Done:**
- Electron main process, preload IPC bridge, renderer bundle (esbuild)
- React app with Canvas, Controls, and Settings pages
- Serial connect / disconnect / live status display
- Job streaming UI: start, pause, resume, cancel, progress readout
- Manual pen controls: pen up/down, safe position commands
- SVG and raster (PNG/JPG) artwork import pipeline
- Canvas page work area preview (SVG-based, correct aspect ratio)
- Grid overlay toggle (5 mm minor / 10 mm major lines)
- Image drag-to-move within the work area
- Image resize via corner handle (maintains center)
- Numeric X/Y offset and scale controls with live G-code regeneration
- Project save/load (JSON format, persistent across sessions)
- Windows packaging via electron-forge (Squirrel installer + zip)

**Remaining:**
- Machine profile editor UI (Settings page shows units only)
- Artwork rotation transform
- End-to-end hardware re-validation with new positioning workflow

## Notes

- The TA4 machine profile is confirmed and validated on hardware
- Raster tracing is in the Phase 2 importer (`src/importers/raster/`)
- Canvas transform (move/scale) regenerates G-code after each interaction; rotation is next
- Phase 5 features (DXF, text, QR, laser) are post-MVP
