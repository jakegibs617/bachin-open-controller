import { Path } from '../../types';

export interface RasterTraceOptions {
  threshold?: number;
  mode?: 'outline' | 'fill' | 'centerline' | 'dither';
  xStep?: number;
  yStep?: number;
  minRunLength?: number;
  blurRadius?: number;
  brightness?: number;
  contrast?: number;
  adaptiveThreshold?: boolean;
  adaptiveWindowSize?: number;
  adaptiveOffset?: number;
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
  const luminance = preprocessLuminance(rgba, width, height, options);
  const binary = options.mode === 'dither'
    ? ditherToBinary(luminance, width, height)
    : thresholdToBinary(luminance, width, height, threshold, options);

  if (options.mode === 'fill') {
    return traceRasterFill(binary, width, height, options);
  }
  if (options.mode === 'centerline') {
    return traceRasterCenterline(binary, width, height, options);
  }
  if (options.mode === 'dither') {
    return traceRasterFill(binary, width, height, options);
  }

  return traceRasterOutline(binary, width, height, options);
}

function traceRasterFill(
  binary: Uint8Array,
  width: number,
  height: number,
  options: RasterTraceOptions
): Path[] {
  const xStep = Math.max(1, Math.floor(options.xStep ?? 1));
  const yStep = Math.max(1, Math.floor(options.yStep ?? 2));
  const minRunLength = Math.max(1, Math.floor(options.minRunLength ?? 2));
  const fit = computeFit(width, height, options.canvasWidth, options.canvasHeight);
  const paths: Path[] = [];

  for (let y = 0; y < height; y += yStep) {
    let runStart: number | null = null;

    for (let x = 0; x < width; x += xStep) {
      const dark = isDarkPixel(binary, width, x, y);

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
  binary: Uint8Array,
  width: number,
  height: number,
  options: RasterTraceOptions
): Path[] {
  const fit = computeFit(width, height, options.canvasWidth, options.canvasHeight);
  const paths: Path[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isDarkPixel(binary, width, x, y)) {
        continue;
      }

      if (!isDarkAt(binary, width, height, x, y - 1)) {
        paths.push(edgePath(paths.length + 1, x, y, x + 1, y, width, height, fit));
      }
      if (!isDarkAt(binary, width, height, x + 1, y)) {
        paths.push(edgePath(paths.length + 1, x + 1, y, x + 1, y + 1, width, height, fit));
      }
      if (!isDarkAt(binary, width, height, x, y + 1)) {
        paths.push(edgePath(paths.length + 1, x + 1, y + 1, x, y + 1, width, height, fit));
      }
      if (!isDarkAt(binary, width, height, x - 1, y)) {
        paths.push(edgePath(paths.length + 1, x, y + 1, x, y, width, height, fit));
      }
    }
  }

  return paths;
}

function traceRasterCenterline(
  sourceBinary: Uint8Array,
  width: number,
  height: number,
  options: RasterTraceOptions
): Path[] {
  const binary = new Uint8Array(width * height);
  binary.set(sourceBinary);

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

interface SkelEdge {
  id: number;
  pixels: Array<{ x: number; y: number }>;
  nodeA: number;
  nodeB: number;
}

interface SkelNode {
  x: number;
  y: number;
  edgeIds: number[];
}

function skelNeighbors(
  binary: Uint8Array, width: number, height: number, x: number, y: number
): Array<{ x: number; y: number }> {
  const result: Array<{ x: number; y: number }> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && binary[ny * width + nx] === 1)
        result.push({ x: nx, y: ny });
    }
  }
  return result;
}

