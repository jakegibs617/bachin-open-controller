# Architecture Plan

## Preferred Shape

Start with a modular desktop application. Keep the machine-control core usable
without the UI so it can later power a CLI, tests, or alternate frontends.

## Candidate Stacks

### Option A: Tauri + TypeScript + Rust

- TypeScript UI for fast canvas work.
- Rust backend for serial I/O, filesystem, and job streaming.
- Smaller app bundle than Electron.

### Option B: Electron + TypeScript

- Fastest path to a polished cross-platform UI.
- Mature SVG/canvas ecosystem.
- Larger runtime footprint.

### Option C: Python + Qt

- Simple serial and geometry prototyping.
- Good desktop widgets.
- Packaging can become fiddly on Windows.

## Recommended Start

Use TypeScript for the first prototype and keep the domain model independent of
the shell. The first implementation can be web-based or Electron/Tauri later.

## Modules

- `machine-profiles`
  Stores bed size, origin, units, speeds, pen/laser commands, and GRBL settings.

- `serial-grbl`
  Opens ports, detects GRBL, streams jobs, parses `ok`, `error`, alarm, and
  status messages.

- `geometry`
  Normalizes paths, computes bounds, transforms objects, and samples curves.

- `importers`
  Loads SVG first. DXF, bitmap tracing, QR, and text can come later.

- `gcode`
  Generates machine commands for pen, servo, motor, and laser modes.

- `preview`
  Displays canvas, paths, travel moves, origin, bounds, and estimated job order.

- `job-runner`
  Owns queueing, progress, pause, resume, cancel, and recovery behavior.

## Data Model Sketch

```text
Project
  machineProfileId
  units
  canvas
  objects[]

MachineProfile
  id
  name
  machineKind
  workArea
  origin
  baudRate
  travelSpeed
  toolMode
  penUpCommand
  penDownCommand
  laserOnCommand
  laserOffCommand
  maxLaserPower

Job
  sourceProjectId
  generatedAt
  bounds
  gcode[]
  warnings[]
```

## Testing Strategy

- Unit tests for geometry transforms and bounds checks.
- Snapshot tests for generated G-code.
- Fake GRBL serial server for stream handling.
- Hardware smoke tests kept manual until a stable command set exists.

