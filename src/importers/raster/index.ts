import { Path } from '../../types';

export interface RasterTraceOptions {
  threshold?: number;
  mode?: 'outline' | 'fill';
  xStep?: number;
  yStep?: number;
  minRunLength?: number;
  canvasWidth: number;
  canvasHeight: number;
}

export function traceRasterToPaths(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: RasterTraceOptions
): Path[] {
  if (width <= 0 || height <= 0) {
    throw new Error('Raster image dimensions must be greater than zero');
  }
  if (rgba.length < width * height * 4) {
    throw new Error('Raster image data is smaller than the supplied dimensions');
  }

  const threshold = options.threshold ?? 160;
  if (options.mode === 'fill') {
    return traceRasterFill(rgba, width, height, options, threshold);
  }

  return traceRasterOutline(rgba, width, height, options, threshold);
}

function traceRasterFill(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: RasterTraceOptions,
  threshold: number
): Path[] {
  const xStep = Math.max(1, Math.floor(options.xStep ?? 1));
  const yStep = Math.max(1, Math.floor(options.yStep ?? 2));
  const minRunLength = Math.max(1, Math.floor(options.minRunLength ?? 2));
  const fit = computeFit(width, height, options.canvasWidth, options.canvasHeight);
  const paths: Path[] = [];

  for (let y = 0; y < height; y += yStep) {
    let runStart: number | null = null;

    for (let x = 0; x < width; x += xStep) {
      const dark = isDarkPixel(rgba, width, x, y, threshold);

      if (dark && runStart === null) {
        runStart = x;
      }

      if ((!dark || x + xStep >= width) && runStart !== null) {
        const runEnd = dark && x + xStep >= width ? x : x - xStep;
        if (runEnd - runStart + xStep >= minRunLength) {
          const start = toCanvasPoint(runStart, y, width, height, fit);
          const end = toCanvasPoint(runEnd, y, width, height, fit);
          paths.push({
            id: `raster-run-${paths.length + 1}`,
            segments: [
              { ...start, penDown: false },
              { ...end, penDown: true }
            ],
            bounds: {
              minX: Math.min(start.x, end.x),
              maxX: Math.max(start.x, end.x),
              minY: start.y,
              maxY: start.y
            }
          });
        }
        runStart = null;
      }
    }
  }

  return paths;
}

function traceRasterOutline(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: RasterTraceOptions,
  threshold: number
): Path[] {
  const fit = computeFit(width, height, options.canvasWidth, options.canvasHeight);
  const paths: Path[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isDarkPixel(rgba, width, x, y, threshold)) {
        continue;
      }

      if (!isDarkAt(rgba, width, height, x, y - 1, threshold)) {
        paths.push(edgePath(paths.length + 1, x, y, x + 1, y, width, height, fit));
      }
      if (!isDarkAt(rgba, width, height, x + 1, y, threshold)) {
        paths.push(edgePath(paths.length + 1, x + 1, y, x + 1, y + 1, width, height, fit));
      }
      if (!isDarkAt(rgba, width, height, x, y + 1, threshold)) {
        paths.push(edgePath(paths.length + 1, x + 1, y + 1, x, y + 1, width, height, fit));
      }
      if (!isDarkAt(rgba, width, height, x - 1, y, threshold)) {
        paths.push(edgePath(paths.length + 1, x, y + 1, x, y, width, height, fit));
      }
    }
  }

  return paths;
}

function edgePath(
  id: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  height: number,
  fit: { offsetX: number; offsetY: number; drawWidth: number; drawHeight: number }
): Path {
  const start = toCanvasEdgePoint(x1, y1, width, height, fit);
  const end = toCanvasEdgePoint(x2, y2, width, height, fit);

  return {
    id: `raster-edge-${id}`,
    segments: [
      { ...start, penDown: false },
      { ...end, penDown: true }
    ],
    bounds: {
      minX: Math.min(start.x, end.x),
      maxX: Math.max(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxY: Math.max(start.y, end.y)
    }
  };
}

function isDarkPixel(rgba: Uint8ClampedArray, width: number, x: number, y: number, threshold: number): boolean {
  const index = (y * width + x) * 4;
  const alpha = rgba[index + 3] / 255;
  if (alpha <= 0.05) {
    return false;
  }

  const luminance = (0.2126 * rgba[index] + 0.7152 * rgba[index + 1] + 0.0722 * rgba[index + 2]) * alpha + 255 * (1 - alpha);
  return luminance < threshold;
}

function isDarkAt(rgba: Uint8ClampedArray, width: number, height: number, x: number, y: number, threshold: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return false;
  }

  return isDarkPixel(rgba, width, x, y, threshold);
}

function computeFit(width: number, height: number, canvasWidth: number, canvasHeight: number): { offsetX: number; offsetY: number; drawWidth: number; drawHeight: number } {
  const scale = Math.min(canvasWidth / width, canvasHeight / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;

  return {
    offsetX: (canvasWidth - drawWidth) / 2,
    offsetY: (canvasHeight - drawHeight) / 2,
    drawWidth,
    drawHeight
  };
}

function toCanvasPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  fit: { offsetX: number; offsetY: number; drawWidth: number; drawHeight: number }
): { x: number; y: number } {
  return {
    x: fit.offsetX + (width === 1 ? 0 : x / (width - 1)) * fit.drawWidth,
    y: fit.offsetY + (height === 1 ? 0 : y / (height - 1)) * fit.drawHeight
  };
}

function toCanvasEdgePoint(
  x: number,
  y: number,
  width: number,
  height: number,
  fit: { offsetX: number; offsetY: number; drawWidth: number; drawHeight: number }
): { x: number; y: number } {
  return {
    x: fit.offsetX + (x / width) * fit.drawWidth,
    y: fit.offsetY + (y / height) * fit.drawHeight
  };
}
