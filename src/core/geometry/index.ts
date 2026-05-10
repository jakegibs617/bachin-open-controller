/**
 * Geometry Engine
 * Phase 2: Handles coordinate transforms, bounds calculations, and curve sampling
 *
 * Features:
 * - 2D coordinate transformations (translate, rotate, scale)
 * - Bounding box computation
 * - Bezier curve sampling to line segments
 * - Path normalization and bounds checking
 *
 * TODO (Phase 2):
 * - Implement Transform class with matrix operations
 * - Implement BoundingBox class
 * - Implement curve sampling (Bezier to line segments)
 * - Create comprehensive test coverage
 */

import { Point, BoundingBox as BoundingBoxInterface, PathSegment, Transform as TransformInterface } from '../../types';

export class Transform {
  /**
   * Phase 2: 2D affine transformation matrix
   * Supports translate, rotate, scale, and composition
   */

  private matrix: number[][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];
  private transform: TransformInterface;

  constructor(translateX: number = 0, translateY: number = 0, scaleX: number = 1, scaleY: number = 1, rotationDeg: number = 0) {
    const radians = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    this.matrix = [
      [cos * scaleX, -sin * scaleY, translateX],
      [sin * scaleX, cos * scaleY, translateY],
      [0, 0, 1]
    ];
    this.transform = {
      x: translateX,
      y: translateY,
      scale: scaleX === scaleY ? scaleX : 1,
      rotation: rotationDeg
    };
  }

  apply(point: Point): Point {
    return {
      x: this.matrix[0][0] * point.x + this.matrix[0][1] * point.y + this.matrix[0][2],
      y: this.matrix[1][0] * point.x + this.matrix[1][1] * point.y + this.matrix[1][2]
    };
  }

  compose(other: Transform): Transform {
    const composed = new Transform();
    composed.matrix = multiplyMatrices(this.matrix, other.matrix);
    composed.transform = this.transform;
    return composed;
  }

  toTransformInterface(): TransformInterface {
    return { ...this.transform };
  }
}

function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  return a.map((row, rowIndex) =>
    row.map((_, colIndex) =>
      a[rowIndex].reduce((sum, value, innerIndex) => sum + value * b[innerIndex][colIndex], 0)
    )
  );
}

export class BoundingBox {
  /**
   * Phase 2: Axis-aligned bounding box
   */

  minX: number = Infinity;
  maxX: number = -Infinity;
  minY: number = Infinity;
  maxY: number = -Infinity;

  addPoint(p: Point): void {
    // Phase 2: Expand bounding box to include point
    this.minX = Math.min(this.minX, p.x);
    this.maxX = Math.max(this.maxX, p.x);
    this.minY = Math.min(this.minY, p.y);
    this.maxY = Math.max(this.maxY, p.y);
  }

  addPoints(points: Point[]): void {
    // Phase 2: Expand bounding box for multiple points
    points.forEach(p => this.addPoint(p));
  }

  intersects(other: BoundingBox): boolean {
    // Phase 2: Check if two bounding boxes overlap
    return !(this.maxX < other.minX || this.minX > other.maxX ||
             this.maxY < other.minY || this.minY > other.maxY);
  }

  contains(p: Point): boolean {
    // Phase 2: Check if point is inside bounding box
    return p.x >= this.minX && p.x <= this.maxX && p.y >= this.minY && p.y <= this.maxY;
  }

  width(): number {
    return this.maxX - this.minX;
  }

  height(): number {
    return this.maxY - this.minY;
  }

  toInterface(): BoundingBoxInterface {
    return { minX: this.minX, maxX: this.maxX, minY: this.minY, maxY: this.maxY };
  }
}

export function sampleBezierCurve(p0: Point, p1: Point, p2: Point, p3: Point, resolution: number = 0.1): Point[] {
  /**
   * Phase 2: Convert cubic Bezier curve to line segments
   * @param p0 Start point
   * @param p1 Control point 1
   * @param p2 Control point 2
   * @param p3 End point
   * @param resolution Step size (0 < resolution <= 1), smaller = more segments
   */
  const step = normalizeResolution(resolution);
  const points: Point[] = [];

  for (let t = 0; t < 1; t += step) {
    points.push(cubicBezierPoint(p0, p1, p2, p3, t));
  }

  points.push(cubicBezierPoint(p0, p1, p2, p3, 1));
  return points;
}

export function sampleQuadraticCurve(p0: Point, p1: Point, p2: Point, resolution: number = 0.1): Point[] {
  /**
   * Phase 2: Convert quadratic Bezier curve to line segments
   */
  const step = normalizeResolution(resolution);
  const points: Point[] = [];

  for (let t = 0; t < 1; t += step) {
    points.push(quadraticBezierPoint(p0, p1, p2, t));
  }

  points.push(quadraticBezierPoint(p0, p1, p2, 1));
  return points;
}

function normalizeResolution(resolution: number): number {
  if (!Number.isFinite(resolution) || resolution <= 0 || resolution > 1) {
    throw new Error('Curve resolution must be greater than 0 and no more than 1');
  }

  return resolution;
}

function cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y
  };
}

function quadraticBezierPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt ** 2 * p0.x + 2 * mt * t * p1.x + t ** 2 * p2.x,
    y: mt ** 2 * p0.y + 2 * mt * t * p1.y + t ** 2 * p2.y
  };
}

export function computePathBounds(segments: PathSegment[]): BoundingBox {
  /**
   * Phase 2: Compute bounding box for a path
   */
  const bbox = new BoundingBox();
  segments.forEach(seg => bbox.addPoint({ x: seg.x, y: seg.y }));
  return bbox;
}

export function normalizePath(segments: PathSegment[], transform: TransformInterface): PathSegment[] {
  /**
   * Phase 2: Apply transformation to path segments
   * - Apply translate, scale, rotation
   * - Preserve pen state flags
   */
  const matrix = new Transform(transform.x, transform.y, transform.scale, transform.scale, transform.rotation);

  return segments.map((segment) => ({
    ...matrix.apply(segment),
    penDown: segment.penDown
  }));
}
