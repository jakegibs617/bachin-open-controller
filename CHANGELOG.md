# Changelog

All notable project changes should be recorded here during each coding session.
Use the newest package version as the heading, and include both commit-message
level summaries and practical details that help future sessions ramp up quickly.

## [0.0.8] - 2026-05-10

### Changed

- Replaced Artwork speed number inputs with slider controls for Travel, Draw,
  and Pen Z speeds.
- Added visible Min, Optimal, and Max anchors to each speed scale. Optimal uses
  the TA4 profile default that Reset speeds restores.

### Verified

- `npm.cmd run lint`
- `npm.cmd test -- --runInBand`
- `npm.cmd run build`
- `npm.cmd run package`

## [0.0.7] - 2026-05-10

### Added

- Persisted Artwork action speed settings across app restarts. Travel, drawing,
  and pen Z speeds now load from saved app settings and auto-save whenever the
  user changes or resets them.
- Added focused tests for speed setting defaults, storage loading, invalid saved
  values, clamping, and saving.

### Verified

- `npm.cmd run lint`
- `npm.cmd test -- --runInBand`
- `npm.cmd run build`
- `npm.cmd run package`

## [0.0.6] - 2026-05-10

### Changed

- Increased the default TA4 artwork drawing speed from 1000 mm/min to
  1600 mm/min.
- Increased the default TA4 pen Z speed from 2000 mm/min to 6000 mm/min so
  marker up/down moves happen with much less dwell between artwork strokes.

### Added

- Added environment-driven Windows code signing support for Electron Forge so
  packaged app binaries and the Squirrel installer can be signed with either a
  PFX certificate or signtool-compatible signing parameters.
- Added a `package:signed` script that requires signing credentials before
  packaging, making Smart App Control readiness explicit instead of silently
  generating another unsigned installer.
- Documented the signing environment variables in the README.

### Verified

- `npm.cmd run package:signed` fails fast without signing credentials.
- `npm.cmd run lint`
- `npm.cmd test -- --runInBand`
- `npm.cmd run build`
- `npm.cmd run package`

## [0.0.5] - 2026-05-10

### Changed

- Defaulted the app display units to centimeters for current measurement
  readouts and controls.
- Converted Machine jog/perimeter and Artwork offset controls at the UI boundary
  so entered centimeter values still send safe millimeter values to the machine
  and G-code pipeline.
- Converted Artwork speed controls to display in the selected length unit per
  minute while preserving millimeter-per-minute feed rates internally.
- Defaulted the Artwork grid selector to centimeters and moved centimeters to
  the top of the Settings unit list.

### Verified

- `npm.cmd run lint`
- `npm.cmd test -- --runInBand`
- `npm.cmd run build`
- `npm.cmd run package`

## [0.0.4] - 2026-05-10

### Changed

- Centered the app header content, page containers, and artwork preview so pages
  use balanced responsive gutters instead of hugging the left edge on wider
  windows.
- Replaced fixed main content padding with viewport-aware padding to better
  respect compact and wide window sizes.

### Verified

- `npm.cmd run lint`
- `npm.cmd test -- --runInBand`
- `npm.cmd run build`
- `npm.cmd run package`

## [0.0.3] - 2026-05-10

### Added

- Added this changelog and linked it from the main project docs.
- Documented the future-session rule that each task should update the changelog,
  bump the patch version, run verification, and regenerate the packaged Windows
  build.

### Changed

- Refreshed project status docs so future agents know the current MVP includes
  canvas rotation, centerline raster tracing, and per-job action speed controls.

### Verified

- `npm.cmd run lint`
- `npm.cmd test -- --runInBand`
- `npm.cmd run build`
- `npm.cmd run package`

## [0.0.2] - 2026-05-10

### Added

- Added per-job speed overrides to G-code generation.
- Added Artwork tab controls for travel speed, drawing speed, and pen Z speed.
- Added test coverage for speed-specific generated G-code.
- Added `docs/session-workflow.md` to capture the expected handoff workflow for
  future agent sessions.

### Changed

- G-code generation can now rewrite the feed rate inside profile pen up/down
  commands, so TA4 pen Z movement speed can be tuned without editing the machine
  profile.
- Cleaned up a raster tracer loop that failed lint under the existing ESLint
  rules.

### Verified

- `npm.cmd run lint`
- `npm.cmd test -- --runInBand`
- `npm.cmd run build`
- `npm.cmd run package`

## Commit History Before Changelog

These entries are seeded from the existing Git commit messages so the changelog
has useful project context even though it was introduced after initial work.

### 2026-05-10

- `eee0f3f` Add grid units, ultra detail, centerline tracing, and Material Design UI.
- `5b4c21d` Add artwork rotation to canvas editor.
- `96eb44f` Add canvas grid overlay and interactive image positioning.
- `09dda53` Improve job control and connection state.
- `8c807ca` Add packaging and persistence support.

### 2026-05-09

- `677764a` Add artwork import and plotting pipeline.
- `50e5b31` Add safe manual plotter controls.
- `3c1f148` Add manual pen control UI.
- `4bf42dc` Phase 0-3 implementation: GRBL controller, G-code generation, hardware validation.
- `62ef8be` scaffolding init commit.
