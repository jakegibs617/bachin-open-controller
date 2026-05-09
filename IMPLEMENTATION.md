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

- ✅ Project scaffold created
- ✅ TypeScript types defined
- ✅ Module structure in place
- ✅ Test framework configured
- ⏳ Phase 0: Awaiting hardware testing
- ⏳ Phase 1: GRBL serial implementation
- ⏳ Phase 2: Geometry and SVG import
- ⏳ Phase 3: G-code generation
- ⏳ Phase 4: Electron UI

## Notes

- All Phase N functions are marked "NOT YET IMPLEMENTED" with detailed TODO comments
- The TA4 machine profile is scaffolded with placeholder pen commands from BachinMaker docs
- Phase 0 must complete before Phase 1 proceeds (hardware testing required)
- Phases 1-3 can proceed in parallel after Phase 0
- Phase 4 depends on all previous phases
