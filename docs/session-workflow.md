# Session Workflow For Future Agents

This project is usually tested by double-clicking the packaged Windows app from
the OneDrive Desktop/repo output, not by running only a dev server. Treat a task
as incomplete until the runnable build has been regenerated.

## Start Of Session

- Check `git status --short` before editing.
- Leave unrelated user changes alone.
- Read the relevant source and docs before making assumptions.
- On Windows PowerShell, prefer `npm.cmd` instead of `npm` if execution policy
  blocks `npm.ps1`.

## Required Finish Steps

For every code or documentation change:

1. Update `CHANGELOG.md` with the user-facing change, technical details that
   help future sessions, and verification/package notes when complete.
2. Bump `package.json` version with a patch increment unless the user requests a
   specific version.
   - Use `npm.cmd version patch --no-git-tag-version`.
   - This updates both `package.json` and `package-lock.json`.
3. Run verification:
   - `npm.cmd run lint`
   - `npm.cmd test -- --runInBand`
   - `npm.cmd run build dev`
4. Regenerate the packaged Windows app:
   - `npm.cmd run package`
5. Add the completed verification/package commands to the current changelog
   entry if they are not already there.
6. In the final response, report the new version and whether lint, tests, build,
   package, and changelog updates completed.

The goal is that after a session finishes, the user can test the latest work by
double-clicking the generated Windows executable instead of running extra build
commands manually.

## Current App Notes

- The app is Electron + React + TypeScript.
- Renderer entry: `public/index.jsx`.
- Main process: `electron/main.ts`.
- Preload IPC bridge: `electron/preload.ts`.
- G-code generation: `src/core/gcode/index.ts`.
- Artwork import/preview workflow: `src/ui/pages/Canvas.tsx`.
- Machine controls and job streaming UI: `src/ui/pages/Controls.tsx`.
- TA4 machine profile: `profiles/ta4.json`.

## Machine-Specific Notes

- TA4 pen up/down is controlled through Z-axis G-code, not spindle commands.
- The confirmed profile uses `G1 Z0 F2000` for pen up and `G1 Z8 F2000` for pen
  down.
- `$1=255` is used at job start to keep Z holding current enabled; shutdown
  restores `$1=250`.
- Artwork speed controls currently regenerate G-code for travel speed, drawing
  speed, and pen Z speed.