// Builds a graph where nodes are endpoints and branch points; edges are the pixel
// chains connecting them. Degree-2 pixels are interior to edges, not nodes.
function buildSkeletonGraph(
  binary: Uint8Array, width: number, height: number
): { nodes: SkelNode[]; edges: SkelEdge[] } {
  const nodes: SkelNode[] = [];
  const edges: SkelEdge[] = [];
  const nodeMap = new Int32Array(width * height).fill(-1);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (binary[y * width + x] !== 1) continue;
      const deg = skelNeighbors(binary, width, height, x, y).length;
      if (deg !== 2) {
        nodeMap[y * width + x] = nodes.length;
        nodes.push({ x, y, edgeIds: [] });
      }
    }
  }

  const edgeVisited = new Uint8Array(width * height);

  const traceEdge = (fromNi: number, sx: number, sy: number): void => {
    if (edgeVisited[sy * width + sx]) return;
    const pixels: Array<{ x: number; y: number }> = [
      { x: nodes[fromNi].x, y: nodes[fromNi].y },
      { x: sx, y: sy }
    ];
    edgeVisited[sy * width + sx] = 1;
    let px = nodes[fromNi].x, py = nodes[fromNi].y, cx = sx, cy = sy;
    while (nodeMap[cy * width + cx] === -1) {
      const nbrs = skelNeighbors(binary, width, height, cx, cy)
        .filter(n => !(n.x === px && n.y === py));
      if (nbrs.length === 0) break;
      px = cx; py = cy;
      cx = nbrs[0].x; cy = nbrs[0].y;
      edgeVisited[cy * width + cx] = 1;
      pixels.push({ x: cx, y: cy });
    }
    const toNi = nodeMap[cy * width + cx];
    if (toNi === -1) return;
    const eid = edges.length;
    edges.push({ id: eid, pixels, nodeA: fromNi, nodeB: toNi });
    nodes[fromNi].edgeIds.push(eid);
    if (toNi !== fromNi) nodes[toNi].edgeIds.push(eid);
  };

  for (let ni = 0; ni < nodes.length; ni++) {
    for (const nbr of skelNeighbors(binary, width, height, nodes[ni].x, nodes[ni].y)) {
      traceEdge(ni, nbr.x, nbr.y);
    }
  }

  // Isolated loops: all pixels have degree 2 so no nodes were created above.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] !== 1 || edgeVisited[idx] || nodeMap[idx] !== -1) continue;
      const ni = nodes.length;
      nodeMap[idx] = ni;
      nodes.push({ x, y, edgeIds: [] });
      edgeVisited[idx] = 1;
      const pixels: Array<{ x: number; y: number }> = [{ x, y }];
      const nbrs0 = skelNeighbors(binary, width, height, x, y);
      if (nbrs0.length > 0) {
        let px = x, py = y, cx = nbrs0[0].x, cy = nbrs0[0].y;
        while (!(cx === x && cy === y)) {
          edgeVisited[cy * width + cx] = 1;
          pixels.push({ x: cx, y: cy });
          const next = skelNeighbors(binary, width, height, cx, cy)
            .filter(n => !(n.x === px && n.y === py));
          if (next.length === 0) break;
          px = cx; py = cy; cx = next[0].x; cy = next[0].y;
        }
      }
      pixels.push({ x, y });
      const eid = edges.length;
      edges.push({ id: eid, pixels, nodeA: ni, nodeB: ni });
      nodes[ni].edgeIds.push(eid);
    }
  }

  return { nodes, edges };
}

