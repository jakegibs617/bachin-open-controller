import {
  applyArtworkTransform,
  inferImageMimeType,
  isPhotoshopSignature
} from '../src/ui/artworkPlan';
import { Path } from '../src/types';

describe('Artwork plan helpers', () => {
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
