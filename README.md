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

- [Session Workflow For Future Agents](docs/session-workflow.md)
- [Changelog](CHANGELOG.md)
- [Product Brief](docs/product-brief.md)
- [Architecture Plan](docs/architecture.md)
- [Machine Protocol Notes](docs/machine-protocol.md)
- [Roadmap](docs/roadmap.md)
- [Compatibility And Legal Notes](docs/compatibility-legal.md)
- [Open Questions](docs/open-questions.md)

## Getting Started

Prerequisites: [Node.js 18+](https://nodejs.org) and [Git](https://git-scm.com).

```bash
git clone https://github.com/jakegibs617/bachin-open-controller.git
cd bachin-open-controller
npm install
npm run dev
```

That's it. Running via `npm run dev` launches Electron through Node.js, so Windows Smart App Control does not apply — no code signing needed for local development.

## Current Status

TA4-focused MVP prototype. The project has a working Electron shell,
TA4-oriented serial controls, GRBL command streaming, SVG/raster artwork import,
canvas positioning with move/scale/rotation, per-job action speed controls, and
G-code generation with bounds warnings. Hardware-specific behavior is still
intentionally conservative and should be tested carefully on a connected machine
before running real jobs.

## Agent Workflow

Future coding sessions should finish by bumping the package patch version and
running lint/tests/build (`npm run lint && npm test && npm run build`).
Verify behavior with `npm run dev`. Do not run `npm run package` as part of
routine development — the packaged `.exe` is unsigned and Windows Smart App
Control will block it on most machines.

## Windows Signing

Windows Smart App Control can block unsigned local builds. To produce a signed
installer, configure one of these signing inputs before packaging:

```powershell
$env:WINDOWS_SIGN_CERTIFICATE_FILE = 'C:\path\to\code-signing-cert.pfx'
$env:WINDOWS_SIGN_CERTIFICATE_PASSWORD = 'certificate-password'
npm.cmd run package:signed
```

For signtool-compatible cloud or hardware-backed signing, set
`WINDOWS_SIGN_WITH_PARAMS` instead. The certificate must be from a trusted
publisher for Smart App Control to treat the app as trusted.
