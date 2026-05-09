# Open Questions

## Product

- Should the first version be a desktop app, browser app with Web Serial, or CLI?
- Should the app target only the TA4 first, or generic GRBL machines from day one?
- Is laser support required in the MVP, or should MVP stay pen-only for safety?

## Hardware

- What exact command raises and lowers the pen on the user's TA4?
- Does the machine use Z movement, servo commands, or motor values for pen state?
- Where is the preferred origin in real use?
- Does the user's machine have reliable homing switches?

## File Support

- Which import matters first: SVG, DXF, text, image, or QR code?
- Should project files be JSON, SQLite, or a zipped document format?
- Do we need compatibility with any existing user-created Bachin project files?

## User Experience

- Should the UI optimize for handwriting jobs, art plotting, laser engraving, or
  all modes equally?
- What warnings should be blocking versus informational?
- How much manual jog/control UI should be exposed in the first version?

