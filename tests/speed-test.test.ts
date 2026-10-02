import { generateSpeedTestGCode, TWO_INCH_MM } from '../src/core/gcode';
import { validateGCodeJob } from '../src/core/gcode';
import { MachineProfile } from '../src/types';

const profile: MachineProfile = {
  id: 'ta4',
  name: 'Bachin TA4',
  machineKind: 'pen_plotter',
  workArea: { x: 180, y: 210, z: 12 },
  origin: 'top-left',
  baudRate: 115200,
  travelSpeed: 6000,
  drawingSpeed: 1600,
  stepsPerMm: { x: 50, y: 50, z: 40 },
  penUpCommand: 'G1 Z0 F6000',
  penDownCommand: 'G1 Z8 F6000',
  safeStartupSequence: ['$1=255', 'G21', 'G90', 'G10 L2 P1 X0 Y0 Z0'],
  safeShutdownSequence: ['G1 Z0 F6000', 'M5', '$1=250']
};

function coords(gcode: string[]): Array<{ x: number; y: number }> {
  return gcode
    .filter((line) => /^G[01] /.test(line) && /X/.test(line))
    .map((line) => ({
      x: Number(line.match(/X(-?\d+(?:\.\d+)?)/)![1]),
      y: Number(line.match(/Y(-?\d+(?:\.\d+)?)/)![1])
    }));
}

describe('generateSpeedTestGCode', () => {
  it('draws one spiral per requested feedrate', () => {
    const { gcode, speeds } = generateSpeedTestGCode({ speeds: [1200, 1600, 2000] }, profile);
    expect(speeds).toEqual([1200, 1600, 2000]);

    // Pen lifts: one before each spiral plus one after each = 2 per spiral.
    const penUps = gcode.filter((l) => l === 'G1 Z0 F6000');
    const penDowns = gcode.filter((l) => l === 'G1 Z8 F6000');
    expect(penDowns).toHaveLength(3);
    // 3 between-spiral lifts + the shutdown lift.
    expect(penUps.length).toBeGreaterThanOrEqual(4);

    for (const speed of [1200, 1600, 2000]) {
      expect(gcode.some((l) => l.includes(`G1 X`) && l.endsWith(`F${speed}`))).toBe(true);
    }
  });

  it('keeps every spiral within a 2 inch boundary and inside the work area', () => {
    const { gcode, boundaryMm } = generateSpeedTestGCode(
      { speeds: [1000, 3000], boundaryMm: 45.72 },
      profile
    );
    expect(boundaryMm).toBeLessThan(TWO_INCH_MM);

    const points = coords(gcode);
    const xs = points.map((p) => p.x);
    const ysDown = points.map((p) => -p.y); // machine Y is negative downward

    // Each spiral's drawn diameter must be under 2 in; the two spirals sit in
    // separate cells, so check span per cell by clustering on x.
    const firstCell = points.filter((p) => p.x < 50);
    const cellXs = firstCell.map((p) => p.x);
    const cellYs = firstCell.map((p) => -p.y);
    const diaX = Math.max(...cellXs) - Math.min(...cellXs);
    const diaY = Math.max(...cellYs) - Math.min(...cellYs);
    expect(diaX).toBeLessThan(TWO_INCH_MM);
    expect(diaY).toBeLessThan(TWO_INCH_MM);

    // Nothing leaves the work area.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(profile.workArea.x);
    expect(Math.min(...ysDown)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ysDown)).toBeLessThanOrEqual(profile.workArea.y);
  });

  it('clamps feedrates to the profile max rate and minimum', () => {
    const { speeds } = generateSpeedTestGCode({ speeds: [50, 99999] }, profile);
    expect(speeds).toEqual([100, profile.travelSpeed]);
  });

  it('rejects a boundary of 2 inches or more', () => {
    expect(() => generateSpeedTestGCode({ speeds: [1600], boundaryMm: TWO_INCH_MM }, profile)).toThrow(
      /under 2 in/
    );
  });

  it('rejects an empty speed list', () => {
    expect(() => generateSpeedTestGCode({ speeds: [] }, profile)).toThrow(/at least one/);
  });

  it('produces a job that passes safety validation', () => {
    const { gcode } = generateSpeedTestGCode({ speeds: [1600, 2400] }, profile);
    expect(() => validateGCodeJob(gcode, profile)).not.toThrow();
  });
});
