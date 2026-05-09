# Product Brief

## Working Name

Bachin Open Controller

## Problem

The installed Bachin Draw/BachinMaker application controls GRBL-based drawing,
writing, and laser machines, but the installed package does not include source
code. Users who want maintainability, customization, better diagnostics, or a
modern open workflow need a new implementation.

## Target Users

- Owners of Bachin TA4/A3/Yora-style writing and drawing machines.
- Hobbyists using GRBL pen plotters or small laser engravers.
- Users who want a readable, hackable toolchain for SVG/text-to-machine jobs.

## Core Workflow

1. Select or create a machine profile.
2. Connect to the device over USB serial.
3. Import artwork, text, QR code content, or image-derived paths.
4. Place and scale content on a real-size canvas.
5. Preview machine travel and tool state changes.
6. Generate G-code.
7. Stream the job to GRBL with pause, stop, resume, and progress reporting.

## MVP Scope

- Desktop app or CLI plus simple UI.
- Serial connection to GRBL.
- Machine profile storage.
- SVG path import.
- Canvas preview.
- Pen plotting G-code generation.
- Job streaming with `ok`/error response handling.
- Safety bounds check before sending jobs.

## Later Scope

- DXF import.
- Image tracing and raster/line engraving.
- Laser PWM controls.
- QR code generation.
- Multi-color pen changes.
- Single-line font support.
- Handwriting-style stroke libraries using an original open format.
- Camera/page alignment helpers.

