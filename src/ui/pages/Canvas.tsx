/**
 * Canvas Page
 * Phase 4: SVG preview and canvas editor
 *
 * Features:
 * - Display imported SVG paths on a work area grid
 * - Drag image to reposition within the work area
 * - Drag bottom-right corner handle to resize (scales around center)
 * - Drag top rotation handle to rotate freely
 * - Numeric X/Y offset, scale %, and rotation ° controls
 * - G-code regenerates after each transform change
 */

import React from 'react';
import { BoundingBox, Canvas as CanvasModel, LengthUnit, MachineProfile, Path } from '../../types';
import { formatLength } from '../../core/units';
import { SVGParser, normalizePathToMachineCoordinates } from '../../importers/svg';
import { traceRasterToPaths } from '../../importers/raster';
import { GCodeGenerator } from '../../core/gcode';
import ta4Profile from '../../../profiles/ta4.json';
import { PreparedJob } from '../App';

interface CanvasProps {
  units: LengthUnit;
  preparedJob: PreparedJob | null;
  onPreparedJobChange: (job: PreparedJob | null) => void;
}

const profile = ta4Profile as MachineProfile;
const canvas: CanvasModel = {
  width: profile.workArea.x,
  height: profile.workArea.y,
  offsetX: 0,
  offsetY: 0
};
type RasterMode = 'outline' | 'fill' | 'centerline';
type GridUnit = 'mm' | 'cm' | 'in';

const RASTER_TRACE_SIZES = {
  draft: 160,
  normal: 260,
  fine: 380,
  ultra: 560
};

type RasterDetail = keyof typeof RASTER_TRACE_SIZES;

const GRID_SPACING: Record<GridUnit, { minor: number; major: number }> = {
  mm: { minor: 5, major: 10 },
  cm: { minor: 10, major: 20 },
  in: { minor: 25.4 / 4, major: 25.4 }
};

const ROTATE_HANDLE_DIST = 10; // mm from top edge to rotation handle
type DragMode = 'move' | 'resize' | 'rotate';

interface DragState {
  mode: DragMode;
  startPt: { x: number; y: number };
  startOffset: { x: number; y: number };
  startScale: number;
  startRotation: number;
  startAngle: number; // radians from display center to startPt (used for rotate)
  rawBounds: BoundingBox;
  center: { x: number; y: number }; // raw image center
}

function normalizePaths(paths: Path[]): Path[] {
  if (paths.length === 0) {
    return [];
  }

  const svgBounds = paths.reduce((bounds, path) => ({
    minX: Math.min(bounds.minX, path.bounds.minX),
    maxX: Math.max(bounds.maxX, path.bounds.maxX),
    minY: Math.min(bounds.minY, path.bounds.minY),
    maxY: Math.max(bounds.maxY, path.bounds.maxY)
  }), {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity
  });

  return paths.map((path) => {
    const segments = normalizePathToMachineCoordinates(path.segments, svgBounds, canvas.width, canvas.height);
    const bounds = segments.reduce((current, segment) => ({
      minX: Math.min(current.minX, segment.x),
      maxX: Math.max(current.maxX, segment.x),
      minY: Math.min(current.minY, segment.y),
      maxY: Math.max(current.maxY, segment.y)
    }), {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity
    });

    return { ...path, segments, bounds };
  });
}

function pathToPoints(path: Path): string {
  return path.segments.map((segment) => `${segment.x},${segment.y}`).join(' ');
}