// Graph-based skeleton traversal. Within each connected component, edges are walked
// using direction preference at branch points (smallest angular deviation from current
// heading) so the pen flows naturally rather than making arbitrary turns. Pen only
// lifts between disconnected components, or when a component has topology that
// requires backtracking to a new starting node.
function skeletonToPaths(
  binary: Uint8Array,
  width: number,
  height: number,
  options: RasterTraceOptions
): Path[] {
  const fit = computeFit(width, height, options.canvasWidth, options.canvasHeight);
  const pixelDist = width > 1 ? fit.drawWidth / (width - 1) : fit.drawWidth;
  const { nodes, edges } = buildSkeletonGraph(binary, width, height);
  if (edges.length === 0) return [];

  // Label each edge with its connected component id.
  const edgeComp = new Int32Array(edges.length).fill(-1);
  const components: number[][] = [];

  const flood = (startEid: number, cid: number) => {
    const stack = [startEid];
    while (stack.length > 0) {
      const eid = stack.pop()!;
      if (edgeComp[eid] !== -1) continue;
      edgeComp[eid] = cid;
      for (const next of [...nodes[edges[eid].nodeA].edgeIds, ...nodes[edges[eid].nodeB].edgeIds]) {
        if (edgeComp[next] === -1) stack.push(next);
      }
    }
  };

  for (let i = 0; i < edges.length; i++) {
    if (edgeComp[i] === -1) { flood(i, components.length); components.push([]); }
  }
  for (let i = 0; i < edges.length; i++) components[edgeComp[i]].push(i);

  const paths: Path[] = [];
  const usedEdges = new Set<number>();

  // At a branch point, pick the edge whose first step most closely continues
  // the current heading (maximise dot product). Falls back to any unused edge.
  const pickEdge = (ni: number, dirX: number, dirY: number, compSet: Set<number>): number => {
    const unused = nodes[ni].edgeIds.filter(eid => !usedEdges.has(eid) && compSet.has(eid));
    if (unused.length === 0) return -1;
    if (unused.length === 1 || (dirX === 0 && dirY === 0)) return unused[0];
    let best = unused[0], bestScore = -Infinity;
    for (const eid of unused) {
      const e = edges[eid];
      const px = e.nodeA === ni ? e.pixels : [...e.pixels].reverse();
      if (px.length < 2) continue;
      const ex = px[1].x - px[0].x, ey = px[1].y - px[0].y;
      const mag = Math.sqrt(ex * ex + ey * ey);
      const score = mag > 0 ? (dirX * ex + dirY * ey) / mag : 0;
      if (score > bestScore) { bestScore = score; best = eid; }
    }
    return best;
  };

  const emitPath = (pixels: Array<{ x: number; y: number }>) => {
    if (pixels.length < 2) return;
    const segments = pixels.map((pt, i) => ({
      ...toCanvasPoint(pt.x, pt.y, width, height, fit),
      penDown: i > 0
    }));
    paths.push({
      id: `raster-centerline-${paths.length + 1}`,
      segments,
      bounds: computeBounds(segments)
    });
  };

  for (const compEdgeIndices of components) {
    const compSet = new Set(compEdgeIndices);

    // Collect nodes that belong to this component and their in-component degree.
    const compNodes = new Set<number>();
    for (const eid of compEdgeIndices) {
      compNodes.add(edges[eid].nodeA);
      compNodes.add(edges[eid].nodeB);
    }
    const inDegree = (ni: number) =>
      nodes[ni].edgeIds.filter(eid => compSet.has(eid)).length;

    // Prefer starting from an endpoint (degree 1) so we avoid needing to backtrack.
    let startNode = compNodes.values().next().value as number;
    for (const ni of compNodes) {
      if (inDegree(ni) === 1) { startNode = ni; break; }
    }

    let curNode = startNode;
    let dirX = 0, dirY = 0;
    let curPixels: Array<{ x: number; y: number }> = [];

    while (true) {
      const eid = pickEdge(curNode, dirX, dirY, compSet);

      if (eid === -1) {
        // Dead end — find nearest node in this component that still has unused edges.
        const pending = [...compNodes].filter(
          ni => nodes[ni].edgeIds.some(e => !usedEdges.has(e) && compSet.has(e))
        );
        emitPath(curPixels);
        curPixels = [];
        dirX = 0; dirY = 0;
        if (pending.length === 0) break;
        // Jump to the closest pending node (nearest-neighbor sort will handle
        // inter-segment ordering later).
        curNode = pending[0];
        continue;
      }

      usedEdges.add(eid);
      const e = edges[eid];
      const reversed = e.nodeB === curNode && e.nodeA !== curNode;
      const px = reversed ? [...e.pixels].reverse() : e.pixels;

      // Skip pixel[0] when appending — it's the current node, already the last
      // point in curPixels (or the start of a fresh path).
      const startI = curPixels.length > 0 ? 1 : 0;
      for (let i = startI; i < px.length; i++) curPixels.push(px[i]);
      if (curPixels.length === 0 && px.length > 0) curPixels.push(px[0]);

      if (px.length >= 2) {
        dirX = px[px.length - 1].x - px[px.length - 2].x;
        dirY = px[px.length - 1].y - px[px.length - 2].y;
      }
      curNode = reversed ? e.nodeA : e.nodeB;
    }
  }

  const sorted = sortPathsNearestNeighbor(paths);
  return bridgeNearbyPaths(sorted, pixelDist * 5);
}

