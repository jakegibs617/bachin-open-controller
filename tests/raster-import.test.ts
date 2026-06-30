import { smoothPaths, traceRasterToPaths } from '../src/importers/raster';

function rgba(pixels: Array<[number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flat());
}

describe('Raster tracing', () => {
  it('collapses connected fill pixels into the fewest candidate stroke', () => {
    const data = rgba([
      [255, 255, 255, 255], [0, 0, 0, 255], [0, 0, 0, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255], [0, 0, 0, 255]
    ]);

    const paths = traceRasterToPaths(data, 4, 2, {
      canvasWidth: 40,
      canvasHeight: 20,
      mode: 'fill',
      threshold: 128,
      yStep: 1,
      minRunLength: 2
    });

    expect(paths).toHaveLength(1);
    expect(paths[0].segments[0].x).toBeCloseTo(13.333);
    expect(paths[0].segments[0]).toMatchObject({ y: 0, penDown: false });
    expect(paths[0].segments[1].x).toBeCloseTo(40);
    expect(paths[0].segments[1]).toMatchObject({ y: 20, penDown: true });
  });

  it('chooses vertical fill strokes when they use fewer lines', () => {
    const data = rgba([
      [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255]
    ]);

    const paths = traceRasterToPaths(data, 3, 3, {
      canvasWidth: 30,
      canvasHeight: 30,
      mode: 'fill',
      threshold: 128,
      yStep: 1,
      minRunLength: 2
    });

    expect(paths).toHaveLength(1);
    expect(paths[0].segments[0]).toMatchObject({ x: 15, y: 0, penDown: false });
    expect(paths[0].segments[1]).toMatchObject({ x: 15, y: 30, penDown: true });
  });

  it('uses diagonal fill strokes for diagonal dark regions', () => {
    const data = rgba([
      [0, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255]
    ]);

    const paths = traceRasterToPaths(data, 3, 3, {
      canvasWidth: 30,
      canvasHeight: 30,
      mode: 'fill',
      threshold: 128,
      yStep: 1,
      minRunLength: 2
    });

    expect(paths).toHaveLength(1);
    expect(paths[0].segments[0]).toMatchObject({ x: 0, y: 0, penDown: false });
    expect(paths[0].segments[1]).toMatchObject({ x: 30, y: 30, penDown: true });
  });

  it('traces dark pixel outlines by default', () => {
    const data = rgba([
      [0, 0, 0, 255]
    ]);

    const paths = traceRasterToPaths(data, 1, 1, {
      canvasWidth: 10,
      canvasHeight: 10,
      threshold: 128
    });

    expect(paths).toHaveLength(4);
    expect(paths.map((path) => path.segments)).toEqual([
      [{ x: 0, y: 0, penDown: false }, { x: 10, y: 0, penDown: true }],
      [{ x: 10, y: 0, penDown: false }, { x: 10, y: 10, penDown: true }],
      [{ x: 10, y: 10, penDown: false }, { x: 0, y: 10, penDown: true }],
      [{ x: 0, y: 10, penDown: false }, { x: 0, y: 0, penDown: true }]
    ]);
  });

  it('ignores transparent and bright pixels', () => {
    const data = rgba([
      [0, 0, 0, 0], [240, 240, 240, 255],
      [255, 255, 255, 255], [255, 255, 255, 255]
    ]);

    expect(traceRasterToPaths(data, 2, 2, {
      canvasWidth: 20,
      canvasHeight: 20,
      threshold: 200
    })).toEqual([]);
  });

  it('can preserve tonal detail with dithered fill lines', () => {
    const data = rgba([
      [64, 64, 64, 255], [192, 192, 192, 255],
      [192, 192, 192, 255], [64, 64, 64, 255]
    ]);

    const paths = traceRasterToPaths(data, 2, 2, {
      canvasWidth: 20,
      canvasHeight: 20,
      mode: 'dither',
      yStep: 1,
      minRunLength: 1
    });

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.length).toBeLessThan(4);
  });

  it('uses local neighborhoods for adaptive thresholding', () => {
    const data = rgba([
      [80, 80, 80, 255], [120, 120, 120, 255], [180, 180, 180, 255],
      [80, 80, 80, 255], [120, 120, 120, 255], [180, 180, 180, 255],
      [80, 80, 80, 255], [120, 120, 120, 255], [180, 180, 180, 255]
    ]);

    const global = traceRasterToPaths(data, 3, 3, {
      canvasWidth: 30,
      canvasHeight: 30,
      mode: 'fill',
      threshold: 100,
      yStep: 1,
      minRunLength: 1
    });
    const adaptive = traceRasterToPaths(data, 3, 3, {
      canvasWidth: 30,
      canvasHeight: 30,
      mode: 'fill',
      threshold: 100,
      adaptiveThreshold: true,
      adaptiveWindowSize: 3,
      adaptiveOffset: 1,
      yStep: 1,
      minRunLength: 1
    });

    expect(adaptive.length).toBeGreaterThan(global.length);
    expect(adaptive.some(path => path.segments[0].x === 15 || path.segments[1].x === 15)).toBe(true);
  });

  it('reduces a diagonal centerline to the least straight stroke', () => {
    const data = rgba([
      [0, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255]
    ]);

    const paths = traceRasterToPaths(data, 4, 4, {
      canvasWidth: 40,
      canvasHeight: 40,
      mode: 'centerline',
      threshold: 128
    });

    expect(paths).toHaveLength(1);
    expect(paths[0].segments).toHaveLength(2);
    expect(paths[0].segments).toEqual([
      { x: 0, y: 0, penDown: false },
      { x: 40, y: 40, penDown: true }
    ]);
  });

  it('keeps meaningful bends while simplifying centerlines', () => {
    const data = rgba([
      [0, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255],
      [0, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255],
      [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255],
      [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255],
      [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255], [255, 255, 255, 255]
    ]);

    const paths = traceRasterToPaths(data, 5, 5, {
      canvasWidth: 40,
      canvasHeight: 40,
      mode: 'centerline',
      threshold: 128
    });

    expect(paths).toHaveLength(1);
    expect(paths[0].segments.length).toBeGreaterThan(2);
    expect(paths[0].segments[0]).toMatchObject({ x: 0, y: 0, penDown: false });
    expect(paths[0].segments[paths[0].segments.length - 1]).toMatchObject({ x: 40, y: 20, penDown: true });
  });

  it('simplifies traced polylines with Douglas-Peucker smoothing', () => {
    const paths = smoothPaths([{
      id: 'zigzag',
      segments: [
        { x: 0, y: 0, penDown: false },
        { x: 1, y: 0.1, penDown: true },
        { x: 2, y: -0.1, penDown: true },
        { x: 3, y: 0, penDown: true }
      ],
      bounds: { minX: 0, maxX: 3, minY: -0.1, maxY: 0.1 }
    }], 0.25);

    expect(paths[0].segments).toEqual([
      { x: 0, y: 0, penDown: false },
      { x: 3, y: 0, penDown: true }
    ]);
    expect(paths[0].bounds).toEqual({ minX: 0, maxX: 3, minY: 0, maxY: 0 });
  });
});