function computeAllBounds(paths: Path[]): BoundingBox {
  return paths.reduce((b, p) => ({
    minX: Math.min(b.minX, p.bounds.minX),
    maxX: Math.max(b.maxX, p.bounds.maxX),
    minY: Math.min(b.minY, p.bounds.minY),
    maxY: Math.max(b.maxY, p.bounds.maxY)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

// Apply scale (around center), rotation, and translation to all path coordinates.
// scalePct=100, rotateDeg=0, dx=0, dy=0 is the identity transform.
function applyTransform(
  paths: Path[],
  cx: number,
  cy: number,
  scalePct: number,
  dx: number,
  dy: number,
  rotateDeg: number
): Path[] {
  const s = scalePct / 100;
  const rad = (rotateDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  const xformPt = (x: number, y: number) => ({
    x: cx + dx + (x - cx) * s * cosR - (y - cy) * s * sinR,
    y: cy + dy + (x - cx) * s * sinR + (y - cy) * s * cosR
  });

  return paths.map((path) => {
    const segments = path.segments.map((seg) => ({ ...seg, ...xformPt(seg.x, seg.y) }));

    // Tight AABB of the four rotated corners of the original bounding box
    const corners = [
      xformPt(path.bounds.minX, path.bounds.minY),
      xformPt(path.bounds.maxX, path.bounds.minY),
      xformPt(path.bounds.maxX, path.bounds.maxY),
      xformPt(path.bounds.minX, path.bounds.maxY)
    ];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);

    return {
      ...path,
      segments,
      bounds: {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys)
      }
    };
  });
}

export const Canvas: React.FC<CanvasProps> = ({ units, preparedJob, onPreparedJobChange }) => {
  const [message, setMessage] = React.useState('Import an SVG path file to prepare a TA4 plotting job.');
  const [error, setError] = React.useState<string | null>(null);
  const [rasterMode, setRasterMode] = React.useState<RasterMode>('outline');
  const [rasterDetail, setRasterDetail] = React.useState<RasterDetail>('normal');
  const [threshold, setThreshold] = React.useState(170);
  const [invertRaster, setInvertRaster] = React.useState(false);

  const [showGrid, setShowGrid] = React.useState(false);
  const [gridUnit, setGridUnit] = React.useState<GridUnit>('mm');
  const [isDragging, setIsDragging] = React.useState(false);

  // rawPaths: paths normalized to canvas coordinates, before any user transform.
  const [rawPaths, _setRawPaths] = React.useState<Path[] | null>(null);
  const rawPathsRef = React.useRef<Path[] | null>(null);
  const setRawPaths = (p: Path[] | null) => { rawPathsRef.current = p; _setRawPaths(p); };

  // Transform state. Refs mirror state so pointer event handlers avoid stale closures.
  const [offsetX, _setOffsetX] = React.useState(0);
  const [offsetY, _setOffsetY] = React.useState(0);
  const [imageScale, _setImageScale] = React.useState(100);
  const [rotation, _setRotation] = React.useState(0);
  const offsetXRef = React.useRef(0);
  const offsetYRef = React.useRef(0);
  const imageScaleRef = React.useRef(100);
  const rotationRef = React.useRef(0);
  const setOffsetX = (v: number) => { offsetXRef.current = v; _setOffsetX(v); };
  const setOffsetY = (v: number) => { offsetYRef.current = v; _setOffsetY(v); };
  const setImageScale = (v: number) => { imageScaleRef.current = v; _setImageScale(v); };
  const setRotation = (v: number) => { rotationRef.current = v; _setRotation(v); };

  const jobNameRef = React.useRef('');
  React.useEffect(() => { jobNameRef.current = preparedJob?.name ?? ''; }, [preparedJob]);

  const svgRef = React.useRef<SVGSVGElement>(null);
  const dragState = React.useRef<DragState | null>(null);

  // --- Derived display geometry ---
  const rawBounds = rawPaths ? computeAllBounds(rawPaths) : null;
  const rawCenterX = rawBounds ? (rawBounds.minX + rawBounds.maxX) / 2 : canvas.width / 2;
  const rawCenterY = rawBounds ? (rawBounds.minY + rawBounds.maxY) / 2 : canvas.height / 2;

  const s = imageScale / 100;
  const rad = (rotation * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  // Maps a point in raw image coordinates to its position in SVG display space
  const toDisplay = (x: number, y: number) => ({
    x: rawCenterX + offsetX + (x - rawCenterX) * s * cosR - (y - rawCenterY) * s * sinR,
    y: rawCenterY + offsetY + (x - rawCenterX) * s * sinR + (y - rawCenterY) * s * cosR
  });

  // SVG transform for the image <g> — scale then rotate then translate, all around image center
  const imgGroupTransform = rawBounds
    ? `translate(${rawCenterX + offsetX},${rawCenterY + offsetY}) rotate(${rotation}) scale(${s}) translate(${-rawCenterX},${-rawCenterY})`
    : '';

  // Four corners of the bounding box in display coordinates (for the selection polygon)
  const displayCorners = rawBounds ? [
    toDisplay(rawBounds.minX, rawBounds.minY),
    toDisplay(rawBounds.maxX, rawBounds.minY),
    toDisplay(rawBounds.maxX, rawBounds.maxY),
    toDisplay(rawBounds.minX, rawBounds.maxY)
  ] : null;

  // Rotation handle: arm extends from top-center of the rotated bounding box
  const topCenter = rawBounds ? toDisplay(rawCenterX, rawBounds.minY) : null;
  const rotateHandle = topCenter ? {
    x: topCenter.x - ROTATE_HANDLE_DIST * sinR,
    y: topCenter.y - ROTATE_HANDLE_DIST * cosR
  } : null;

  // --- Utilities ---

  const getSvgPt = (e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const regenerateJob = (
    paths: Path[],
    name: string,
    cx: number,
    cy: number,
    scalePct: number,
    dx: number,
    dy: number,
    rotateDeg: number
  ) => {
    const transformed = applyTransform(paths, cx, cy, scalePct, dx, dy, rotateDeg);
    const generator = new GCodeGenerator(profile, canvas);
    const result = generator.generate(transformed);
    onPreparedJobChange({ name, paths: transformed, gcode: result.gcode, warnings: result.warnings });
    setMessage(`${name}: ${transformed.length} stroke${transformed.length === 1 ? '' : 's'}, ${result.gcode.length} G-code lines.`);
  };

  const applyTransformAndRegenerate = (scalePct: number, dx: number, dy: number, rotateDeg: number) => {
    const paths = rawPathsRef.current;
    if (!paths) return;
    const bounds = computeAllBounds(paths);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    regenerateJob(paths, jobNameRef.current, cx, cy, scalePct, dx, dy, rotateDeg);
  };

  // --- Pointer event handlers ---

  const handleMovePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (!rawPathsRef.current || !rawBounds) return;
    const pt = getSvgPt(e);
    const bounds = computeAllBounds(rawPathsRef.current);
    dragState.current = {
      mode: 'move',
      startPt: pt,
      startOffset: { x: offsetXRef.current, y: offsetYRef.current },
      startScale: imageScaleRef.current,
      startRotation: rotationRef.current,
      startAngle: 0,
      rawBounds: bounds,
      center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
    };
    setIsDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const handleResizePointerDown = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!rawPathsRef.current) return;
    const pt = getSvgPt(e);
    const bounds = computeAllBounds(rawPathsRef.current);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    dragState.current = {
      mode: 'resize',
      startPt: pt,
      startOffset: { x: offsetXRef.current, y: offsetYRef.current },
      startScale: imageScaleRef.current,
      startRotation: rotationRef.current,
      startAngle: 0,
      rawBounds: bounds,
      center: { x: cx, y: cy }
    };
    setIsDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const handleRotatePointerDown = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!rawPathsRef.current) return;
    const pt = getSvgPt(e);
    const bounds = computeAllBounds(rawPathsRef.current);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const displayCx = cx + offsetXRef.current;
    const displayCy = cy + offsetYRef.current;
    dragState.current = {
      mode: 'rotate',
      startPt: pt,
      startOffset: { x: offsetXRef.current, y: offsetYRef.current },
      startScale: imageScaleRef.current,
      startRotation: rotationRef.current,
      startAngle: Math.atan2(pt.y - displayCy, pt.x - displayCx),
      rawBounds: bounds,
      center: { x: cx, y: cy }
    };
    setIsDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const state = dragState.current;
    if (!state) return;

    const pt = getSvgPt(e);

    if (state.mode === 'move') {
      setOffsetX(state.startOffset.x + pt.x - state.startPt.x);
      setOffsetY(state.startOffset.y + pt.y - state.startPt.y);
    } else if (state.mode === 'resize') {
      const displayCx = state.center.x + state.startOffset.x;
      const displayCy = state.center.y + state.startOffset.y;
      const s0 = state.startScale / 100;
      const rad0 = (state.startRotation * Math.PI) / 180;
      const cosR0 = Math.cos(rad0);
      const sinR0 = Math.sin(rad0);
      // Bottom-right corner of raw bounds in display space at drag start
      const lx = (state.rawBounds.maxX - state.center.x) * s0;
      const ly = (state.rawBounds.maxY - state.center.y) * s0;
      const initCornerX = displayCx + lx * cosR0 - ly * sinR0;
      const initCornerY = displayCy + lx * sinR0 + ly * cosR0;
      const initDist = Math.hypot(initCornerX - displayCx, initCornerY - displayCy);
      const currDist = Math.hypot(pt.x - displayCx, pt.y - displayCy);
      if (initDist > 0.5) {
        setImageScale(Math.max(5, Math.min(500, Math.round(state.startScale * currDist / initDist))));
      }
    } else {
      // rotate: delta angle from drag-start to current mouse, relative to display center
      const displayCx = state.center.x + state.startOffset.x;
      const displayCy = state.center.y + state.startOffset.y;
      const currentAngle = Math.atan2(pt.y - displayCy, pt.x - displayCx);
      const angleDeltaDeg = (currentAngle - state.startAngle) * (180 / Math.PI);
      setRotation(state.startRotation + angleDeltaDeg);
    }
  };

  const handleSvgPointerUp = () => {
    if (!dragState.current) return;
    dragState.current = null;
    setIsDragging(false);
    applyTransformAndRegenerate(imageScaleRef.current, offsetXRef.current, offsetYRef.current, rotationRef.current);
  };

  // --- Manual control handlers ---

  const handleOffsetChange = (axis: 'x' | 'y', value: number) => {
    const dx = axis === 'x' ? value : offsetXRef.current;
    const dy = axis === 'y' ? value : offsetYRef.current;
    setOffsetX(dx);
    setOffsetY(dy);
    applyTransformAndRegenerate(imageScaleRef.current, dx, dy, rotationRef.current);
  };

  const handleScaleChange = (newScale: number) => {
    setImageScale(newScale);
    applyTransformAndRegenerate(newScale, offsetXRef.current, offsetYRef.current, rotationRef.current);
  };

  const handleRotationChange = (newRotation: number) => {
    setRotation(newRotation);
    applyTransformAndRegenerate(imageScaleRef.current, offsetXRef.current, offsetYRef.current, newRotation);
  };

  const handleResetTransform = () => {
    setOffsetX(0);
    setOffsetY(0);
    setImageScale(100);
    setRotation(0);
    applyTransformAndRegenerate(100, 0, 0, 0);
  };

  // --- Import and clear ---

  const handleClear = () => {
    setRawPaths(null);
    setOffsetX(0);
    setOffsetY(0);
    setImageScale(100);
    setRotation(0);
    onPreparedJobChange(null);
    setMessage('Import an SVG path file to prepare a TA4 plotting job.');
    setError(null);
  };

  const importSvg = async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    try {
      const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
      const paths = isSvg ? await prepareSvgPaths(file) : await prepareRasterPaths(file);
      if (paths.length === 0) {
        throw new Error('No drawable paths were found.');
      }

      setRawPaths(paths);
      setOffsetX(0);
      setOffsetY(0);
      setImageScale(100);
      setRotation(0);

      const generator = new GCodeGenerator(profile, canvas);
      const result = generator.generate(paths);
      onPreparedJobChange({
        name: file.name,
        paths,
        gcode: result.gcode,
        warnings: result.warnings
      });
      setMessage(`Prepared ${file.name}: ${paths.length} stroke${paths.length === 1 ? '' : 's'}, ${result.gcode.length} G-code lines.`);
    } catch (caught) {
      setRawPaths(null);
      onPreparedJobChange(null);
      setError(caught instanceof Error ? caught.message : String(caught));
      setMessage('SVG import failed.');
    }
  };

  const prepareSvgPaths = async (file: File): Promise<Path[]> => {
    const svgContent = await file.text();
    const parser = new SVGParser();
    const rawParsedPaths = parser.parse(svgContent);
    return normalizePaths(rawParsedPaths);
  };

  const prepareRasterPaths = async (file: File): Promise<Path[]> => {
    const image = await loadImage(file);
    const maxTraceSize = RASTER_TRACE_SIZES[rasterDetail];
    const scale = Math.min(1, maxTraceSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const scratch = document.createElement('canvas');
    scratch.width = width;
    scratch.height = height;
    const context = scratch.getContext('2d');
    if (!context) {
      throw new Error('Canvas image processing is not available.');
    }

    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    if (invertRaster) {
      invertImageData(imageData.data);
    }
    const objectUrl = image.src;
    image.removeAttribute('src');
    URL.revokeObjectURL(objectUrl);

    return traceRasterToPaths(imageData.data, width, height, {
      mode: rasterMode,
      threshold,
      xStep: 1,
      yStep: rasterDetail === 'fine' || rasterDetail === 'ultra' ? 1 : 2,
      minRunLength: 2,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });
  };

  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not load image file.'));
      image.src = URL.createObjectURL(file);
    });
  };

  const invertImageData = (data: Uint8ClampedArray): void => {
    for (let index = 0; index < data.length; index += 4) {
      data[index] = 255 - data[index];
      data[index + 1] = 255 - data[index + 1];
      data[index + 2] = 255 - data[index + 2];
    }
  };

  const dragMode = dragState.current?.mode;

  return (
    <div className="canvas-page">
      <h2>Canvas Preview</h2>
      <section className="canvas-toolbar">
        <label htmlFor="svg-import">Artwork file</label>
        <input
          id="svg-import"
          type="file"
          accept=".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg"
          onChange={(event) => importSvg(event.target.files?.[0])}
        />
        <button
          type="button"
          className={`toolbar-btn${showGrid ? ' active' : ''}`}
          onClick={() => setShowGrid(!showGrid)}
        >
          Grid
        </button>
        {showGrid && (
          <select
            aria-label="Grid unit"
            value={gridUnit}
            onChange={(e) => setGridUnit(e.target.value as GridUnit)}
          >
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="in">in</option>
          </select>
        )}
        {rawPaths && (
          <button type="button" className="toolbar-btn" onClick={handleResetTransform}>
            Reset
          </button>
        )}
        {preparedJob && (
          <button type="button" className="toolbar-btn" onClick={handleClear}>
            Clear
          </button>
        )}
      </section>

      <section className="raster-settings" aria-label="Raster trace settings">
        <label htmlFor="raster-mode">Raster mode</label>
        <select id="raster-mode" value={rasterMode} onChange={(event) => setRasterMode(event.target.value as RasterMode)}>
          <option value="outline">Outline</option>
          <option value="fill">Fill lines</option>
          <option value="centerline">Centerline</option>
        </select>
        <label htmlFor="raster-detail">Detail</label>
        <select id="raster-detail" value={rasterDetail} onChange={(event) => setRasterDetail(event.target.value as RasterDetail)}>
          <option value="draft">Draft</option>
          <option value="normal">Normal</option>
          <option value="fine">Fine</option>
          <option value="ultra">Ultra</option>
        </select>
        <label htmlFor="raster-threshold">Threshold</label>
        <input
          id="raster-threshold"
          type="range"
          min="40"
          max="240"
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
        />
        <span>{threshold}</span>
        <label className="check-row">
          <input type="checkbox" checked={invertRaster} onChange={(event) => setInvertRaster(event.target.checked)} />
          Invert
        </label>
      </section>

      <div className="work-area-preview svg-preview" aria-label="TA4 work area preview">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${canvas.width} ${canvas.height}`}
          role="img"
          aria-label="Imported SVG preview"
          style={{ userSelect: 'none', display: 'block', width: '100%', height: '100%' }}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
        >
          <defs>
            {showGrid && (() => {
              const { minor, major } = GRID_SPACING[gridUnit];
              return (
                <>
                  <pattern id="gridMinor" width={minor} height={minor} patternUnits="userSpaceOnUse">
                    <path d={`M ${minor} 0 L 0 0 0 ${minor}`} fill="none" stroke="#dce2e8" strokeWidth="0.25" />
                  </pattern>
                  <pattern id="gridMajor" width={major} height={major} patternUnits="userSpaceOnUse">
                    <rect width={major} height={major} fill="url(#gridMinor)" />
                    <path d={`M ${major} 0 L 0 0 0 ${major}`} fill="none" stroke="#b8c4ce" strokeWidth="0.4" />
                  </pattern>
                </>
              );
            })()}
          </defs>

          {/* Work area background */}
          <rect x="0" y="0" width={canvas.width} height={canvas.height} fill="#fff" stroke="#d4dce0" strokeWidth="0.5" />

          {/* Grid overlay */}
          {showGrid && (
            <rect x="0" y="0" width={canvas.width} height={canvas.height} fill="url(#gridMajor)" style={{ pointerEvents: 'none' }} />
          )}

          {rawPaths && (
            <>
              {/* Draggable, rotatable, scalable image group */}
              <g
                transform={imgGroupTransform}
                style={{ cursor: isDragging && dragMode === 'move' ? 'grabbing' : 'grab' }}
                onPointerDown={handleMovePointerDown}
              >
                {rawPaths.map((path) => (
                  <polyline
                    key={path.id}
                    points={pathToPoints(path)}
                    fill="none"
                    stroke="#1f7a4d"
                    strokeWidth="1.2"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>

              {/* Selection polygon — follows rotation */}
              {displayCorners && (
                <polygon
                  points={displayCorners.map((c) => `${c.x},${c.y}`).join(' ')}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="0.5"
                  strokeDasharray="2 1.5"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Resize handle: bottom-right corner */}
              {displayCorners && (
                <circle
                  cx={displayCorners[2].x}
                  cy={displayCorners[2].y}
                  r={2.5}
                  fill="#2563eb"
                  stroke="white"
                  strokeWidth="0.6"
                  style={{ cursor: isDragging && dragMode === 'resize' ? 'grabbing' : 'nwse-resize' }}
                  onPointerDown={handleResizePointerDown}
                />
              )}

              {/* Rotation handle: arm + circle above top-center */}
              {topCenter && rotateHandle && (
                <>
                  <line
                    x1={topCenter.x}
                    y1={topCenter.y}
                    x2={rotateHandle.x}
                    y2={rotateHandle.y}
                    stroke="#2563eb"
                    strokeWidth="0.5"
                    style={{ pointerEvents: 'none' }}
                  />
                  <circle
                    cx={rotateHandle.x}
                    cy={rotateHandle.y}
                    r={2.5}
                    fill="#2563eb"
                    stroke="white"
                    strokeWidth="0.6"
                    style={{ cursor: isDragging && dragMode === 'rotate' ? 'grabbing' : 'crosshair' }}
                    onPointerDown={handleRotatePointerDown}
                  />
                </>
              )}
            </>
          )}
        </svg>
      </div>

      {/* Image transform controls — shown only when an image is loaded */}
      {rawPaths && (
        <section className="image-transform-controls" aria-label="Image position and scale">
          <label htmlFor="img-offset-x">X</label>
          <input
            id="img-offset-x"
            type="number"
            step="1"
            value={Math.round(offsetX * 10) / 10}
            onChange={(e) => handleOffsetChange('x', Number(e.target.value))}
          />
          <span className="unit-label">mm</span>

          <label htmlFor="img-offset-y">Y</label>
          <input
            id="img-offset-y"
            type="number"
            step="1"
            value={Math.round(offsetY * 10) / 10}
            onChange={(e) => handleOffsetChange('y', Number(e.target.value))}
          />
          <span className="unit-label">mm</span>

          <label htmlFor="img-scale-range">Scale</label>
          <input
            id="img-scale-range"
            type="range"
            min="5"
            max="200"
            value={Math.min(200, imageScale)}
            onChange={(e) => handleScaleChange(Number(e.target.value))}
          />
          <input
            id="img-scale-number"
            type="number"
            min="5"
            max="500"
            step="1"
            value={imageScale}
            onChange={(e) => handleScaleChange(Math.max(5, Math.min(500, Number(e.target.value))))}
          />
          <span className="unit-label">%</span>

          <label htmlFor="img-rotation">Rotate</label>
          <input
            id="img-rotation"
            type="number"
            step="1"
            value={Math.round(rotation * 10) / 10}
            onChange={(e) => handleRotationChange(Number(e.target.value))}
          />
          <span className="unit-label">°</span>
        </section>
      )}

      <dl className="canvas-readout">
        <div>
          <dt>Width</dt>
          <dd>{formatLength(canvas.width, units)}</dd>
        </div>
        <div>
          <dt>Height</dt>
          <dd>{formatLength(canvas.height, units)}</dd>
        </div>
        <div>
          <dt>G-code</dt>
          <dd>{preparedJob ? preparedJob.gcode.length : 0} lines</dd>
        </div>
        <div>
          <dt>Paths</dt>
          <dd>{preparedJob ? preparedJob.paths.length : 0}</dd>
        </div>
      </dl>
      <p className="status-message">{message}</p>
      {preparedJob && preparedJob.warnings.length > 0 && (
        <ul className="warning-list">
          {preparedJob.warnings.map((warning, index) => (
            <li key={`${warning.message}-${index}`} className={warning.severity}>
              {warning.message}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};

export default Canvas;
