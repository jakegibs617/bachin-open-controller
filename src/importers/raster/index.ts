import { Path } from '../../types';

export interface RasterTraceOptions {
  threshold?: number;
  mode?: 'outline' | 'fill' | 'centerline';
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
  if (options.mode === 'centerline') {
    return traceRasterCenterline(rgba, width, height, options, threshold);
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

function traceRasterCenterline(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: RasterTraceOptions,
  threshold: number
): Path[] {
  const binary = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isDarkPixel(rgba, width, x, y, threshold)) {
        binary[y * width + x] = 1;
      }
    }
  }

  zhangSuenThin(binary, width, height);
  return skeletonToPaths(binary, width, height, options);
}

// Zhang-Suen morphological thinning — reduces dark regions to 1-pixel-wide skeleton.
function zhangSuenThin(binary: Uint8Array, width: number, height: number): void {
  const get = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return binary[y * width + x];
  };

  const toDelete: number[] = [];
  let changed = true;

  while (changed) {
    changed = false;
    toDelete.length = 0;

    // Pass 1
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (get(x, y) === 0) continue;
        const p2 = get(x, y - 1);
        const p3 = get(x + 1, y - 1);
        const p4 = get(x + 1, y);
        const p5 = get(x + 1, y + 1);
        const p6 = get(x, y + 1);
        const p7 = get(x - 1, y + 1);
        const p8 = get(x - 1, y);
        const p9 = get(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let A = 0;
        for (let i = 0; i < 8; i++) { if (seq[i] === 0 && seq[i + 1] === 1) A++; }
        if (A !== 1) continue;
        if (p2 * p4 * p6 !== 0) continue;
        if (p4 * p6 * p8 !== 0) continue;
        toDelete.push(y * width + x);
      }
    }
    for (const idx of toDelete) { binary[idx] = 0; changed = true; }
    toDelete.length = 0;

    // Pass 2
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (get(x, y) === 0) continue;
        const p2 = get(x, y - 1);
        const p3 = get(x + 1, y - 1);
        const p4 = get(x + 1, y);
        const p5 = get(x + 1, y + 1);
        const p6 = get(x, y + 1);
        const p7 = get(x - 1, y + 1);
        const p8 = get(x - 1, y);
        const p9 = get(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let A = 0;
        for (let i = 0; i < 8; i++) { if (seq[i] === 0 && seq[i + 1] === 1) A++; }
        if (A !== 1) continue;
        if (p2 * p4 * p8 !== 0) continue;
        if (p2 * p6 * p8 !== 0) continue;
        toDelete.push(y * width + x);
      }
    }
    for (const idx of toDelete) { binary[idx] = 0; changed = true; }
  }
}

// Greedy DFS trace of a skeleton bitmap into polyline paths.
// At branch points the first unvisited neighbor is followed; remaining branches
// become new paths when the outer scan reaches their unvisited pixels.
function skeletonToPaths(
  binary: Uint8Array,
  width: number,
  height: number,
  options: RasterTraceOptions
): Path[] {
  const fit = computeFit(width, height, options.canvasWidth, options.canvasHeight);
  const paths: Path[] = [];
  const visited = new Uint8Array(width * height);

  const unvisitedNeighbors = (x: number, y: number): Array<{ x: number; y: number }> => {
    const result: Array<{ x: number; y: number }> = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height
            && binary[ny * width + nx] === 1 && !visited[ny * width + nx]) {
          result.push({ x: nx, y: ny });
        }
      }
    }
    return result;
  };

  for (let startY = 0; startY < height; startY++) {
    for (let startX = 0; startX < width; startX++) {
      if (binary[startY * width + startX] !== 1 || visited[startY * width + startX]) continue;

      const pts: Array<{ x: number; y: number }> = [];
      let cx = startX;
      let cy = startY;
      let tracing = true;

      while (tracing) {
        visited[cy * width + cx] = 1;
        pts.push({ x: cx, y: cy });
        const nbrs = unvisitedNeighbors(cx, cy);
        if (nbrs.length === 0) {
          tracing = false;
        } else {
          cx = nbrs[0].x;
          cy = nbrs[0].y;
        }
      }

      if (pts.length < 2) continue;

      const segments = pts.map((pt, i) => ({
        ...toCanvasPoint(pt.x, pt.y, width, height, fit),
        penDown: i > 0
      }));

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const seg of segments) {
        if (seg.x < minX) minX = seg.x;
        if (seg.x > maxX) maxX = seg.x;
        if (seg.y < minY) minY = seg.y;
        if (seg.y > maxY) maxY = seg.y;
      }

      paths.push({
        id: `raster-centerline-${paths.length + 1}`,
        segments,
        bounds: { minX, maxX, minY, maxY }
      });
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
