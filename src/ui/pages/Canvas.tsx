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
import { formatLength, fromMillimeters, toMillimeters, UNIT_LABELS } from '../../core/units';
import { SVGParser, normalizePathToMachineCoordinates } from '../../importers/svg';
import { smoothPaths, traceRasterToPaths } from '../../importers/raster';
import { GCodeGenerator } from '../../core/gcode';
import {
  MAX_ACTION_SPEED,
  MIN_ACTION_SPEED,
  defaultActionSpeedSettings,
  loadActionSpeedSettings,
  saveActionSpeedSettings
} from '../settings/actionSpeeds';
import {
  ArtworkKind,
  RasterDetail,
  RasterMode,
  SavedCanvasObject,
  SavedProjectData,
  applyArtworkTransform,
  inferImageMimeType,
  isPhotoshopSignature,
  isSavedProjectData,
  withSavedAtNow
} from '../artworkPlan';
import ta4Profile from '../../../profiles/ta4.json';
import { PreparedJob } from '../App';

type IpcResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

interface ProjectApi {
  save: (projectData: unknown, filePath?: string) => Promise<IpcResult>;
}

type LoadedSavedProjectData = SavedProjectData & { filePath?: string };

interface CanvasProps {
  units: LengthUnit;
  preparedJob: PreparedJob | null;
  onPreparedJobChange: (job: PreparedJob | null) => void;
  jobProgress?: { sent: number; total: number } | null;
}

const profile = ta4Profile as MachineProfile;
const canvas: CanvasModel = {
  width: profile.workArea.x,
  height: profile.workArea.y,
  offsetX: 0,
  offsetY: 0
};
type GridUnit = 'mm' | 'cm' | 'in';
type RasterSource = {
  image: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};
type RasterTraceSettings = {
  mode: RasterMode;
  detail: RasterDetail;
  threshold: number;
  brightness: number;
  contrast: number;
  blurRadius: number;
  adaptiveThreshold: boolean;
  smoothingTolerance: number;
  invertRaster: boolean;
};

