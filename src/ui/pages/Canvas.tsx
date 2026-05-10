/**
 * Canvas Page
 * Phase 4: SVG preview and canvas editor
 *
 * Features:
 * - Display imported SVG paths
 * - Show work area bounds
 * - Zoom/pan controls (Konva)
 * - Object transform UI (drag, scale, rotate)
 *
 * TODO (Phase 4):
 * - Implement Konva canvas
 * - Add zoom/pan
 * - Add object selection and transform
 * - Connect to project state
 */

import React from 'react';
import { Canvas as CanvasModel, LengthUnit, MachineProfile, Path } from '../../types';
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
const RASTER_TRACE_SIZES = {
  draft: 160,
  normal: 260,
  fine: 380
};

type RasterMode = 'outline' | 'fill';
type RasterDetail = keyof typeof RASTER_TRACE_SIZES;

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

export const Canvas: React.FC<CanvasProps> = ({ units, preparedJob, onPreparedJobChange }) => {
  const [message, setMessage] = React.useState('Import an SVG path file to prepare a TA4 plotting job.');
  const [error, setError] = React.useState<string | null>(null);
  const [rasterMode, setRasterMode] = React.useState<RasterMode>('outline');
  const [rasterDetail, setRasterDetail] = React.useState<RasterDetail>('normal');
  const [threshold, setThreshold] = React.useState(170);
  const [invertRaster, setInvertRaster] = React.useState(false);

  const importSvg = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setError(null);
    try {
      const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
      const paths = isSvg ? await prepareSvgPaths(file) : await prepareRasterPaths(file);
      if (paths.length === 0) {
        throw new Error('No drawable paths were found.');
      }

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
      onPreparedJobChange(null);
      setError(caught instanceof Error ? caught.message : String(caught));
      setMessage('SVG import failed.');
    }
  };

  const prepareSvgPaths = async (file: File): Promise<Path[]> => {
    const svgContent = await file.text();
    const parser = new SVGParser();
    const rawPaths = parser.parse(svgContent);
    return normalizePaths(rawPaths);
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
      yStep: rasterDetail === 'fine' ? 1 : 2,
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
        {preparedJob && (
          <button type="button" onClick={() => onPreparedJobChange(null)}>
            Clear
          </button>
        )}
      </section>
      <section className="raster-settings" aria-label="Raster trace settings">
        <label htmlFor="raster-mode">Raster mode</label>
        <select id="raster-mode" value={rasterMode} onChange={(event) => setRasterMode(event.target.value as RasterMode)}>
          <option value="outline">Outline</option>
          <option value="fill">Fill lines</option>
        </select>
        <label htmlFor="raster-detail">Detail</label>
        <select id="raster-detail" value={rasterDetail} onChange={(event) => setRasterDetail(event.target.value as RasterDetail)}>
          <option value="draft">Draft</option>
          <option value="normal">Normal</option>
          <option value="fine">Fine</option>
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
        <svg viewBox={`0 0 ${canvas.width} ${canvas.height}`} role="img" aria-label="Imported SVG preview">
          <rect x="0" y="0" width={canvas.width} height={canvas.height} />
          {preparedJob?.paths.map((path) => (
            <polyline key={path.id} points={pathToPoints(path)} />
          ))}
        </svg>
      </div>
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
