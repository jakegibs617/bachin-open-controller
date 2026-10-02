import {
  applyArtworkTransform,
  inferImageMimeType,
  isPhotoshopSignature,
  isSavedProjectData,
  SavedProjectData,
  transformLayersTogether,
  withSavedAtNow
} from '../src/ui/artworkPlan';
import { Path } from '../src/types';

describe('Artwork plan helpers', () => {
  const path: Path = {
    id: 'line',
    segments: [
      { x: 0, y: 0, penDown: false },
      { x: 10, y: 10, penDown: true }
    ],
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
  };

  const savedProject: SavedProjectData = {
    id: 'project-1',
    name: 'Original project name',
    created: '2026-06-01T10:00:00.000Z',
    machineProfileId: 'ta4',
    units: 'cm',
    canvas: {
      width: 190,
      height: 280,
      offsetX: 0,
      offsetY: 0
    },
    objects: [{
      id: 'artwork-1',
      type: 'svg_path',
      source: '',
      transform: {
        x: 0,
        y: 0,
        scale: 100,
        scaleY: 100,
        rotation: 0
      },
      visible: true,
      paths: [path],
      metadata: {
        formatVersion: 1,
        artworkKind: 'svg',
        fileName: 'art.svg',
        mimeType: 'image/svg+xml',
        sourceDataUrl: '',
        rasterSettings: {
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
        actionSpeeds: {
          travelSpeed: 3000,
          drawingSpeed: 2000,
          penSpeed: 1000
        }
      }
    }],
    savedAt: '2026-06-01T10:00:00.000Z'
  };

  it('recognizes saved project data by JSON contents, independent of imported filename', () => {
    expect(isSavedProjectData(savedProject)).toBe(true);
    expect(isSavedProjectData({ ...savedProject, name: 'renamed-file-is-not-used' })).toBe(true);
    expect(isSavedProjectData({ ...savedProject, savedAt: '' })).toBe(false);
  });

  it('rejects invalid units and empty artwork lists in saved project data', () => {
    expect(isSavedProjectData({ ...savedProject, units: 'inches' })).toBe(false);
    expect(isSavedProjectData({ ...savedProject, objects: [] })).toBe(false);
  });

  it('updates savedAt to the current save timestamp', () => {
    const saved = withSavedAtNow(savedProject, new Date('2026-06-10T14:15:16.000Z'));

    expect(saved.savedAt).toBe('2026-06-10T14:15:16.000Z');
    expect(saved.created).toBe(savedProject.created);
    expect(saved.name).toBe(savedProject.name);
  });

  it('infers image MIME types from extensions when the browser file type is empty', () => {
    expect(inferImageMimeType({ name: 'fathers-day-card.png', type: '' })).toBe('image/png');
    expect(inferImageMimeType({ name: 'portrait.JPEG', type: '' })).toBe('image/jpeg');
    expect(inferImageMimeType({ name: 'outline.svg', type: '' })).toBe('image/svg+xml');
    expect(inferImageMimeType({ name: 'unknown.psd', type: '' })).toBe('application/octet-stream');
  });

  it('keeps explicit browser image MIME types', () => {
    expect(inferImageMimeType({ name: 'artwork.bin', type: 'image/png' })).toBe('image/png');
  });

  it('detects Photoshop files renamed as PNGs', () => {
    expect(isPhotoshopSignature(new Uint8Array([0x38, 0x42, 0x50, 0x53, 0x00]))).toBe(true);
    expect(isPhotoshopSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it('applies independent width and height scaling before translation', () => {
    const path: Path = {
      id: 'rect-edge',
      segments: [
        { x: 0, y: 0, penDown: false },
        { x: 10, y: 20, penDown: true }
      ],
      bounds: { minX: 0, maxX: 10, minY: 0, maxY: 20 }
    };

    const [result] = applyArtworkTransform([path], 5, 10, 200, 50, 3, -4, 0);

    expect(result.segments).toEqual([
      { x: -2, y: 1, penDown: false },
      { x: 18, y: 11, penDown: true }
    ]);
    expect(result.bounds).toEqual({ minX: -2, maxX: 18, minY: 1, maxY: 11 });
  });

  it('rotates transformed artwork around its raw center', () => {
    const path: Path = {
      id: 'vertical',
      segments: [
        { x: 5, y: 0, penDown: false },
        { x: 5, y: 20, penDown: true }
      ],
      bounds: { minX: 5, maxX: 5, minY: 0, maxY: 20 }
    };

    const [result] = applyArtworkTransform([path], 5, 10, 100, 100, 0, 0, 90);

    expect(result.segments[0].x).toBeCloseTo(15);
    expect(result.segments[0].y).toBeCloseTo(10);
    expect(result.segments[1].x).toBeCloseTo(-5);
    expect(result.segments[1].y).toBeCloseTo(10);
  });

  it('flips artwork horizontally around its raw center', () => {
    const path: Path = {
      id: 'horizontal',
      segments: [
        { x: 0, y: 10, penDown: false },
        { x: 10, y: 10, penDown: true }
      ],
      bounds: { minX: 0, maxX: 10, minY: 10, maxY: 10 }
    };

    const [result] = applyArtworkTransform([path], 5, 10, 100, 100, 0, 0, 0, true, false);

    expect(result.segments).toEqual([
      { x: 10, y: 10, penDown: false },
      { x: 0, y: 10, penDown: true }
    ]);
    expect(result.bounds).toEqual({ minX: 0, maxX: 10, minY: 10, maxY: 10 });
  });

  it('flips artwork vertically around its raw center', () => {
    const path: Path = {
      id: 'vertical',
      segments: [
        { x: 5, y: 0, penDown: false },
        { x: 5, y: 20, penDown: true }
      ],
      bounds: { minX: 5, maxX: 5, minY: 0, maxY: 20 }
    };

    const [result] = applyArtworkTransform([path], 5, 10, 100, 100, 0, 0, 0, false, true);

    expect(result.segments).toEqual([
      { x: 5, y: 20, penDown: false },
      { x: 5, y: 0, penDown: true }
    ]);
    expect(result.bounds).toEqual({ minX: 5, maxX: 5, minY: 0, maxY: 20 });
  });
});

describe('Linked layers', () => {
  const square = (min: number, max: number): Path => ({
    id: `square-${min}-${max}`,
    segments: [
      { x: min, y: min, penDown: false },
      { x: max, y: min, penDown: true },
      { x: max, y: max, penDown: true },
      { x: min, y: max, penDown: true },
      { x: min, y: min, penDown: true }
    ],
    bounds: { minX: min, maxX: max, minY: min, maxY: max }
  });
  const identity = { x: 0, y: 0, scale: 100, scaleY: 100, rotation: 0, flipX: false, flipY: false };

  it('scales every layer around the shared group center so they stay in register', () => {
    // Pen layers from one image: a 100 mm frame and a smaller mark in its corner.
    const frame = { rawPaths: [square(0, 100)], transform: identity };
    const mark = { rawPaths: [square(60, 100)], transform: identity };

    const [frameT, markT] = transformLayersTogether([frame, mark], { factor: 0.5 });

    // Worked by hand: group center is (50, 50); halving maps 0..100 to 25..75.
    expect(frameT).toEqual({ ...identity, x: 0, y: 0, scale: 50, scaleY: 50 });
    expect(markT).toEqual({ ...identity, x: -15, y: -15, scale: 50, scaleY: 50 });
  });

  it('can scale the group around a chosen anchor point', () => {
    const frame = { rawPaths: [square(0, 100)], transform: identity };
    const mark = { rawPaths: [square(60, 100)], transform: identity };

    const [frameT, markT] = transformLayersTogether([frame, mark], { factor: 0.5, anchor: { x: 100, y: 100 } });

    // Worked by hand: halving toward (100, 100) maps the frame to 50..100 (center 75)
    // and the mark to 80..100 (center 90).
    expect(frameT).toEqual({ ...identity, x: 25, y: 25, scale: 50, scaleY: 50 });
    expect(markT).toEqual({ ...identity, x: 10, y: 10, scale: 50, scaleY: 50 });
  });

  it('moves every layer by the same amount', () => {
    const frame = { rawPaths: [square(0, 100)], transform: { ...identity, x: 2, y: 3 } };
    const mark = { rawPaths: [square(60, 100)], transform: { ...identity, x: -4, y: 1 } };

    const [frameT, markT] = transformLayersTogether([frame, mark], { dx: 10, dy: -5 });

    expect(frameT).toEqual({ ...identity, x: 12, y: -2 });
    expect(markT).toEqual({ ...identity, x: 6, y: -4 });
  });
});