type ArtworkTransformState = {
  x: number;
  y: number;
  scale: number;
  scaleY: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

type PlanInfo = {
  projectId: string;
  created: string;
  filePath?: string;
};

type ArtworkLayer = {
  id: string;
  planKey: string;
  name: string;
  rawPaths: Path[];
  artworkKind: ArtworkKind;
  sourceFileName: string;
  sourceMimeType: string;
  sourceDataUrl: string;
  rasterSettings: RasterTraceSettings;
  transform: ArtworkTransformState;
  visible: boolean;
  previewColor?: string;
  actionSpeeds: { travelSpeed: number; drawingSpeed: number; penSpeed: number };
};

const RASTER_MODE_HINTS: Record<RasterMode, string> = {
  outline: 'Traces the outer silhouette of dark regions. Best for line art, logos, and images with clear edges.',
  fill: 'Fills dark regions with horizontal scan lines. Good for solid shapes that need a hatched shading effect.',
  centerline: 'Finds the skeleton midline of strokes. Ideal for handwriting, technical drawings, and thin lines.',
  dither: 'Converts gray tones to dot patterns using ordered dithering. Best for photos and continuous-tone images.',
  'contour-fill': 'Outlines each connected region fully, then fills it with horizontal lines before moving on. Ideal for type and letterforms.',
};

const RASTER_TRACE_SIZES: Record<RasterDetail, number> = {
  draft: 320,
  normal: 512,
  fine: 1024,
  ultra: 1536,
  max: 2048
};

const GRID_SPACING: Record<GridUnit, { minor: number; major: number }> = {
  mm: { minor: 5, major: 10 },
  cm: { minor: 10, major: 20 },
  in: { minor: 25.4 / 4, major: 25.4 }
};

const ACTIVE_LAYER_COLOR = '#1f7a4d';
const INACTIVE_LAYER_COLORS = ['#a855f7', '#dc2626', '#0891b2', '#ea580c'];
const INACTIVE_LAYER_OPACITY = 0.5;

const ROTATE_HANDLE_DIST = 10; // mm from top edge to rotation handle
const MAGNIFIER_ZOOM = 4; // how much the magnifier window enlarges the artwork
const MAGNIFIER_WINDOW_WIDTH = 220; // px width of the picture-in-picture window
type DragMode = 'move' | 'resize' | 'rotate';

function displayLengthInput(valueMm: number, units: LengthUnit, precision: number = 4): number {
  return Number(fromMillimeters(valueMm, units).toFixed(precision));
}

function speedPrecision(units: LengthUnit): number {
  if (units === 'mm') return 0;
  if (units === 'ft') return 3;
  return 2;
}

function formatSpeed(valueMm: number, units: LengthUnit): string {
  return `${formatLength(valueMm, units, speedPrecision(units))}/min`;
}

function getBrowserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

interface DragState {
  mode: DragMode;
  startPt: { x: number; y: number };
  startOffset: { x: number; y: number };
  startScaleX: number;
  startScaleY: number;
  startRotation: number;
  startFlipX: boolean;
  startFlipY: boolean;
  startAngle: number; // radians from display center to startPt (used for rotate)
  rawBounds: BoundingBox;
  center: { x: number; y: number }; // raw image center
}

interface ActionSpeedSliderProps {
  id: string;
  label: string;
  valueMm: number;
  optimalMm: number;
  units: LengthUnit;
  onChange: (valueMm: number) => void;
}

const ActionSpeedSlider: React.FC<ActionSpeedSliderProps> = ({
  id,
  label,
  valueMm,
  optimalMm,
  units,
  onChange
}) => {
  const optimalPercent = ((optimalMm - MIN_ACTION_SPEED) / (MAX_ACTION_SPEED - MIN_ACTION_SPEED)) * 100;

  return (
    <div className="speed-slider-control">
      <div className="speed-slider-heading">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{formatSpeed(valueMm, units)}</output>
      </div>
      <div className="speed-slider-track">
        <input
          id={id}
          type="range"
          min={MIN_ACTION_SPEED}
          max={MAX_ACTION_SPEED}
          step="1"
          value={valueMm}
          aria-valuetext={formatSpeed(valueMm, units)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span
          className="speed-optimal-marker"
          style={{ left: `${optimalPercent}%` }}
          title={`Optimal ${formatSpeed(optimalMm, units)}`}
        />
      </div>
      <div className="speed-slider-scale">
        <span>Min {formatSpeed(MIN_ACTION_SPEED, units)}</span>
        <span>Optimal {formatSpeed(optimalMm, units)}</span>
        <span>Max {formatSpeed(MAX_ACTION_SPEED, units)}</span>
      </div>
    </div>
  );
};

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

interface ProgressStrokePoint {
  x: number;
  y: number;
  lineIdx: number;
}

interface ProgressStroke {
  startPoint: ProgressStrokePoint;
  drawPoints: ProgressStrokePoint[];
}

function buildProgressStrokes(gcode: string[], origin: string): ProgressStroke[] {
  const strokes: ProgressStroke[] = [];
  let travelPoint: ProgressStrokePoint | null = null;
  let drawPoints: ProgressStrokePoint[] = [];

  const flushStroke = () => {
    if (!travelPoint || drawPoints.length === 0) {
      drawPoints = [];
      return;
    }
    strokes.push({ startPoint: travelPoint, drawPoints: [...drawPoints] });
    drawPoints = [];
  };

  gcode.forEach((line, lineIdx) => {
    const upper = line.trim().toUpperCase();
    const isG0 = /^G0\b/.test(upper);
    const isG1 = /^G1\b/.test(upper);
    if (!isG0 && !isG1) return;

    const xMatch = line.match(/X(-?\d+(?:\.\d+)?)/i);
    const yMatch = line.match(/Y(-?\d+(?:\.\d+)?)/i);
    if (!xMatch || !yMatch) return;

    const mx = parseFloat(xMatch[1]);
    const my = parseFloat(yMatch[1]);
    const cx = mx;
    const cy = origin === 'top-left' ? -my : my;

    if (isG0) {
      flushStroke();
      travelPoint = { x: cx, y: cy, lineIdx };
    } else {
      drawPoints.push({ x: cx, y: cy, lineIdx });
    }
  });

  flushStroke();
  return strokes;
}

export const Canvas: React.FC<CanvasProps> = ({ units, preparedJob, onPreparedJobChange, jobProgress }) => {
  const defaultActionSpeeds = defaultActionSpeedSettings(profile);
  const [initialActionSpeeds] = React.useState(() => loadActionSpeedSettings(
    getBrowserStorage(),
    defaultActionSpeeds
  ));
  const [message, setMessage] = React.useState('Import an SVG path file to prepare a TA4 plotting job.');
  const [error, setError] = React.useState<string | null>(null);
  const [rasterMode, setRasterMode] = React.useState<RasterMode>('outline');
  const [rasterDetail, setRasterDetail] = React.useState<RasterDetail>('draft');
  const [threshold, setThreshold] = React.useState(170);
  const [brightness, setBrightness] = React.useState(0);
  const [contrast, setContrast] = React.useState(100);
  const [blurRadius, setBlurRadius] = React.useState(0);
  const [adaptiveThreshold, setAdaptiveThreshold] = React.useState(false);
  const [smoothingTolerance, setSmoothingTolerance] = React.useState(0);
  const [invertRaster, setInvertRaster] = React.useState(false);
  const [travelSpeed, _setTravelSpeed] = React.useState(initialActionSpeeds.travelSpeed);
  const [drawingSpeed, _setDrawingSpeed] = React.useState(initialActionSpeeds.drawingSpeed);
  const [penSpeed, _setPenSpeed] = React.useState(initialActionSpeeds.penSpeed);
  const travelSpeedRef = React.useRef(initialActionSpeeds.travelSpeed);
  const drawingSpeedRef = React.useRef(initialActionSpeeds.drawingSpeed);
  const penSpeedRef = React.useRef(initialActionSpeeds.penSpeed);
  const setTravelSpeed = (v: number) => { travelSpeedRef.current = v; _setTravelSpeed(v); };
  const setDrawingSpeed = (v: number) => { drawingSpeedRef.current = v; _setDrawingSpeed(v); };
  const setPenSpeed = (v: number) => { penSpeedRef.current = v; _setPenSpeed(v); };

  const [showGrid, setShowGrid] = React.useState(true);
  const [gridUnit, setGridUnit] = React.useState<GridUnit>('in');
  const [lockAspectRatio, setLockAspectRatio] = React.useState(true);
  const [magnifierActive, setMagnifierActive] = React.useState(false);
  const [magnifierPos, setMagnifierPos] = React.useState<{ x: number; y: number } | null>(null);
  // Coalesce magnifier updates to one per animation frame so a fast pointer
  // doesn't trigger a scene re-render on every mousemove event.
  const magnifierRafRef = React.useRef<number | null>(null);
  const magnifierPtRef = React.useRef<{ x: number; y: number } | null>(null);
  const scheduleMagnifier = (pt: { x: number; y: number }) => {
    magnifierPtRef.current = pt;
    if (magnifierRafRef.current !== null) return;
    magnifierRafRef.current = requestAnimationFrame(() => {
      magnifierRafRef.current = null;
      if (magnifierPtRef.current) setMagnifierPos(magnifierPtRef.current);
    });
  };
  const clearMagnifierPos = () => {
    if (magnifierRafRef.current !== null) {
      cancelAnimationFrame(magnifierRafRef.current);
      magnifierRafRef.current = null;
    }
    magnifierPtRef.current = null;
    setMagnifierPos(null);
  };
  const [isDragging, setIsDragging] = React.useState(false);
  const [, _setLayers] = React.useState<ArtworkLayer[]>([]);
  const layersRef = React.useRef<ArtworkLayer[]>([]);
  const setLayers = (update: ArtworkLayer[] | ((current: ArtworkLayer[]) => ArtworkLayer[])) => {
    const next = typeof update === 'function' ? update(layersRef.current) : update;
    layersRef.current = next;
    _setLayers(next);
  };
  const [activeLayerId, _setActiveLayerId] = React.useState<string | null>(null);
  const activeLayerIdRef = React.useRef<string | null>(null);
  const setActiveLayerId = (id: string | null) => {
    activeLayerIdRef.current = id;
    _setActiveLayerId(id);
  };

  // rawPaths: paths normalized to canvas coordinates, before any user transform.
  const [rawPaths, _setRawPaths] = React.useState<Path[] | null>(null);
  const rawPathsRef = React.useRef<Path[] | null>(null);
  const updateActiveLayer = (updater: (layer: ArtworkLayer) => ArtworkLayer) => {
    const id = activeLayerIdRef.current;
    if (!id) return;
    setLayers((current) => current.map((layer) => layer.id === id ? updater(layer) : layer));
  };
  const setRawPaths = (p: Path[] | null) => {
    rawPathsRef.current = p;
    _setRawPaths(p);
    if (p) updateActiveLayer((layer) => ({ ...layer, rawPaths: p }));
  };

  // Transform state. Refs mirror state so pointer event handlers avoid stale closures.
  const [offsetX, _setOffsetX] = React.useState(0);
  const [offsetY, _setOffsetY] = React.useState(0);
  const [imageScaleX, _setImageScaleX] = React.useState(100);
  const [imageScaleY, _setImageScaleY] = React.useState(100);
  const [rotation, _setRotation] = React.useState(0);
  const [flipX, _setFlipX] = React.useState(false);
  const [flipY, _setFlipY] = React.useState(false);
  const [artworkKind, _setArtworkKind] = React.useState<ArtworkKind>('svg');
  const [sourceFileName, _setSourceFileName] = React.useState('');
  const [sourceMimeType, _setSourceMimeType] = React.useState('');
  const [sourceDataUrl, _setSourceDataUrl] = React.useState('');
  const artworkKindRef = React.useRef<ArtworkKind>('svg');
  const sourceFileNameRef = React.useRef('');
  const sourceMimeTypeRef = React.useRef('');
  const sourceDataUrlRef = React.useRef('');
  const setArtworkKind = (v: ArtworkKind) => { artworkKindRef.current = v; _setArtworkKind(v); };
  const setSourceFileName = (v: string) => { sourceFileNameRef.current = v; _setSourceFileName(v); };
  const setSourceMimeType = (v: string) => { sourceMimeTypeRef.current = v; _setSourceMimeType(v); };
  const setSourceDataUrl = (v: string) => { sourceDataUrlRef.current = v; _setSourceDataUrl(v); };
  // Each imported plan (or freshly imported artwork) keeps its own project
  // identity so "Save plan" writes back only the active layer's plan.
  const plansRef = React.useRef<Map<string, PlanInfo>>(new Map());
  const planSeqRef = React.useRef(0);
  const artworkSeqRef = React.useRef(0);
  // Date.now keeps ids readable/sortable; the counter guarantees uniqueness for
  // imports that land in the same millisecond.
  const newArtworkId = () => `artwork-${Date.now()}-${++artworkSeqRef.current}`;
  const registerPlan = (info: PlanInfo): string => {
    const key = `plan-${++planSeqRef.current}`;
    plansRef.current.set(key, info);
    return key;
  };
  const newPlanKey = () => registerPlan({
    projectId: `project-${Date.now()}`,
    created: new Date().toISOString()
  });
  const offsetXRef = React.useRef(0);
  const offsetYRef = React.useRef(0);
  const imageScaleXRef = React.useRef(100);
  const imageScaleYRef = React.useRef(100);
  const rotationRef = React.useRef(0);
  const flipXRef = React.useRef(false);
  const flipYRef = React.useRef(false);
  const updateActiveTransform = (patch: Partial<ArtworkTransformState>) => {
    updateActiveLayer((layer) => ({ ...layer, transform: { ...layer.transform, ...patch } }));
  };
  const setOffsetX = (v: number) => { offsetXRef.current = v; _setOffsetX(v); updateActiveTransform({ x: v }); };
  const setOffsetY = (v: number) => { offsetYRef.current = v; _setOffsetY(v); updateActiveTransform({ y: v }); };
  const setImageScaleX = (v: number) => { imageScaleXRef.current = v; _setImageScaleX(v); updateActiveTransform({ scale: v }); };
  const setImageScaleY = (v: number) => { imageScaleYRef.current = v; _setImageScaleY(v); updateActiveTransform({ scaleY: v }); };
  const setImageScale = (v: number) => {
    setImageScaleX(v);
    setImageScaleY(v);
  };
  const setRotation = (v: number) => { rotationRef.current = v; _setRotation(v); updateActiveTransform({ rotation: v }); };
  const setFlipX = (v: boolean) => { flipXRef.current = v; _setFlipX(v); updateActiveTransform({ flipX: v }); };
  const setFlipY = (v: boolean) => { flipYRef.current = v; _setFlipY(v); updateActiveTransform({ flipY: v }); };

  const jobNameRef = React.useRef('');
  React.useEffect(() => { jobNameRef.current = preparedJob?.name ?? ''; }, [preparedJob]);

  const svgRef = React.useRef<SVGSVGElement>(null);
  const importPlanInputRef = React.useRef<HTMLInputElement>(null);
  const dragState = React.useRef<DragState | null>(null);
  const rasterSourceFileRef = React.useRef<File | null>(null);
  const layerRasterSourceFilesRef = React.useRef<Map<string, File>>(new Map());
  const rasterReloadSeq = React.useRef(0);

  const progressStrokes = React.useMemo(
    () => preparedJob ? buildProgressStrokes(preparedJob.gcode, profile.origin) : [],
    [preparedJob]
  );

  const isPrinting = Boolean(jobProgress);

  // --- Derived display geometry ---
  const rawBounds = rawPaths ? computeAllBounds(rawPaths) : null;
  const rawCenterX = rawBounds ? (rawBounds.minX + rawBounds.maxX) / 2 : canvas.width / 2;
  const rawCenterY = rawBounds ? (rawBounds.minY + rawBounds.maxY) / 2 : canvas.height / 2;
  const rawWidth = rawBounds ? rawBounds.maxX - rawBounds.minX : 0;
  const rawHeight = rawBounds ? rawBounds.maxY - rawBounds.minY : 0;
  const imageWidth = rawWidth * imageScaleX / 100;
  const imageHeight = rawHeight * imageScaleY / 100;

  const sx = (imageScaleX / 100) * (flipX ? -1 : 1);
  const sy = (imageScaleY / 100) * (flipY ? -1 : 1);
  const rad = (rotation * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  // Maps a point in raw image coordinates to its position in SVG display space
  const toDisplay = (x: number, y: number) => ({
    x: rawCenterX + offsetX + (x - rawCenterX) * sx * cosR - (y - rawCenterY) * sy * sinR,
    y: rawCenterY + offsetY + (x - rawCenterX) * sx * sinR + (y - rawCenterY) * sy * cosR
  });

  // SVG transform for the image <g> — scale then rotate then translate, all around image center
  const imgGroupTransform = rawBounds
    ? `translate(${rawCenterX + offsetX},${rawCenterY + offsetY}) rotate(${rotation}) scale(${sx},${sy}) translate(${-rawCenterX},${-rawCenterY})`
    : '';

  const layerGroupTransform = (layer: ArtworkLayer): string => {
    const bounds = computeAllBounds(layer.rawPaths);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const layerSx = (layer.transform.scale / 100) * (layer.transform.flipX ? -1 : 1);
    const layerSy = (layer.transform.scaleY / 100) * (layer.transform.flipY ? -1 : 1);
    return `translate(${cx + layer.transform.x},${cy + layer.transform.y}) rotate(${layer.transform.rotation}) scale(${layerSx},${layerSy}) translate(${-cx},${-cy})`;
  };

  const snapshotActiveLayer = (): ArtworkLayer | null => {
    const paths = rawPathsRef.current;
    if (!activeLayerIdRef.current || !paths || !sourceDataUrlRef.current) return null;
    const existingLayer = layersRef.current.find((layer) => layer.id === activeLayerIdRef.current);
    return {
      id: activeLayerIdRef.current,
      planKey: existingLayer?.planKey ?? '',
      name: sourceFileNameRef.current || jobNameRef.current || 'Untitled artwork',
      rawPaths: paths,
      artworkKind: artworkKindRef.current,
      sourceFileName: sourceFileNameRef.current,
      sourceMimeType: sourceMimeTypeRef.current,
      sourceDataUrl: sourceDataUrlRef.current,
      rasterSettings: getRasterSettings(),
      transform: {
        x: offsetXRef.current,
        y: offsetYRef.current,
        scale: imageScaleXRef.current,
        scaleY: imageScaleYRef.current,
        rotation: rotationRef.current,
        flipX: flipXRef.current,
        flipY: flipYRef.current
      },
      visible: existingLayer?.visible ?? true,
      previewColor: existingLayer?.previewColor,
      actionSpeeds: {
        travelSpeed: travelSpeedRef.current,
        drawingSpeed: drawingSpeedRef.current,
        penSpeed: penSpeedRef.current
      }
    };
  };

  const mergedLayers = (): ArtworkLayer[] => {
    const activeSnapshot = snapshotActiveLayer();
    if (!activeSnapshot) return layersRef.current;
    return layersRef.current.map((layer) => layer.id === activeSnapshot.id ? activeSnapshot : layer);
  };

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
    x: topCenter.x + (flipX ? 1 : -1) * ROTATE_HANDLE_DIST * sinR,
    y: topCenter.y - (flipY ? 1 : -1) * ROTATE_HANDLE_DIST * cosR
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

  const buildJobFromLayer = (layer: ArtworkLayer): PreparedJob => {
    const bounds = computeAllBounds(layer.rawPaths);
    const transformed = applyArtworkTransform(
      layer.rawPaths,
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      layer.transform.scale,
      layer.transform.scaleY,
      layer.transform.x,
      layer.transform.y,
      layer.transform.rotation,
      layer.transform.flipX,
      layer.transform.flipY
    );
    const generator = new GCodeGenerator(profile, canvas, layer.actionSpeeds);
    const result = generator.generate(transformed);
    return { name: layer.name, paths: transformed, gcode: result.gcode, warnings: result.warnings };
  };

  // Keeps the Machine tab in sync with layer visibility: exactly one shown
  // layer becomes the runnable job; several shown layers block execution.
  const syncMachineJob = (precomputedActiveJob?: PreparedJob) => {
    const allLayers = layersRef.current;
    const activeId = activeLayerIdRef.current;
    const activeEntry = allLayers.find((layer) => layer.id === activeId);
    const activeVisible = activeEntry ? activeEntry.visible && activeEntry.rawPaths.length > 0 : Boolean(precomputedActiveJob);
    const visibleOthers = allLayers.filter((layer) => (
      layer.id !== activeId && layer.visible && layer.rawPaths.length > 0
    ));
    const visibleCount = visibleOthers.length + (activeVisible ? 1 : 0);

    if (visibleCount > 1) {
      onPreparedJobChange({
        name: `${visibleCount} layers shown`,
        paths: [],
        gcode: [],
        warnings: [],
        runBlockedReason: 'Only one layer can be shown to run a job. Hide the other layers on the Artwork tab.'
      });
      return;
    }
    if (activeVisible) {
      const activeJob = precomputedActiveJob
        ?? (() => {
          const snapshot = snapshotActiveLayer() ?? activeEntry;
          return snapshot ? buildJobFromLayer(snapshot) : null;
        })();
      onPreparedJobChange(activeJob);
      return;
    }
    if (visibleOthers.length === 1) {
      onPreparedJobChange(buildJobFromLayer(visibleOthers[0]));
      return;
    }
    onPreparedJobChange(null);
  };

  const regenerateJob = (
    paths: Path[],
    name: string,
    cx: number,
    cy: number,
    scaleXPct: number,
    scaleYPct: number,
    dx: number,
    dy: number,
    rotateDeg: number,
    nextFlipX: boolean = flipXRef.current,
    nextFlipY: boolean = flipYRef.current
  ) => {
    const transformed = applyArtworkTransform(paths, cx, cy, scaleXPct, scaleYPct, dx, dy, rotateDeg, nextFlipX, nextFlipY);
    const generator = new GCodeGenerator(profile, canvas, { travelSpeed: travelSpeedRef.current, drawingSpeed: drawingSpeedRef.current, penSpeed: penSpeedRef.current });
    const result = generator.generate(transformed);
    syncMachineJob({ name, paths: transformed, gcode: result.gcode, warnings: result.warnings });
    setMessage(`${name}: ${transformed.length} stroke${transformed.length === 1 ? '' : 's'}, ${result.gcode.length} G-code lines.`);
  };

  const applyTransformAndRegenerate = (
    scaleXPct: number,
    scaleYPct: number,
    dx: number,
    dy: number,
    rotateDeg: number,
    nextFlipX: boolean = flipXRef.current,
    nextFlipY: boolean = flipYRef.current
  ) => {
    const paths = rawPathsRef.current;
    if (!paths) return;
    const bounds = computeAllBounds(paths);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    regenerateJob(paths, jobNameRef.current, cx, cy, scaleXPct, scaleYPct, dx, dy, rotateDeg, nextFlipX, nextFlipY);
  };

  const getRasterSettings = (): RasterTraceSettings => ({
    mode: rasterMode,
    detail: rasterDetail,
    threshold,
    brightness,
    contrast,
    blurRadius,
    adaptiveThreshold,
    smoothingTolerance,
    invertRaster
  });

  const dataUrlToFile = async (dataUrl: string, name: string, mimeType: string): Promise<File> => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], name || 'raster-artwork', { type: mimeType || blob.type || 'application/octet-stream' });
  };

  const getReloadableRasterFile = async (): Promise<File | null> => {
    if (rasterSourceFileRef.current) return rasterSourceFileRef.current;
    const activeId = activeLayerIdRef.current;
    if (activeId) {
      const layerFile = layerRasterSourceFilesRef.current.get(activeId);
      if (layerFile) {
        rasterSourceFileRef.current = layerFile;
        return layerFile;
      }
    }
    if (!sourceDataUrl || artworkKind !== 'raster') return null;
    const file = await dataUrlToFile(sourceDataUrl, sourceFileName, sourceMimeType);
    if (activeLayerIdRef.current === activeId) {
      rasterSourceFileRef.current = file;
    }
    if (activeId) layerRasterSourceFilesRef.current.set(activeId, file);
    return file;
  };

  const reloadRasterArtwork = async (settings: RasterTraceSettings) => {
    if (artworkKind !== 'raster') return;
    const reloadId = ++rasterReloadSeq.current;
    setError(null);
    try {
      const file = await getReloadableRasterFile();
      if (!file || reloadId !== rasterReloadSeq.current) return;

      const paths = await prepareRasterPaths(file, settings);
      if (reloadId !== rasterReloadSeq.current) return;
      if (paths.length === 0) {
        throw new Error('No drawable paths were found.');
      }

      setRawPaths(paths);
      const bounds = computeAllBounds(paths);
      const scaleX = imageScaleXRef.current;
      const scaleY = imageScaleYRef.current;
      const dx = offsetXRef.current;
      const dy = offsetYRef.current;
      const rotateDeg = rotationRef.current;
      const nextFlipX = flipXRef.current;
      const nextFlipY = flipYRef.current;
      regenerateJob(
        paths,
        jobNameRef.current || sourceFileName || file.name,
        (bounds.minX + bounds.maxX) / 2,
        (bounds.minY + bounds.maxY) / 2,
        scaleX,
        scaleY,
        dx,
        dy,
        rotateDeg,
        nextFlipX,
        nextFlipY
      );
    } catch (caught) {
      if (reloadId !== rasterReloadSeq.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setMessage('Raster trace update failed.');
    }
  };

  const updateRasterSettings = (settings: RasterTraceSettings) => {
    setRasterMode(settings.mode);
    setRasterDetail(settings.detail);
    setThreshold(settings.threshold);
    setBrightness(settings.brightness);
    setContrast(settings.contrast);
    setBlurRadius(settings.blurRadius);
    setAdaptiveThreshold(settings.adaptiveThreshold);
    setSmoothingTolerance(settings.smoothingTolerance);
    setInvertRaster(settings.invertRaster);
    updateActiveLayer((layer) => ({ ...layer, rasterSettings: settings }));
    void reloadRasterArtwork(settings);
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
      startScaleX: imageScaleXRef.current,
      startScaleY: imageScaleYRef.current,
      startRotation: rotationRef.current,
      startFlipX: flipXRef.current,
      startFlipY: flipYRef.current,
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
      startScaleX: imageScaleXRef.current,
      startScaleY: imageScaleYRef.current,
      startRotation: rotationRef.current,
      startFlipX: flipXRef.current,
      startFlipY: flipYRef.current,
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
      startScaleX: imageScaleXRef.current,
      startScaleY: imageScaleYRef.current,
      startRotation: rotationRef.current,
      startFlipX: flipXRef.current,
      startFlipY: flipYRef.current,
      startAngle: Math.atan2(pt.y - displayCy, pt.x - displayCx),
      rawBounds: bounds,
      center: { x: cx, y: cy }
    };
    setIsDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (magnifierActive) scheduleMagnifier(getSvgPt(e));

    const state = dragState.current;
    if (!state) return;

    const pt = getSvgPt(e);

    if (state.mode === 'move') {
      setOffsetX(state.startOffset.x + pt.x - state.startPt.x);
      setOffsetY(state.startOffset.y + pt.y - state.startPt.y);
    } else if (state.mode === 'resize') {
      const displayCx = state.center.x + state.startOffset.x;
      const displayCy = state.center.y + state.startOffset.y;
      const sx0 = (state.startScaleX / 100) * (state.startFlipX ? -1 : 1);
      const sy0 = (state.startScaleY / 100) * (state.startFlipY ? -1 : 1);
      const rad0 = (state.startRotation * Math.PI) / 180;
      const cosR0 = Math.cos(rad0);
      const sinR0 = Math.sin(rad0);
      // Bottom-right corner of raw bounds in display space at drag start
      const lx = (state.rawBounds.maxX - state.center.x) * sx0;
      const ly = (state.rawBounds.maxY - state.center.y) * sy0;
      const initCornerX = displayCx + lx * cosR0 - ly * sinR0;
      const initCornerY = displayCy + lx * sinR0 + ly * cosR0;
      const initDist = Math.hypot(initCornerX - displayCx, initCornerY - displayCy);
      const currDist = Math.hypot(pt.x - displayCx, pt.y - displayCy);
      if (initDist > 0.5) {
        const ratio = currDist / initDist;
        setImageScaleX(Math.max(5, Math.min(500, Math.round(state.startScaleX * ratio))));
        setImageScaleY(Math.max(5, Math.min(500, Math.round(state.startScaleY * ratio))));
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
    applyTransformAndRegenerate(imageScaleXRef.current, imageScaleYRef.current, offsetXRef.current, offsetYRef.current, rotationRef.current);
  };

  // --- Manual control handlers ---

  const handleOffsetChange = (axis: 'x' | 'y', value: number) => {
    const dx = axis === 'x' ? value : offsetXRef.current;
    const dy = axis === 'y' ? value : offsetYRef.current;
    setOffsetX(dx);
    setOffsetY(dy);
    applyTransformAndRegenerate(imageScaleXRef.current, imageScaleYRef.current, dx, dy, rotationRef.current);
  };

  const handleScaleChange = (newScale: number) => {
    setImageScale(newScale);
    applyTransformAndRegenerate(newScale, newScale, offsetXRef.current, offsetYRef.current, rotationRef.current);
  };

  const handleDimensionChange = (axis: 'width' | 'height', valueMm: number) => {
    if (!rawBounds || !Number.isFinite(valueMm) || valueMm <= 0) return;
    const clamp = (scale: number) => Math.max(5, Math.min(500, scale));
    const raw = axis === 'width' ? rawWidth : rawHeight;
    if (raw <= 0) return;

    const currentScale = axis === 'width' ? imageScaleXRef.current : imageScaleYRef.current;
    const targetScale = (valueMm / raw) * 100;

    let nextScaleX: number;
    let nextScaleY: number;
    if (lockAspectRatio) {
      // Scale both axes by a single factor so the ratio is preserved, but clamp
      // the factor itself so neither axis can leave the [5, 500] range — clamping
      // the axes independently would distort the image at the boundary.
      const desiredFactor = targetScale / currentScale;
      const minFactor = Math.max(5 / imageScaleXRef.current, 5 / imageScaleYRef.current);
      const maxFactor = Math.min(500 / imageScaleXRef.current, 500 / imageScaleYRef.current);
      const factor = Math.min(maxFactor, Math.max(minFactor, desiredFactor));
      nextScaleX = imageScaleXRef.current * factor;
      nextScaleY = imageScaleYRef.current * factor;
    } else {
      nextScaleX = axis === 'width' ? clamp(targetScale) : imageScaleXRef.current;
      nextScaleY = axis === 'width' ? imageScaleYRef.current : clamp(targetScale);
    }

    setImageScaleX(nextScaleX);
    setImageScaleY(nextScaleY);
    applyTransformAndRegenerate(nextScaleX, nextScaleY, offsetXRef.current, offsetYRef.current, rotationRef.current);
  };

  const handleRotationChange = (newRotation: number) => {
    setRotation(newRotation);
    applyTransformAndRegenerate(imageScaleXRef.current, imageScaleYRef.current, offsetXRef.current, offsetYRef.current, newRotation);
  };

  const handleFlipChange = (axis: 'x' | 'y') => {
    const nextFlipX = axis === 'x' ? !flipXRef.current : flipXRef.current;
    const nextFlipY = axis === 'y' ? !flipYRef.current : flipYRef.current;
    setFlipX(nextFlipX);
    setFlipY(nextFlipY);
    applyTransformAndRegenerate(
      imageScaleXRef.current,
      imageScaleYRef.current,
      offsetXRef.current,
      offsetYRef.current,
      rotationRef.current,
      nextFlipX,
      nextFlipY
    );
  };

  const handleResetTransform = () => {
    setOffsetX(0);
    setOffsetY(0);
    setImageScale(100);
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
    applyTransformAndRegenerate(100, 100, 0, 0, 0, false, false);
  };

  const handleSpeedChange = (kind: 'travel' | 'drawing' | 'pen', value: number) => {
    const nextValue = Math.max(MIN_ACTION_SPEED, Math.min(MAX_ACTION_SPEED, Number.isFinite(value) ? value : MIN_ACTION_SPEED));
    if (kind === 'travel') {
      setTravelSpeed(nextValue);
    } else if (kind === 'drawing') {
      setDrawingSpeed(nextValue);
    } else {
      setPenSpeed(nextValue);
    }
  };

  React.useEffect(() => {
    saveActionSpeedSettings(getBrowserStorage(), {
      travelSpeed,
      drawingSpeed,
      penSpeed
    });
    applyTransformAndRegenerate(imageScaleXRef.current, imageScaleYRef.current, offsetXRef.current, offsetYRef.current, rotationRef.current);
  }, [travelSpeed, drawingSpeed, penSpeed]);

  const handleResetSpeeds = () => {
    setTravelSpeed(defaultActionSpeeds.travelSpeed);
    setDrawingSpeed(defaultActionSpeeds.drawingSpeed);
    setPenSpeed(defaultActionSpeeds.penSpeed);
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read artwork file.'));
      reader.readAsDataURL(file);
    });
  };

  const hydrateActiveLayer = (layer: ArtworkLayer) => {
    setActiveLayerId(layer.id);
    rawPathsRef.current = layer.rawPaths;
    _setRawPaths(layer.rawPaths);
    offsetXRef.current = layer.transform.x;
    offsetYRef.current = layer.transform.y;
    imageScaleXRef.current = layer.transform.scale;
    imageScaleYRef.current = layer.transform.scaleY;
    rotationRef.current = layer.transform.rotation;
    flipXRef.current = layer.transform.flipX;
    flipYRef.current = layer.transform.flipY;
    _setOffsetX(layer.transform.x);
    _setOffsetY(layer.transform.y);
    _setImageScaleX(layer.transform.scale);
    _setImageScaleY(layer.transform.scaleY);
    _setRotation(layer.transform.rotation);
    _setFlipX(layer.transform.flipX);
    _setFlipY(layer.transform.flipY);
    setArtworkKind(layer.artworkKind);
    setSourceFileName(layer.sourceFileName);
    setSourceMimeType(layer.sourceMimeType);
    setSourceDataUrl(layer.sourceDataUrl);
    setRasterMode(layer.rasterSettings.mode);
    setRasterDetail(layer.rasterSettings.detail);
    setThreshold(layer.rasterSettings.threshold);
    setBrightness(layer.rasterSettings.brightness);
    setContrast(layer.rasterSettings.contrast);
    setBlurRadius(layer.rasterSettings.blurRadius);
    setAdaptiveThreshold(layer.rasterSettings.adaptiveThreshold);
    setSmoothingTolerance(layer.rasterSettings.smoothingTolerance);
    setInvertRaster(layer.rasterSettings.invertRaster);
    rasterSourceFileRef.current = layerRasterSourceFilesRef.current.get(layer.id) ?? null;
    setTravelSpeed(layer.actionSpeeds.travelSpeed);
    setDrawingSpeed(layer.actionSpeeds.drawingSpeed);
    setPenSpeed(layer.actionSpeeds.penSpeed);

    const bounds = computeAllBounds(layer.rawPaths);
    regenerateJob(
      layer.rawPaths,
      layer.name,
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      layer.transform.scale,
      layer.transform.scaleY,
      layer.transform.x,
      layer.transform.y,
      layer.transform.rotation,
      layer.transform.flipX,
      layer.transform.flipY
    );
  };

  const handleSelectLayer = (id: string) => {
    const nextLayers = mergedLayers();
    setLayers(nextLayers);
    const layer = nextLayers.find((candidate) => candidate.id === id);
    if (layer) hydrateActiveLayer(layer);
  };

  const toggleLayerVisibility = (id: string) => {
    setLayers((current) => current.map((layer) => (
      layer.id === id ? { ...layer, visible: !layer.visible } : layer
    )));
    syncMachineJob();
    const visibleLayers = layersRef.current.filter((layer) => layer.visible && layer.rawPaths.length > 0);
    if (visibleLayers.length > 1) {
      setMessage(`${visibleLayers.length} layers shown — show exactly one to run it on the machine.`);
    } else if (visibleLayers.length === 1) {
      setMessage(`${visibleLayers[0].name} is loaded on the Machine tab.`);
    } else {
      setMessage('No layers shown. Show one layer to prepare a machine job.');
    }
  };

  const setLayerPreviewColor = (id: string, previewColor: string) => {
    setLayers((current) => current.map((layer) => (
      layer.id === id ? { ...layer, previewColor } : layer
    )));
  };

  const savedObjectFromLayer = (layer: ArtworkLayer): SavedCanvasObject => ({
    id: layer.id,
    type: layer.artworkKind === 'svg' ? 'svg_path' : 'raster_image',
    source: layer.sourceDataUrl,
    transform: {
      x: layer.transform.x,
      y: layer.transform.y,
      scale: layer.transform.scale,
      scaleY: layer.transform.scaleY,
      rotation: layer.transform.rotation,
      flipX: layer.transform.flipX,
      flipY: layer.transform.flipY
    },
    visible: layer.visible,
    previewColor: layer.previewColor,
    paths: layer.rawPaths,
    metadata: {
      formatVersion: 1,
      artworkKind: layer.artworkKind,
      fileName: layer.sourceFileName || layer.name,
      mimeType: layer.sourceMimeType,
      sourceDataUrl: layer.sourceDataUrl,
      rasterSettings: layer.rasterSettings,
      actionSpeeds: layer.actionSpeeds
    }
  });

  // Saves only the active layer's plan: its layers, project identity, and file path.
  const buildSavedProject = (): { project: SavedProjectData; planKey: string; filePath?: string } | null => {
    const allLayers = mergedLayers();
    const activeLayer = allLayers.find((layer) => layer.id === activeLayerIdRef.current) ?? allLayers[0];
    if (!activeLayer) return null;

    const planKey = activeLayer.planKey;
    const planLayers = allLayers.filter((layer) => layer.planKey === planKey);
    const plan = plansRef.current.get(planKey) ?? {
      projectId: `project-${Date.now()}`,
      created: new Date().toISOString()
    };
    const name = activeLayer.name || jobNameRef.current || sourceFileName || 'Untitled artwork';

    return {
      planKey,
      filePath: plan.filePath,
      project: withSavedAtNow({
        id: plan.projectId,
        name,
        created: plan.created,
        machineProfileId: profile.id,
        units,
        canvas,
        objects: planLayers.map(savedObjectFromLayer),
        activeObjectId: activeLayer.id
      })
    };
  };

  const handleSaveProject = async () => {
    setError(null);
    const built = buildSavedProject();
    if (!built) {
      setError('Load artwork before saving a plan.');
      return;
    }

    const api = (window as unknown as { api?: { project?: ProjectApi } }).api?.project;
    if (!api) {
      setError('Project saving is only available in the desktop app.');
      return;
    }

    const result = await api.save(built.project, built.filePath);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const saved = result.data as LoadedSavedProjectData | undefined;
    if (saved?.filePath) {
      const plan = plansRef.current.get(built.planKey);
      plansRef.current.set(built.planKey, {
        projectId: plan?.projectId ?? built.project.id,
        created: plan?.created ?? built.project.created,
        filePath: saved.filePath
      });
    }
    setMessage(saved?.filePath
      ? `Saved plan "${built.project.name}" to: ${saved.filePath}.`
      : `Saved plan "${built.project.name}" to your Downloads folder.`);
  };

  const applyLoadedProject = (project: LoadedSavedProjectData, importedFileName: string) => {
    const objects = project.objects ?? [];
    const validObjects = objects.filter((object) => Array.isArray(object.paths) && object.paths.length > 0);
    if (validObjects.length === 0) {
      throw new Error('Plan file has no artwork objects.');
    }

    // Importing a plan while layers exist overlays the new plan on top of the
    // current one instead of replacing it; ids are remapped to stay unique.
    const existingLayers = mergedLayers();
    const merging = existingLayers.length > 0;
    if (!merging) plansRef.current.clear();
    const planKey = registerPlan({
      projectId: project.id || `project-${Date.now()}`,
      created: project.created || new Date().toISOString(),
      filePath: project.filePath
    });

    const loadedLayers: ArtworkLayer[] = validObjects.map((object, index) => {
      const metadata = object.metadata;
      return {
        id: object.id || `artwork-${index + 1}`,
        planKey,
        name: metadata?.fileName || object.id || `Artwork ${index + 1}`,
        rawPaths: object.paths,
        artworkKind: metadata?.artworkKind ?? (object.type === 'raster_image' ? 'raster' : 'svg'),
        sourceFileName: metadata?.fileName ?? project.name,
        sourceMimeType: metadata?.mimeType ?? '',
        sourceDataUrl: metadata?.sourceDataUrl ?? object.source ?? '',
        rasterSettings: metadata?.rasterSettings ?? {
          mode: 'outline',
          detail: 'draft',
          threshold: 170,
          brightness: 0,
          contrast: 100,
          blurRadius: 0,
          adaptiveThreshold: false,
          smoothingTolerance: 0,
          invertRaster: false
        },
        transform: {
          x: Number(object.transform?.x ?? 0),
          y: Number(object.transform?.y ?? 0),
          scale: Number(object.transform?.scale ?? 100),
          scaleY: Number(object.transform?.scaleY ?? object.transform?.scale ?? 100),
          rotation: Number(object.transform?.rotation ?? 0),
          flipX: Boolean(object.transform?.flipX),
          flipY: Boolean(object.transform?.flipY)
        },
        visible: object.visible !== false,
        previewColor: typeof object.previewColor === 'string' ? object.previewColor : undefined,
        actionSpeeds: metadata?.actionSpeeds ?? {
          travelSpeed,
          drawingSpeed,
          penSpeed
        }
      };
    });
    const activeIndex = Math.max(0, loadedLayers.findIndex((layer) => layer.id === project.activeObjectId));

    let layersToAdd = loadedLayers;
    if (merging) {
      const usedIds = new Set(existingLayers.map((layer) => layer.id));
      layersToAdd = loadedLayers.map((layer) => {
        let nextId = layer.id;
        let suffix = 2;
        while (usedIds.has(nextId)) nextId = `${layer.id}-${suffix++}`;
        usedIds.add(nextId);
        return nextId === layer.id ? layer : { ...layer, id: nextId };
      });
      setLayers([...existingLayers, ...layersToAdd]);
    } else {
      layerRasterSourceFilesRef.current.clear();
      setLayers(layersToAdd);
    }
    const activeLayer = layersToAdd[activeIndex];
    hydrateActiveLayer(activeLayer);

    console.info('[Artwork] loaded plan', {
      name: project.name,
      importedFileName,
      merged: merging,
      layers: layersToAdd.length,
      activeObjectId: activeLayer.id
    });
  };

  const parseSavedProjectFile = async (file: File): Promise<LoadedSavedProjectData | null> => {
    let contents: string;
    try {
      contents = await file.text();
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : String(caught);
      throw new Error(`Could not read plan file: ${reason}`);
    }

    try {
      const parsed = JSON.parse(contents);
      if (!isSavedProjectData(parsed)) return null;
      const parsedRecord = parsed as LoadedSavedProjectData;
      const parsedFilePath = typeof parsedRecord.filePath === 'string' && parsedRecord.filePath !== ''
        ? parsedRecord.filePath
        : undefined;
      const inputFilePath = typeof (file as File & { path?: unknown }).path === 'string'
        ? (file as File & { path: string }).path
        : undefined;
      return { ...parsed, filePath: parsedFilePath ?? inputFilePath };
    } catch (caught) {
      if (caught instanceof SyntaxError) return null;
      throw caught;
    }
  };

  const loadProjectFile = async (file: File): Promise<boolean> => {
    const project = await parseSavedProjectFile(file);
    if (!project) {
      return false;
    }
    applyLoadedProject(project, file.name);
    return true;
  };

  const handleLoadProject = async (file: File | undefined) => {
    await handleOpenFile(file);
  };

  const shouldLoadAsProject = (file: File): boolean => {
    const lowerName = file.name.toLowerCase();
    return lowerName.endsWith('.boc.json') || lowerName.endsWith('.json') || file.type === 'application/json';
  };

  const handleOpenFile = async (file: File | undefined) => {
    if (!file) return;
    const startedAt = performance.now();
    const isProjectCandidate = shouldLoadAsProject(file);
    console.info('[Artwork] open file', {
      name: file.name,
      type: file.type || '(empty)',
      size: file.size,
      route: isProjectCandidate ? 'plan' : 'artwork'
    });

    if (isProjectCandidate) {
      try {
        setError(null);
        const loaded = await loadProjectFile(file);
        if (!loaded) throw new Error('Plan file must contain a saved Bachin Open Controller project.');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setMessage('Plan load failed.');
      }
      console.info('[Artwork] open complete', {
        name: file.name,
        route: 'plan',
        durationMs: Math.round(performance.now() - startedAt)
      });
      return;
    }

    await importArtwork(file);
    console.info('[Artwork] open complete', {
      name: file.name,
      route: 'artwork',
      durationMs: Math.round(performance.now() - startedAt)
    });
  };

  // --- Import and clear ---

  const handleClear = () => {
    rasterReloadSeq.current += 1;
    rasterSourceFileRef.current = null;
    layerRasterSourceFilesRef.current.clear();
    setLayers([]);
    setActiveLayerId(null);
    setRawPaths(null);
    setOffsetX(0);
    setOffsetY(0);
    setImageScale(100);
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
    setSourceFileName('');
    setSourceMimeType('');
    setSourceDataUrl('');
    plansRef.current.clear();
    onPreparedJobChange(null);
    setMessage('Import an SVG path file to prepare a TA4 plotting job.');
    setError(null);
  };

  const importArtwork = async (file: File | undefined) => {
    if (!file) return;
    rasterReloadSeq.current += 1;
    rasterSourceFileRef.current = null;
    setError(null);

    try {
      const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
      const dataUrl = await fileToDataUrl(file);
      const paths = isSvg ? await prepareSvgPaths(file) : await prepareRasterPaths(file, getRasterSettings());
      if (paths.length === 0) {
        throw new Error('No drawable paths were found.');
      }

      // New artwork joins the active layer's plan; with nothing loaded it starts a new plan.
      const activePlanKey = activeLayerIdRef.current
        ? layersRef.current.find((layer) => layer.id === activeLayerIdRef.current)?.planKey
        : undefined;
      const id = newArtworkId();
      const nextLayer: ArtworkLayer = {
        id,
        planKey: activePlanKey ?? newPlanKey(),
        name: file.name,
        rawPaths: paths,
        artworkKind: isSvg ? 'svg' : 'raster',
        sourceFileName: file.name,
        sourceMimeType: inferImageMimeType(file),
        sourceDataUrl: dataUrl,
        rasterSettings: getRasterSettings(),
        transform: {
          x: 0,
          y: 0,
          scale: 100,
          scaleY: 100,
          rotation: 0,
          flipX: false,
          flipY: false
        },
        visible: true,
        actionSpeeds: {
          travelSpeed: travelSpeedRef.current,
          drawingSpeed: drawingSpeedRef.current,
          penSpeed: penSpeedRef.current
        }
      };
      const nextLayers = activeLayerIdRef.current ? [...mergedLayers(), nextLayer] : [nextLayer];
      setLayers(nextLayers);
      if (!isSvg) layerRasterSourceFilesRef.current.set(id, file);
      hydrateActiveLayer(nextLayer);

      console.info('[Artwork] imported artwork', {
        name: file.name,
        kind: isSvg ? 'svg' : 'raster',
        paths: paths.length
      });
    } catch (caught) {
      setRawPaths(null);
      rasterSourceFileRef.current = null;
      onPreparedJobChange(null);
      setError(caught instanceof Error ? caught.message : String(caught));
      setMessage('Artwork import failed.');
    }
  };

  const prepareSvgPaths = async (file: File): Promise<Path[]> => {
    const svgContent = await file.text();
    const parser = new SVGParser();
    const rawParsedPaths = parser.parse(svgContent);
    return normalizePaths(rawParsedPaths);
  };

  const prepareRasterPaths = async (file: File, settings: RasterTraceSettings): Promise<Path[]> => {
    const startedAt = performance.now();
    const image = await loadRasterSource(file);
    const decodedAt = performance.now();
    console.info('[Artwork] decoded raster', {
      name: file.name,
      width: image.width,
      height: image.height,
      detail: settings.detail,
      mode: settings.mode,
      durationMs: Math.round(decodedAt - startedAt)
    });
    const maxTraceSize = RASTER_TRACE_SIZES[settings.detail];
    const scale = Math.min(1, maxTraceSize / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const scratch = document.createElement('canvas');
    scratch.width = width;
    scratch.height = height;
    const context = scratch.getContext('2d');
    if (!context) {
      throw new Error('Canvas image processing is not available.');
    }

    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image.image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    if (settings.invertRaster) {
      invertImageData(imageData.data);
    }
    image.cleanup();

    const traced = traceRasterToPaths(imageData.data, width, height, {
      mode: settings.mode,
      threshold: settings.threshold,
      xStep: 1,
      yStep: settings.detail === 'fine' || settings.detail === 'ultra' || settings.detail === 'max' || settings.mode === 'dither' ? 1 : 2,
      minRunLength: 2,
      blurRadius: settings.blurRadius,
      brightness: settings.brightness,
      contrast: settings.contrast,
      adaptiveThreshold: settings.adaptiveThreshold,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });

    const smoothed = smoothPaths(traced, settings.smoothingTolerance);
    console.info('[Artwork] traced raster', {
      name: file.name,
      traceWidth: width,
      traceHeight: height,
      paths: smoothed.length,
      durationMs: Math.round(performance.now() - decodedAt)
    });
    return smoothed;
  };

  const loadRasterSource = async (file: File): Promise<RasterSource> => {
    const arrayBuffer = await file.arrayBuffer();
    if (isPhotoshopSignature(arrayBuffer)) {
      console.info('[Artwork] rejected PSD signature', { name: file.name });
      throw new Error(`${file.name} is a Photoshop PSD file renamed as .png. Export it as a real PNG or JPEG first.`);
    }

    const blob = new Blob([arrayBuffer], { type: inferImageMimeType(file) });

    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(blob);
        console.info('[Artwork] decoded with createImageBitmap', {
          name: file.name,
          width: bitmap.width,
          height: bitmap.height
        });
        return {
          image: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => bitmap.close()
        };
      } catch {
        // Fall through to the HTMLImageElement decoder below.
      }
    }

    return loadHtmlImage(file, blob);
  };

  const loadHtmlImage = (file: File, blob: Blob): Promise<RasterSource> => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(blob);
      const cleanup = () => {
        image.removeAttribute('src');
        URL.revokeObjectURL(objectUrl);
      };
      image.onload = () => resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup
      });
      image.onerror = () => {
        cleanup();
        console.info('[Artwork] image element decode failed', { name: file.name });
        reject(new Error(`Could not load ${file.name}. Use a PNG, JPEG, or SVG image.`));
      };
      image.src = objectUrl;
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
  const unitLabel = UNIT_LABELS[units];
  const previewLayers = mergedLayers();
  const inactivePreviewLayers = previewLayers.filter((layer) => (
    layer.visible && layer.id !== activeLayerId && layer.rawPaths.length > 0
  ));
  const layerStrokeColor = (layer: ArtworkLayer): string => {
    if (layer.previewColor) return layer.previewColor;
    if (layer.id === activeLayerId) return ACTIVE_LAYER_COLOR;
    const inactiveIndex = inactivePreviewLayers.findIndex((candidate) => candidate.id === layer.id);
    return INACTIVE_LAYER_COLORS[Math.max(0, inactiveIndex) % INACTIVE_LAYER_COLORS.length];
  };
  const activePreviewLayer = previewLayers.find((layer) => layer.id === activeLayerId);
  const activeStrokeColor = activePreviewLayer ? layerStrokeColor(activePreviewLayer) : ACTIVE_LAYER_COLOR;

  // Renders the grid + artwork layers shared by the main preview and the
  // magnifier window. Pattern ids are suffixed so the two SVGs don't collide.
  const renderPreviewScene = (idSuffix: string, interactive: boolean) => {
    const minorId = `gridMinor-${idSuffix}`;
    const majorId = `gridMajor-${idSuffix}`;
    return (
      <>
        <defs>
          {showGrid && (() => {
            const { minor, major } = GRID_SPACING[gridUnit];
            return (
              <>
                <pattern id={minorId} width={minor} height={minor} patternUnits="userSpaceOnUse">
                  <path d={`M ${minor} 0 L 0 0 0 ${minor}`} fill="none" stroke="#dce2e8" strokeWidth="0.25" />
                </pattern>
                <pattern id={majorId} width={major} height={major} patternUnits="userSpaceOnUse">
                  <rect width={major} height={major} fill={`url(#${minorId})`} />
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
          <rect x="0" y="0" width={canvas.width} height={canvas.height} fill={`url(#${majorId})`} style={{ pointerEvents: 'none' }} />
        )}

        {!isPrinting && inactivePreviewLayers.map((layer) => (
          <g
            key={layer.id}
            transform={layerGroupTransform(layer)}
            opacity={INACTIVE_LAYER_OPACITY}
            style={{ pointerEvents: 'none' }}
          >
            {layer.rawPaths.map((path) => (
              <polyline
                key={`${layer.id}-${path.id}`}
                points={pathToPoints(path)}
                fill="none"
                stroke={layerStrokeColor(layer)}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        ))}

        {rawPaths && !isPrinting && (
          <g
            transform={imgGroupTransform}
            style={interactive
              ? { cursor: isDragging && dragMode === 'move' ? 'grabbing' : 'grab' }
              : { pointerEvents: 'none' }}
            onPointerDown={interactive ? handleMovePointerDown : undefined}
          >
            {rawPaths.map((path) => (
              <polyline
                key={path.id}
                points={pathToPoints(path)}
                fill="none"
                stroke={activeStrokeColor}
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )}
      </>
    );
  };

  return (
    <div className="canvas-page">
      <h2>Canvas Preview</h2>
      <section className="canvas-toolbar">
        <label htmlFor="open-file">Open file</label>
        <input
          id="open-file"
          type="file"
          accept=".boc.json,.json,.svg,.png,.jpg,.jpeg,application/json,image/svg+xml,image/png,image/jpeg"
          onChange={(event) => {
            void handleOpenFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <input
          ref={importPlanInputRef}
          className="visually-hidden-file"
          type="file"
          accept=".boc.json,.json,application/json"
          onChange={(event) => {
            void handleLoadProject(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="toolbar-btn"
          disabled={!rawPaths}
          onClick={handleSaveProject}
        >
          Save plan
        </button>
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => importPlanInputRef.current?.click()}
        >
          Import plan
        </button>
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
        <button
          type="button"
          className={`toolbar-btn${magnifierActive ? ' active' : ''}`}
          aria-pressed={magnifierActive}
          title="Magnifier — hover the artwork to see a zoomed view"
          onClick={() => {
            setMagnifierActive((active) => !active);
            clearMagnifierPos();
          }}
        >
          🔍 Magnify
        </button>
        {rawPaths && (
          <button type="button" className="toolbar-btn" onClick={handleResetTransform}>
            Reset
          </button>
        )}
        {rawPaths && (
          <button type="button" className="toolbar-btn" onClick={handleClear}>
            Clear
          </button>
        )}
      </section>

      {previewLayers.length > 0 && (
        <section className="artwork-layer-list" aria-label="Artwork layers">
          {previewLayers.map((layer, index) => (
            <div key={layer.id} className={`artwork-layer-row${layer.id === activeLayerId ? ' active' : ''}`}>
              <button
                type="button"
                className="layer-active-btn"
                aria-pressed={layer.id === activeLayerId}
                onClick={() => handleSelectLayer(layer.id)}
              >
                <span className="layer-index">{index + 1}</span>
                <span className="layer-name">{layer.name}</span>
              </button>
              <input
                type="color"
                className="layer-color-input"
                aria-label={`Preview color for ${layer.name}`}
                title="Preview color"
                value={layerStrokeColor(layer)}
                onChange={(event) => setLayerPreviewColor(layer.id, event.target.value)}
              />
              <button
                type="button"
                className={`toolbar-btn layer-visibility-btn${layer.visible ? ' active' : ''}`}
                aria-pressed={layer.visible}
                onClick={() => toggleLayerVisibility(layer.id)}
              >
                {layer.visible ? 'Shown' : 'Hidden'}
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="canvas-message-banner" role="status" aria-live="polite">
        <p className="status-message">{message}</p>
        {error && <p className="error-message">{error}</p>}
      </div>

      <section className="raster-settings" aria-label="Raster trace settings">
        <label htmlFor="raster-mode">Raster mode</label>
        <select
          id="raster-mode"
          value={rasterMode}
          onChange={(event) => updateRasterSettings({ ...getRasterSettings(), mode: event.target.value as RasterMode })}
        >
          <option value="outline">Outline</option>
          <option value="fill">Fill lines</option>
          <option value="centerline">Centerline</option>
          <option value="dither">Dither</option>
          <option value="contour-fill">Contour fill</option>
        </select>
        <label htmlFor="raster-detail">Detail</label>
        <select
          id="raster-detail"
          value={rasterDetail}
          onChange={(event) => updateRasterSettings({ ...getRasterSettings(), detail: event.target.value as RasterDetail })}
        >
          <option value="draft">Draft 320px</option>
          <option value="normal">Normal 512px</option>
          <option value="fine">Fine 1024px</option>
          <option value="ultra">Ultra 1536px</option>
          <option value="max">Max 2048px</option>
        </select>
        <label htmlFor="raster-threshold">Threshold</label>
        <input
          id="raster-threshold"
          type="range"
          min="40"
          max="240"
          value={threshold}
          onChange={(event) => updateRasterSettings({ ...getRasterSettings(), threshold: Number(event.target.value) })}
        />
        <span>{threshold}</span>
        <label htmlFor="raster-brightness">Brightness</label>
        <input
          id="raster-brightness"
          type="range"
          min="-100"
          max="100"
          value={brightness}
          onChange={(event) => updateRasterSettings({ ...getRasterSettings(), brightness: Number(event.target.value) })}
        />
        <span>{brightness}</span>
        <label htmlFor="raster-contrast">Contrast</label>
        <input
          id="raster-contrast"
          type="range"
          min="0"
          max="250"
          value={contrast}
          onChange={(event) => updateRasterSettings({ ...getRasterSettings(), contrast: Number(event.target.value) })}
        />
        <span>{contrast}%</span>
        <label htmlFor="raster-blur">Blur</label>
        <input
          id="raster-blur"
          type="range"
          min="0"
          max="6"
          step="0.25"
          value={blurRadius}
          onChange={(event) => updateRasterSettings({ ...getRasterSettings(), blurRadius: Number(event.target.value) })}
        />
        <span>{blurRadius.toFixed(2)}</span>
        <label htmlFor="raster-smoothing">Smooth</label>
        <input
          id="raster-smoothing"
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={smoothingTolerance}
          onChange={(event) => updateRasterSettings({ ...getRasterSettings(), smoothingTolerance: Number(event.target.value) })}
        />
        <span>{smoothingTolerance.toFixed(2)}</span>
        <label className="check-row">
          <input
            type="checkbox"
            checked={adaptiveThreshold}
            onChange={(event) => updateRasterSettings({ ...getRasterSettings(), adaptiveThreshold: event.target.checked })}
          />
          Adaptive
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={invertRaster}
            onChange={(event) => updateRasterSettings({ ...getRasterSettings(), invertRaster: event.target.checked })}
          />
          Invert
        </label>
        <span className="raster-settings-hint">{RASTER_MODE_HINTS[rasterMode]}</span>
      </section>

      <section className="action-speed-settings" aria-label="Action speed settings">
        <ActionSpeedSlider
          id="travel-speed"
          label="Travel"
          valueMm={travelSpeed}
          optimalMm={defaultActionSpeeds.travelSpeed}
          units={units}
          onChange={(valueMm) => handleSpeedChange('travel', valueMm)}
        />
        <ActionSpeedSlider
          id="drawing-speed"
          label="Draw"
          valueMm={drawingSpeed}
          optimalMm={defaultActionSpeeds.drawingSpeed}
          units={units}
          onChange={(valueMm) => handleSpeedChange('drawing', valueMm)}
        />
        <ActionSpeedSlider
          id="pen-speed"
          label="Pen Z"
          valueMm={penSpeed}
          optimalMm={defaultActionSpeeds.penSpeed}
          units={units}
          onChange={(valueMm) => handleSpeedChange('pen', valueMm)}
        />

        <button type="button" className="toolbar-btn" onClick={handleResetSpeeds}>
          Reset speeds
        </button>
      </section>

      <div className="work-area-preview svg-preview" aria-label="TA4 work area preview" style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${canvas.width} ${canvas.height}`}
          role="img"
          aria-label="Imported SVG preview"
          style={{ userSelect: 'none', display: 'block', width: '100%', height: '100%', cursor: magnifierActive ? 'crosshair' : undefined }}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerLeave={clearMagnifierPos}
        >
          {renderPreviewScene('main', true)}

          {rawPaths && !isPrinting && (
            <>
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

          {/* Print progress overlay */}
          {isPrinting && jobProgress && progressStrokes.length > 0 && (() => {
            const sent = jobProgress.sent;
            let curX: number | null = null;
            let curY: number | null = null;

            const strokeEls = progressStrokes.map((stroke, i) => {
              const allPoints = [stroke.startPoint, ...stroke.drawPoints];
              const splitAt = stroke.drawPoints.findIndex(p => p.lineIdx >= sent);

              let doneStr: string | null = null;
              let pendingStr: string | null = null;

              const pts = (arr: ProgressStrokePoint[]) =>
                arr.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');

              if (splitAt === -1) {
                doneStr = pts(allPoints);
                const last = stroke.drawPoints[stroke.drawPoints.length - 1];
                if (last) { curX = last.x; curY = last.y; }
              } else if (splitAt === 0) {
                pendingStr = pts(allPoints);
              } else {
                doneStr = pts(allPoints.slice(0, splitAt + 1));
                pendingStr = pts(allPoints.slice(splitAt));
                const lastDone = stroke.drawPoints[splitAt - 1];
                if (lastDone) { curX = lastDone.x; curY = lastDone.y; }
              }

              return (
                <g key={i}>
                  {doneStr && (
                    <polyline points={doneStr} fill="none" stroke="#16a34a" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  )}
                  {pendingStr && (
                    <polyline points={pendingStr} fill="none" stroke="#9ca3af" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  )}
                </g>
              );
            });

            return (
              <g style={{ pointerEvents: 'none' }}>
                {strokeEls}
                {curX !== null && curY !== null && (
                  <circle cx={curX} cy={curY} r={1.8} fill="#2563eb" stroke="white" strokeWidth="0.5" />
                )}
              </g>
            );
          })()}
        </svg>

        {/* Magnifier: a picture-in-picture window that enlarges the area under the cursor */}
        {magnifierActive && magnifierPos && (() => {
          const aspect = canvas.height / canvas.width;
          const winW = MAGNIFIER_WINDOW_WIDTH;
          const winH = Math.round(winW * aspect);
          const regionW = canvas.width / MAGNIFIER_ZOOM;
          const regionH = canvas.height / MAGNIFIER_ZOOM;
          const vx = Math.max(0, Math.min(canvas.width - regionW, magnifierPos.x - regionW / 2));
          const vy = Math.max(0, Math.min(canvas.height - regionH, magnifierPos.y - regionH / 2));
          return (
            <div
              className="magnifier-pip"
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: winW,
                height: winH,
                border: '2px solid #2563eb',
                borderRadius: 8,
                overflow: 'hidden',
                background: '#fff',
                boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
                pointerEvents: 'none'
              }}
            >
              <svg
                viewBox={`${vx} ${vy} ${regionW} ${regionH}`}
                width="100%"
                height="100%"
                style={{ display: 'block' }}
              >
                {renderPreviewScene('magnifier', false)}
              </svg>
            </div>
          );
        })()}
      </div>

      {/* Image transform controls — shown only when an image is loaded */}
      {rawPaths && (
        <section className="image-transform-controls" aria-label="Image position and scale">
          <label htmlFor="img-offset-x">X</label>
          <input
            id="img-offset-x"
            type="number"
            step={displayLengthInput(1, units)}
            value={displayLengthInput(offsetX, units)}
            onChange={(e) => handleOffsetChange('x', toMillimeters(Number(e.target.value), units))}
          />
          <span className="unit-label">{unitLabel}</span>

          <label htmlFor="img-offset-y">Y</label>
          <input
            id="img-offset-y"
            type="number"
            step={displayLengthInput(1, units)}
            value={displayLengthInput(offsetY, units)}
            onChange={(e) => handleOffsetChange('y', toMillimeters(Number(e.target.value), units))}
          />
          <span className="unit-label">{unitLabel}</span>

          <label htmlFor="img-width">W</label>
          <input
            id="img-width"
            type="number"
            min={displayLengthInput(0.1, units)}
            step={displayLengthInput(units === 'in' ? 0.254 : 1, units)}
            value={displayLengthInput(imageWidth, units)}
            onChange={(e) => handleDimensionChange('width', toMillimeters(Number(e.target.value), units))}
          />
          <span className="unit-label">{unitLabel}</span>

          <label htmlFor="img-height">H</label>
          <input
            id="img-height"
            type="number"
            min={displayLengthInput(0.1, units)}
            step={displayLengthInput(units === 'in' ? 0.254 : 1, units)}
            value={displayLengthInput(imageHeight, units)}
            onChange={(e) => handleDimensionChange('height', toMillimeters(Number(e.target.value), units))}
          />
          <span className="unit-label">{unitLabel}</span>

          <button
            type="button"
            className={`toolbar-btn transform-btn${lockAspectRatio ? ' active' : ''}`}
            aria-pressed={lockAspectRatio}
            title="Keep width and height proportional when resizing"
            onClick={() => setLockAspectRatio(!lockAspectRatio)}
          >
            {lockAspectRatio ? 'Lock ratio' : 'Free ratio'}
          </button>

          <label htmlFor="img-scale-range">Scale</label>
          <input
            id="img-scale-range"
            type="range"
            min="5"
            max="200"
            value={Math.min(200, Math.round((imageScaleX + imageScaleY) / 2))}
            onChange={(e) => handleScaleChange(Number(e.target.value))}
          />
          <input
            id="img-scale-number"
            type="number"
            min="5"
            max="500"
            step="1"
            value={Math.round((imageScaleX + imageScaleY) / 2)}
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

          <button
            type="button"
            className={`toolbar-btn transform-btn${flipX ? ' active' : ''}`}
            aria-pressed={flipX}
            onClick={() => handleFlipChange('x')}
          >
            Flip H
          </button>
          <button
            type="button"
            className={`toolbar-btn transform-btn${flipY ? ' active' : ''}`}
            aria-pressed={flipY}
            onClick={() => handleFlipChange('y')}
          >
            Flip V
          </button>
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
      {preparedJob && preparedJob.warnings.length > 0 && (
        <ul className="warning-list">
          {preparedJob.warnings.map((warning, index) => (
            <li key={`${warning.message}-${index}`} className={warning.severity}>
              {warning.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Canvas;
