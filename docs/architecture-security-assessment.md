# Architecture And Security Assessment

Assessment date: 2026-05-10

## Executive Summary

Bachin Open Controller has a sensible early architecture for a desktop machine-control app: Electron owns hardware and filesystem access, React owns the operator UI, and the reusable TypeScript core covers serial GRBL control, SVG/raster import, geometry, units, and G-code generation. The codebase is small, readable, and testable, with lint, unit tests, and build passing during this review.

The main risks are not structural debt yet. They are boundary-hardening issues common to Electron hardware tools: renderer-supplied file paths, renderer-supplied G-code, permissive IPC surface area, outdated Electron/tooling dependencies, and motion-safety warnings that do not currently block execution.

## What Looks Strong

- Core domain modules are separated from Electron and React, which keeps serial, geometry, import, and G-code logic testable.
- Electron renderer isolation is enabled with `nodeIntegration: false` and `contextIsolation: true` in `electron/main.ts`.
- The preload exposes a narrow named API instead of raw `ipcRenderer`.
- GRBL streaming has backpressure by waiting for responses, plus pause, resume, cancel, reset, and idle-wait behavior.
- Existing tests cover G-code generation, SVG import, raster import, geometry, units, and fake serial behavior.
- Project/profile validation exists before loading saved data.
- Build/signing notes acknowledge unsigned Windows package risk.

## Priority Recommendations

| Priority | Area | Recommendation | Why It Matters |
|---|---|---|---|
| P0 | Dependency security | Upgrade Electron from `^25.0.0` to a current supported major and update Electron Forge packages after compatibility testing. | `npm audit` reports direct Electron advisories and 26 total vulnerabilities, including high-severity Electron issues. |
| P0 | Motion safety | Treat out-of-bounds G-code warnings as blocking errors before `Run Artwork Job`. | Current bounds validation produces warnings, but the job can still be streamed to hardware. |
| P0 | IPC trust boundary | Stop accepting arbitrary renderer-provided G-code in `serial:sendJob`; move final job generation and safety validation into the main process or validate with a strict G-code allowlist there. | A compromised renderer could send unsafe commands directly to GRBL. |
| P0 | File access | Replace raw `project.open(filePath)` and `project.save(projectData, requestedPath)` with Electron open/save dialogs in the main process. | Renderer-controlled paths can read or write arbitrary local files accessible to the app process. |
| P1 | Electron hardening | Add `sandbox: true`, `webSecurity: true`, an explicit permission request handler, external navigation blocking, and `setWindowOpenHandler` denial unless intentionally needed. | The current defaults are decent, but explicit Electron hardening reduces future regression risk. |
| P1 | IPC validation | Add schema validation for every IPC payload, including serial port, baud rate, perimeter dimensions, job line count, command length, and project shape. | TypeScript types do not protect runtime IPC input. |
| P1 | G-code allowlist | Validate commands against an explicit supported set such as `G0`, `G1`, `G20/G21`, `G90/G91`, profile-approved pen commands, `M3/M5` only for laser profiles, and selected `$` commands only from trusted controls. | Prevents arbitrary GRBL setting changes, homing/unlock surprises, spindle/laser misuse, and control-character injection. |
| P1 | Profile safety | Deep-validate profile command sequences and numeric ranges, then mark packaged profiles read-only/trusted and user profiles untrusted until reviewed. | Profiles currently contain executable machine commands. |
| P1 | Job lifecycle | Add a dedicated job-runner state machine in the main process for ready/running/paused/cancelled/error/completed. | UI state and controller state can drift after errors, disconnects, or resets. |
| P1 | Import limits | Put size and complexity limits on SVG path tokens, raster dimensions, traced path count, generated line count, and parse time. | Malicious or accidental huge artwork can freeze the renderer or generate excessive machine motion. |
| P2 | Observability | Add structured logs for connection, command stream, alarms, cancel/reset, profile used, warnings, and generated job metadata. | Hardware debugging and incident review need a reliable audit trail. |
| P2 | Error taxonomy | Normalize GRBL errors, alarms, serial disconnects, validation failures, and user cancels into distinct UI messages. | Operators need clear recovery steps, especially around alarm and reset states. |
| P2 | Tests | Add integration tests around IPC validation, unsafe G-code rejection, project open/save restrictions, and bounds-blocking behavior. | The highest-risk paths are currently not directly covered. |
| P2 | Packaging | Add CI that runs lint, tests, build, audit, and signed package checks where credentials are available. | Prevents regressions before local hardware testing or release. |
| P3 | Architecture docs | Update `docs/architecture.md` to reflect the implemented Electron architecture, current module boundaries, and planned job-runner/security model. | The architecture doc still reads partly like an option analysis and phase plan. |

