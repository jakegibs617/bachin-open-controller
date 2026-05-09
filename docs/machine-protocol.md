# Machine Protocol Notes

## Known Local Machine Clues

From the installed BachinMaker runtime files:

- Machine name: `TA4`
- Controller reports: `Grbl 1.1f#TA4`
- Baud rate: `115200`
- Approximate configured canvas: `190 x 280`
- Logged GRBL travel limits: X `210`, Y `297`, Z `12`
- Logged steps/mm: X `50`, Y `50`, Z `40`
- Logged max rates: X/Y/Z `6000`
- Logged acceleration: X/Y `3000`, Z `4000`
- Laser max PWM: `255`
- Weak laser value: `6`
- Example pen/motor values: pen up `0`, pen down `8`

These values should become user-editable profile defaults, not hard-coded
assumptions.

## GRBL Basics

GRBL accepts line-oriented G-code over serial and responds with:

- `ok` when a command has been accepted.
- `error:N` when a command is invalid or cannot be processed.
- `ALARM:N` for machine alarm states.
- Status reports after `?`, usually wrapped in angle brackets.

The sender should avoid flooding the controller. Start with a conservative
line-by-line stream, then later implement character-buffer streaming.

## Common Commands

```gcode
G21         ; millimeters
G90         ; absolute positioning
G0 X10 Y10  ; rapid move
G1 X20 Y20 F1000
M3 S255     ; laser/spindle on with power
M5          ; laser/spindle off
```

Pen machines may use servo/motor commands instead of standard laser commands.
The original app exposes configurable pen up/down code and values, so profiles
must allow arbitrary command templates.

## Safety Rules

- Never start a job until bounds are checked against the active work area.
- Warn on negative coordinates unless the profile explicitly allows them.
- Separate travel moves from tool-down moves in the preview.
- Require laser mode to have an explicit power value.
- Always provide stop/cancel behavior that stops streaming and sends a safe tool
  off command when possible.

## Open Protocol Questions

- Exact TA4 pen-up and pen-down command format.
- Whether this machine expects servo commands, Z moves, or custom M-code.
- Whether homing is reliable and enabled for all supported profiles.
- Whether origin should default to top-left, lower-left, or current machine
  position for the user's hardware.

