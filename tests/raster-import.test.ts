import { traceRasterToPaths } from '../src/importers/raster';

function rgba(pixels: Array<[number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flat());
}

describe('Raster tracing', () => {
  it('turns dark horizontal pixel runs into pen strokes', () => {
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

    expect(paths).toHaveLength(2);
    expect(paths[0].segments[0].x).toBeCloseTo(13.333);
    expect(paths[0].segments[0]).toMatchObject({ y: 0, penDown: false });
    expect(paths[0].segments[1].x).toBeCloseTo(26.667);
    expect(paths[0].segments[1]).toMatchObject({ y: 0, penDown: true });
    expect(paths[1].segments[0].y).toBeCloseTo(20);
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
});