// Greedy nearest-neighbor reordering: each next path is the one whose start
// or end is closest to the current pen position, minimizing travel between strokes.
function sortPathsNearestNeighbor(paths: Path[]): Path[] {
  if (paths.length <= 1) return paths;

  const remaining = paths.slice();
  const sorted: Path[] = [];
  let curX = 0;
  let curY = 0;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    let bestReverse = false;

    for (let i = 0; i < remaining.length; i++) {
      const segs = remaining[i].segments;
      const s = segs[0];
      const e = segs[segs.length - 1];
      const ds = (s.x - curX) ** 2 + (s.y - curY) ** 2;
      const de = (e.x - curX) ** 2 + (e.y - curY) ** 2;
      if (ds < bestDist) { bestDist = ds; bestIdx = i; bestReverse = false; }
      if (de < bestDist) { bestDist = de; bestIdx = i; bestReverse = true; }
    }

    let chosen = remaining.splice(bestIdx, 1)[0];
    if (bestReverse) {
      const rev = [...chosen.segments].reverse().map((seg, i) => ({ ...seg, penDown: i > 0 }));
      chosen = { ...chosen, segments: rev };
    }

    sorted.push(chosen);
    const last = chosen.segments[chosen.segments.length - 1];
    curX = last.x;
    curY = last.y;
  }

  return sorted;
}

// After nearest-neighbor sort, keep the pen down between consecutive paths whose
// endpoints are within `threshold` canvas units — bridging the small gaps that
// appear between nearly-touching strokes without lifting for true whitespace.
function bridgeNearbyPaths(paths: Path[], threshold: number): Path[] {
  if (paths.length <= 1) return paths;
  const t2 = threshold * threshold;
  const result = paths.slice();
  for (let i = 0; i < result.length - 1; i++) {
    const end = result[i].segments[result[i].segments.length - 1];
    const start = result[i + 1].segments[0];
    const dx = end.x - start.x, dy = end.y - start.y;
    if (dx * dx + dy * dy <= t2) {
      const segs = result[i + 1].segments.map((seg, idx) =>
        idx === 0 ? { ...seg, penDown: true } : seg
      );
      result[i + 1] = { ...result[i + 1], segments: segs };
    }
  }
  return result;
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

export function smoothPaths(paths: Path[], tolerance: number): Path[] {
  if (tolerance <= 0) {
    return paths;
  }

  return paths.map((path) => {
    if (path.segments.length <= 2) {
      return path;
    }

    const simplified = simplifyDouglasPeucker(path.segments, tolerance);
    const segments = simplified.map((segment, index) => ({
      ...segment,
      penDown: index > 0
    }));

    return {
      ...path,
      segments,
      bounds: computeBounds(segments)
    };
  });
}

function preprocessLuminance(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: RasterTraceOptions
): Float32Array {
  const brightness = clamp(options.brightness ?? 0, -100, 100);
  const contrast = clamp(options.contrast ?? 100, 0, 300) / 100;
  const luminance = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const alpha = rgba[index + 3] / 255;
      const source = (0.2126 * rgba[index] + 0.7152 * rgba[index + 1] + 0.0722 * rgba[index + 2]) * alpha + 255 * (1 - alpha);
      luminance[y * width + x] = clamp((source - 128) * contrast + 128 + brightness, 0, 255);
    }
  }

  return gaussianBlur(luminance, width, height, options.blurRadius ?? 0);
}

