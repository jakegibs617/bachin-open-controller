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

## Subagent Pipeline

For code changes, run the project subagents in `.claude/agents/` in this order,
on a feature branch (never `master`):

1. `implementor`: writes the change test-first and runs lint, tests and build.
2. `code-simplifier`: behavior-preserving cleanup of the branch's changed code.
3. `security-reviewer`: read-only security and machine-safety review. A
   `SECURITY: BLOCK` result goes back to step 1.
4. Main session: the finish steps below (changelog, version bump, verification,
   package), then commit.
5. `pr-reviewer`: read-only final gate. Pass it the security status line. Only
   raise the PR on `READY FOR PR`.

Only the main session commits, pushes, bumps the version or runs
`npm run package`. No agent runs `npm run test:hardware`. Small doc-only changes
can skip steps 1–3.

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
- The confirmed profile uses `G1 Z0 F6000` for pen up and `G1 Z8 F6000` for pen
  down, raising the Z feed to reduce marker dwell between artwork strokes.
- `$1=255` is used at job start to keep Z holding current enabled; shutdown
  restores `$1=250`.
- Artwork speed controls currently regenerate G-code for travel speed, drawing
  speed, and pen Z speed.
