import {
  BoundingBox,
  Transform,
  computePathBounds,
  normalizePath,
  sampleBezierCurve,
  sampleQuadraticCurve
} from '../src/core/geometry';

describe('Transform', () => {
  it('translates, scales, and rotates points', () => {
    const transform = new Transform(10, 5, 2, 2, 90);
    const result = transform.apply({ x: 1, y: 0 });

    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(7);
  });

  it('normalizes path segments while preserving pen state', () => {
    const result = normalizePath([{ x: 2, y: 3, penDown: false }], {
      x: 10,
      y: 20,
      scale: 2,
      rotation: 0
    });

    expect(result).toEqual([{ x: 14, y: 26, penDown: false }]);
  });
});

describe('BoundingBox', () => {
  it('tracks bounds, containment, and intersections', () => {
    const box = new BoundingBox();
    box.addPoints([{ x: 0, y: 2 }, { x: 10, y: 8 }]);

    expect(box.width()).toBe(10);
    expect(box.height()).toBe(6);
    expect(box.contains({ x: 4, y: 4 })).toBe(true);
    expect(box.intersects(Object.assign(new BoundingBox(), {
      minX: 8,
      maxX: 12,
      minY: 0,
      maxY: 4
    }))).toBe(true);
  });

  it('computes path bounds from segments', () => {
    expect(computePathBounds([
      { x: 5, y: -2 },
      { x: 12, y: 3 }
    ]).toInterface()).toEqual({ minX: 5, maxX: 12, minY: -2, maxY: 3 });
  });
});

describe('Curve Sampling', () => {
  it('samples cubic Bezier curves including both endpoints', () => {
    const points = sampleBezierCurve(
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      0.5
    );

    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[1].x).toBeCloseTo(5);
    expect(points[1].y).toBeCloseTo(7.5);
    expect(points[2]).toEqual({ x: 10, y: 0 });
  });

  it('samples quadratic curves including both endpoints', () => {
    const points = sampleQuadraticCurve(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
      0.5
    );

    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 }
    ]);
  });
});