function thresholdToBinary(
  luminance: Float32Array,
  width: number,
  height: number,
  threshold: number,
  options: RasterTraceOptions
): Uint8Array {
  if (options.adaptiveThreshold) {
    return adaptiveMeanThreshold(luminance, width, height, options.adaptiveWindowSize ?? 31, options.adaptiveOffset ?? 8);
  }

  const binary = new Uint8Array(width * height);
  for (let index = 0; index < luminance.length; index++) {
    binary[index] = luminance[index] < threshold ? 1 : 0;
  }
  return binary;
}

function adaptiveMeanThreshold(
  luminance: Float32Array,
  width: number,
  height: number,
  windowSize: number,
  offset: number
): Uint8Array {
  const radius = Math.max(1, Math.floor(windowSize / 2));
  const stride = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += luminance[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
    }
  }

  const binary = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(width - 1, x + radius);
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integral[(y2 + 1) * stride + x2 + 1]
        - integral[y1 * stride + x2 + 1]
        - integral[(y2 + 1) * stride + x1]
        + integral[y1 * stride + x1];
      binary[y * width + x] = luminance[y * width + x] < (sum / area) - offset ? 1 : 0;
    }
  }

  return binary;
}

function ditherToBinary(luminance: Float32Array, width: number, height: number): Uint8Array {
  const work = new Float32Array(luminance);
  const binary = new Uint8Array(width * height);

  const addError = (x: number, y: number, error: number, factor: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    work[index] = clamp(work[index] + error * factor, 0, 255);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const oldValue = work[index];
      const newValue = oldValue < 128 ? 0 : 255;
      binary[index] = newValue === 0 ? 1 : 0;
      const error = oldValue - newValue;
      addError(x + 1, y, error, 7 / 16);
      addError(x - 1, y + 1, error, 3 / 16);
      addError(x, y + 1, error, 5 / 16);
      addError(x + 1, y + 1, error, 1 / 16);
    }
  }

  return binary;
}

function gaussianBlur(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  const safeRadius = Math.max(0, Math.min(12, radius));
  if (safeRadius < 0.1) {
    return source;
  }

  const kernelRadius = Math.ceil(safeRadius * 3);
  const sigma = safeRadius;
  const kernel: number[] = [];
  let weightSum = 0;
  for (let i = -kernelRadius; i <= kernelRadius; i++) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(weight);
    weightSum += weight;
  }

  const horizontal = new Float32Array(width * height);
  const output = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -kernelRadius; k <= kernelRadius; k++) {
        const sx = clampInt(x + k, 0, width - 1);
        sum += source[y * width + sx] * kernel[k + kernelRadius];
      }
      horizontal[y * width + x] = sum / weightSum;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -kernelRadius; k <= kernelRadius; k++) {
        const sy = clampInt(y + k, 0, height - 1);
        sum += horizontal[sy * width + x] * kernel[k + kernelRadius];
      }
      output[y * width + x] = sum / weightSum;
    }
  }

  return output;
}

function simplifyDouglasPeucker<T extends { x: number; y: number }>(points: T[], epsilon: number): T[] {
  if (points.length <= 2) {
    return points;
  }

  let maxDistance = 0;
  let splitIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = i;
    }
  }

  if (maxDistance <= epsilon) {
    return [start, end];
  }

  const left = simplifyDouglasPeucker(points.slice(0, splitIndex + 1), epsilon);
  const right = simplifyDouglasPeucker(points.slice(splitIndex), epsilon);
  return [...left.slice(0, -1), ...right];
}

function perpendicularDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / Math.hypot(dx, dy);
}

function computeBounds(segments: Array<{ x: number; y: number }>): { minX: number; maxX: number; minY: number; maxY: number } {
  return segments.reduce((bounds, segment) => ({
    minX: Math.min(bounds.minX, segment.x),
    maxX: Math.max(bounds.maxX, segment.x),
    minY: Math.min(bounds.minY, segment.y),
    maxY: Math.max(bounds.maxY, segment.y)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function isDarkPixel(binary: Uint8Array, width: number, x: number, y: number): boolean {
  return binary[y * width + x] === 1;
}

function isDarkAt(binary: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return false;
  }

  return isDarkPixel(binary, width, x, y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
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
