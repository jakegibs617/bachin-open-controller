import { GCodeGenerator, validateCoordinates, validateProfile } from '../src/core/gcode';
import { Canvas, MachineProfile, Path } from '../src/types';

describe('GCodeGenerator', () => {
  const profile: MachineProfile = {
    id: 'test',
    name: 'Test Plotter',
    machineKind: 'pen_plotter',
    workArea: { x: 210, y: 297, z: 12 },
    origin: 'top-left',
    baudRate: 115200,
    travelSpeed: 6000,
    drawingSpeed: 1000,
    stepsPerMm: { x: 50, y: 50, z: 40 },
    penUpCommand: 'G1 Z0 F2000',
    penDownCommand: 'G1 Z8 F2000',
    safeStartupSequence: ['G21', 'G90'],
    safeShutdownSequence: ['G1 Z0 F2000', 'M5']
  };
  const canvas: Canvas = { width: 210, height: 297, offsetX: 0, offsetY: 0 };
  const path: Path = {
    id: 'line',
    segments: [
      { x: 10, y: 20 },
      { x: 20, y: 30 },
      { x: 20.12345, y: 30.98765 }
    ],
    bounds: { minX: 10, maxX: 20.12345, minY: 20, maxY: 30.98765 }
  };

  it('generates profile-specific millimeter G-code for a path', () => {
    const generator = new GCodeGenerator(profile, canvas);
    const result = generator.generate([path]);

    expect(result.warnings).toEqual([]);
    expect(result.gcode).toEqual([
      'G21',
      'G90',
      'G1 Z0 F2000',
      'G0 X10 Y-20 F6000',
      'G1 Z8 F2000',
      'G1 X20 Y-30 F1000',
      'G1 X20.123 Y-30.988 F1000',
      'G1 Z0 F2000',
      'G1 Z0 F2000',
      'M5'
    ]);
  });

  it('emits warnings for empty and out-of-bounds paths', () => {
    const generator = new GCodeGenerator(profile, canvas);
    const result = generator.generate([
      { id: 'empty', segments: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } },
      { id: 'outside', segments: [{ x: 211, y: -1 }], bounds: { minX: 211, maxX: 211, minY: -1, maxY: -1 } }
    ]);

    expect(result.warnings.map((warning) => warning.message)).toEqual([
      'Path empty has no segments',
      'Path outside X 211 exceeds bounds [0, 210]',
      'Path outside Y -1 exceeds bounds [0, 297]',
      'Path outside canvas min X 211 exceeds bounds [0, 210]',
      'Path outside canvas min Y -1 exceeds bounds [0, 297]',
      'Path outside canvas X 211 exceeds bounds [0, 210]',
      'Path outside canvas Y -1 exceeds bounds [0, 297]',
      'Path empty has no drawable segments'
    ]);
  });

  it('starts a new pen run when a path contains move segments', () => {
    const generator = new GCodeGenerator(profile, canvas);
    const result = generator.generate([{
      id: 'two-lines',
      segments: [
        { x: 0, y: 0, penDown: false },
        { x: 10, y: 0, penDown: true },
        { x: 20, y: 20, penDown: false },
        { x: 30, y: 20, penDown: true }
      ],
      bounds: { minX: 0, maxX: 30, minY: 0, maxY: 20 }
    }]);

    expect(result.gcode).toContain('G0 X20 Y-20 F6000');
    expect(result.gcode.filter((line) => line === profile.penDownCommand)).toHaveLength(2);
  });

  it('allows per-job action speed overrides', () => {
    const generator = new GCodeGenerator(profile, canvas, {
      travelSpeed: 8000,
      drawingSpeed: 2200,
      penSpeed: 3500
    });
    const result = generator.generate([path]);

    expect(result.gcode).toContain('G1 Z0 F3500');
    expect(result.gcode).toContain('G0 X10 Y-20 F8000');
    expect(result.gcode).toContain('G1 Z8 F3500');
    expect(result.gcode).toContain('G1 X20 Y-30 F2200');
  });
});

describe('Safety Validation', () => {
  it('validates coordinate ranges', () => {
    expect(validateCoordinates(4, 0, 10, 'X')).toBeNull();
    expect(validateCoordinates(11, 0, 10, 'X')).toEqual({
      severity: 'warn',
      message: 'X 11 exceeds bounds [0, 10]'
    });
  });

  it('validates required profile commands', () => {
    expect(validateProfile({
      id: 'bad',
      name: 'Bad Plotter',
      machineKind: 'pen_plotter',
      workArea: { x: 1, y: 1 },
      origin: 'top-left',
      baudRate: 115200,
      travelSpeed: 1,
      drawingSpeed: 1,
      stepsPerMm: { x: 1, y: 1 },
      penUpCommand: '',
      penDownCommand: '',
      safeStartupSequence: [],
      safeShutdownSequence: []
    })).toEqual([
      { severity: 'error', message: 'Machine profile missing penUpCommand' },
      { severity: 'error', message: 'Machine profile missing penDownCommand' }
    ]);
  });
});
