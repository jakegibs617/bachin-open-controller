# Bachin Open Controller

An open, from-scratch controller for GRBL-based Bachin-style pen plotters,
writing machines, and small laser/drawing machines.

This repository is not a copy of Bachin Draw/BachinMaker. It is a clean-room
project that aims to support similar hardware workflows using public GRBL
behavior, user-provided machine settings, and original application code.

## Goals

- Connect to GRBL-compatible machines over USB serial.
- Import vector artwork and text, preview it on a machine-sized canvas, and
  generate safe plotting or engraving jobs.
- Support pen, servo, motor, and laser style output modes through configurable
  machine profiles.
- Provide a modern, inspectable, user-friendly replacement workflow for common
  pen writer and laser drawer tasks.

## Non-Goals

- Do not copy proprietary Bachin Draw source code, UI assets, language files,
  handwriting libraries, or binary formats.
- Do not bypass licensing or modify the original application.
- Do not send unbounded machine commands without workspace and safety checks.

## Initial Documents

- [Product Brief](docs/product-brief.md)
- [Architecture Plan](docs/architecture.md)
- [Machine Protocol Notes](docs/machine-protocol.md)
- [Roadmap](docs/roadmap.md)
- [Compatibility And Legal Notes](docs/compatibility-legal.md)
- [Open Questions](docs/open-questions.md)

## Current Status

Early prototype. The project now has a working Electron shell, TA4-oriented
serial controls, basic GRBL command streaming, geometry helpers, simple SVG path
import, and G-code generation with bounds warnings. Hardware-specific behavior
is still intentionally conservative and should be tested on a connected machine
before running real jobs.
