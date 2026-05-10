import { SVGParser, convertSVGLengthToMM, normalizePathToMachineCoordinates } from '../src/importers/svg';

describe('SVGParser', () => {
  it('extracts simple closed paths with absolute commands', () => {
    const parser = new SVGParser();
    const paths = parser.parse(`
      <svg viewBox="0 0 100 100">
        <path d="M 10 20 L 30 20 H 40 V 50 Z" />
      </svg>
    `);

    expect(paths).toHaveLength(1);
    expect(paths[0].segments).toEqual([
      { x: 10, y: 20, penDown: false },
      { x: 30, y: 20, penDown: true },
      { x: 40, y: 20, penDown: true },
      { x: 40, y: 50, penDown: true },
      { x: 10, y: 20, penDown: true }
    ]);
    expect(paths[0].bounds).toEqual({ minX: 10, maxX: 40, minY: 20, maxY: 50 });
  });

  it('handles relative commands and splits separate subpaths', () => {
    const parser = new SVGParser();
    const paths = parser.parse(`
      <svg>
        <path d="m 0 0 l 10 0 m 20 20 l 0 10" />
      </svg>
    `);

    expect(paths).toHaveLength(2);
    expect(paths[0].segments).toEqual([
      { x: 0, y: 0, penDown: false },
      { x: 10, y: 0, penDown: true }
    ]);
    expect(paths[1].segments).toEqual([
      { x: 30, y: 20, penDown: false },
      { x: 30, y: 30, penDown: true }
    ]);
  });

  it('samples quadratic and cubic curves into line segments', () => {
    const parser = new SVGParser();
    const paths = parser.parse(`
      <svg>
        <path d="M 0 0 Q 10 10 20 0 C 20 10 30 10 30 0" />
      </svg>
    `);

    expect(paths[0].segments[0]).toEqual({ x: 0, y: 0, penDown: false });
    const last = paths[0].segments[paths[0].segments.length - 1];
    expect(last.x).toBeCloseTo(30);
    expect(last.y).toBeCloseTo(0);
    expect(paths[0].segments.length).toBeGreaterThan(10);
  });
});

describe('SVG Unit Conversion', () => {
  it('converts SVG lengths to millimeters', () => {
    expect(convertSVGLengthToMM(96, 'px')).toBeCloseTo(25.4);
    expect(convertSVGLengthToMM(1, 'in')).toBeCloseTo(25.4);
    expect(convertSVGLengthToMM(2, 'cm')).toBeCloseTo(20);
  });

  it('normalizes SVG paths into a centered canvas fit', () => {
    const result = normalizePathToMachineCoordinates(
      [
        { x: 10, y: 20, penDown: false },
        { x: 30, y: 40, penDown: true }
      ],
      { minX: 10, maxX: 30, minY: 20, maxY: 40 },
      100,
      50
    );

    expect(result).toEqual([
      { x: 25, y: 0, penDown: false },
      { x: 75, y: 50, penDown: true }
    ]);
  });
});