## Security Findings

### Dependency Exposure

`npm audit --json` reports 26 vulnerabilities: 20 high and 6 low. The highest-value fix is upgrading Electron, because the direct `electron` package is old and carries multiple advisories. Electron Forge and related build dependencies also contribute transitive `tar`, `@electron/rebuild`, and `node-gyp` findings.

Recommended action: upgrade Electron first in a branch, run `npm install`, `npm test`, `npm run lint`, `npm run build`, then smoke test serial and packaging.

### Renderer-To-Main Trust Boundary

The preload bridge is intentionally narrow, but it still exposes privileged operations:

- `serial.sendJob(gcode)` passes renderer-created command lines to the main process.
- `project.open(filePath)` lets the renderer choose any path to read.
- `project.save(projectData, filePath)` lets the renderer choose any path to write.

Recommended action: make the main process the policy owner. The renderer should request "save project" or "run prepared artwork," while the main process decides file locations, validates payloads, generates or revalidates G-code, and rejects unsupported commands.

### Machine Safety

`GCodeGenerator.validateBounds()` emits warnings for coordinates outside the work area, but `Controls` still allows `Run Artwork Job` when warnings exist. For a physical motion controller, bounds warnings should be treated as hard blockers unless the user enters a deliberate expert override.

Recommended action: add a `canRun` decision from validated job metadata. Block run for any `error` and for bounds-related `warn` by default.

### File Handling

The app validates project JSON shape, which is good. The remaining issue is path authority: the renderer supplies paths. This is less dangerous than exposing `fs`, but still gives a compromised renderer a file read/write primitive through IPC.

Recommended action: use `dialog.showOpenDialog` and `dialog.showSaveDialog` from the main process, restrict extensions to `.boc.json`, and keep default saves inside `app.getPath('userData')` unless the user explicitly chooses another path.

### Electron Runtime Hardening

The app already disables Node integration and enables context isolation. Add explicit protections before packaging more broadly:

- `sandbox: true` for the renderer, after confirming preload compatibility.
- Deny unexpected permission requests with `session.defaultSession.setPermissionRequestHandler`.
- Deny `window.open` and external navigation unless explicitly allowed.
- Add a Content Security Policy in `public/index.html`.
- Avoid loading arbitrary remote URLs except a trusted local dev URL in development.

## Architecture Assessment

The current modular split is a good fit for the product:

- `electron/` owns privileged platform integration.
- `src/core/serial-grbl` owns GRBL protocol behavior.
- `src/core/gcode`, `geometry`, and `units` are UI-independent.
- `src/importers` convert artwork to internal paths.
- `src/ui` is a thin operator workflow around import, preview, and control.

The next architectural step should be a main-process `job-runner` module. It should own job validation, command allowlisting, streaming state, recovery, progress events, and cancellation semantics. That would keep the renderer from becoming the authority on whether hardware motion is safe.

## Verification Performed

- `npm.cmd test -- --runInBand`: passed, 6 suites passed, 1 hardware suite skipped, 29 tests passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- `npm.cmd audit --json`: failed with reported vulnerabilities, as expected for audit findings.
