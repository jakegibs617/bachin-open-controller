import { isRecord } from '../core/typeGuards';
import { Canvas as CanvasModel, LengthUnit, Path } from '../types';

export type ArtworkKind = 'svg' | 'raster';
export type RasterMode = 'outline' | 'fill' | 'centerline' | 'dither';
export type RasterDetail = 'draft' | 'normal' | 'fine' | 'ultra' | 'max';

export interface FileLike {
  name: string;
  type: string;
}

export interface SavedArtworkMetadata {
  formatVersion: 1;
  artworkKind: ArtworkKind;
  fileName: string;
  mimeType: string;
  sourceDataUrl: string;
  rasterSettings: {
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
  actionSpeeds: {
    travelSpeed: number;
    drawingSpeed: number;
    penSpeed: number;
  };
}

export interface SavedCanvasObject {
  id: string;
  type: 'svg_path' | 'raster_image';
  source: string;
  transform: {
    x: number;
    y: number;
    scale: number;
    scaleY: number;
    rotation: number;
    flipX?: boolean;
    flipY?: boolean;
  };
  visible: boolean;
  paths: Path[];
  metadata: SavedArtworkMetadata;
}

export interface SavedProjectData {
  id: string;
  name: string;
  created: string;
  machineProfileId: string;
  units: LengthUnit;
  canvas: CanvasModel;
  objects: SavedCanvasObject[];
  savedAt: string;
}

const VALID_UNITS: ReadonlySet<string> = new Set(['mm', 'cm', 'in', 'ft']);

export function isSavedProjectData(value: unknown): value is SavedProjectData {
  if (!isRecord(value)) return false;

  const stringFields = ['id', 'name', 'created', 'machineProfileId', 'units', 'savedAt'];
  if (!stringFields.every((field) => typeof value[field] === 'string' && value[field] !== '')) {
    return false;
  }
  if (!VALID_UNITS.has(value.units as string)) return false;

  const projectCanvas = value.canvas;
  if (!isRecord(projectCanvas)) return false;
  const canvasFields = ['width', 'height', 'offsetX', 'offsetY'];
  if (!canvasFields.every((field) => typeof projectCanvas[field] === 'number')) {
    return false;
  }

  return Array.isArray(value.objects) && value.objects.length > 0;
}

export function withSavedAtNow(
  project: Omit<SavedProjectData, 'savedAt'> | SavedProjectData,
  now: Date = new Date()
): SavedProjectData {
  return {
    ...project,
    savedAt: now.toISOString()
  };
}

export function inferImageMimeType(file: FileLike): string {
  const explicitType = file.type.toLowerCase();
  if (explicitType.startsWith('image/')) return explicitType;

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

export function isPhotoshopSignature(source: ArrayBuffer | Uint8Array): boolean {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source.slice(0, 4));
  return bytes.length >= 4 && bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53;
}

export function applyArtworkTransform(
  paths: Path[],
  cx: number,
  cy: number,
  scaleX: number,
  scaleY: number,
  dx: number,
  dy: number,
  rotateDeg: number,
  flipX: boolean = false,
  flipY: boolean = false
): Path[] {
  const sx = (scaleX / 100) * (flipX ? -1 : 1);
  const sy = (scaleY / 100) * (flipY ? -1 : 1);
  const rad = (rotateDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  const xformPt = (x: number, y: number) => ({
    x: cx + dx + (x - cx) * sx * cosR - (y - cy) * sy * sinR,
    y: cy + dy + (x - cx) * sx * sinR + (y - cy) * sy * cosR
  });

  return paths.map((path) => {
    const segments = path.segments.map((seg) => ({ ...seg, ...xformPt(seg.x, seg.y) }));
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
