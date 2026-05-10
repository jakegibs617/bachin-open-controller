/**
 * SVG Importer
 * Phase 2: Loads and parses SVG files into normalized paths
 *
 * Features:
 * - SVG path parsing (M, L, Q, C, Z commands)
 * - ViewBox scaling and unit conversion
 * - Path extraction and normalization
 * - Unsupported element warnings
 *
 * TODO (Phase 2):
 * - Implement SVGParser class
 * - Implement path command parsing (M, L, H, V, C, S, Q, T, A, Z)
 * - Add unit conversion (px, mm, cm, etc.)
 * - Create test coverage with sample SVG files
 */

import { Path, PathSegment, BoundingBox, LengthUnit } from '../../types';
import { toMillimeters } from '../../core/units';
import { computePathBounds, sampleBezierCurve, sampleQuadraticCurve } from '../../core/geometry';
import { parse as parseSvg, SvgNode } from 'svg-parser';

export class SVGParser {
  /**
   * Phase 2: Parses SVG files and extracts paths
   */

  private svgContent: string = '';
  private viewBox: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 100, height: 100 };

  async parseFile(filePath: string): Promise<Path[]> {
    /**
     * Phase 2: Load SVG file and extract paths
     * 1. Read file from disk
     * 2. Parse XML
     * 3. Extract all <path> elements
     * 4. Convert path data to coordinates
     * 5. Return normalized paths
     */
    const fsPromisesModule = 'fs/promises';
    const { readFile } = await import(fsPromisesModule);
    return this.parse(await readFile(filePath, 'utf8'));
  }

  parse(svgContent: string): Path[] {
    /**
     * Phase 2: Parse SVG string content
     */
    this.svgContent = svgContent;
    return this.extractPaths();
  }

  private extractPaths(): Path[] {
    /**
     * Phase 2: Find all <path> elements and parse their d attributes
     */
    const tree = parseSvg(this.svgContent);
    const svg = findFirstElement(tree, 'svg');
    const viewBox = svg?.properties?.viewBox;
    if (typeof viewBox === 'string') {
      this.parseViewBox(viewBox);
    }

    const pathNodes = findElements(tree, 'path');
    return pathNodes.flatMap((node, index) => {
      const pathD = node.properties?.d;
      if (typeof pathD !== 'string' || pathD.trim() === '') {
        return [];
      }

      const subpaths = splitSubpaths(this.parsePathData(pathD));
      return subpaths.map((segments, subpathIndex) => ({
        id: `svg-path-${index + 1}${subpaths.length > 1 ? `-${subpathIndex + 1}` : ''}`,
        segments,
        bounds: computePathBounds(segments).toInterface()
      }));
    });
  }

  private parsePathData(pathD: string): PathSegment[] {
    /**
     * Phase 2: Parse SVG path data string into coordinates
     * Supported commands: M, L, H, V, C, S, Q, T, A, Z
     * Handles relative (lowercase) and absolute (uppercase) variants
     */
    const tokens = tokenizePathData(pathD);
    const segments: PathSegment[] = [];
    let index = 0;
    let command = '';
    let current = { x: 0, y: 0 };
    let subpathStart = { x: 0, y: 0 };

    const hasNumber = () => index < tokens.length && !isPathCommand(tokens[index]);
    const readNumber = () => {
      if (!hasNumber()) {
        throw new Error(`Expected number in SVG path near token ${index}`);
      }
      return Number(tokens[index++]);
    };
    const point = (relative: boolean): PathSegment => {
      const x = readNumber();
      const y = readNumber();
      return {
        x: relative ? current.x + x : x,
        y: relative ? current.y + y : y,
        penDown: true
      };
    };

    while (index < tokens.length) {
      if (isPathCommand(tokens[index])) {
        command = tokens[index++];
      }
      if (!command) {
        throw new Error('SVG path data must start with a command');
      }

      const relative = command === command.toLowerCase();
      switch (command.toUpperCase()) {
        case 'M': {
          const move = point(relative);
          move.penDown = false;
          current = { x: move.x, y: move.y };
          subpathStart = { ...current };
          segments.push(move);

          while (hasNumber()) {
            const line = point(relative);
            current = { x: line.x, y: line.y };
            segments.push(line);
          }
          break;
        }
        case 'L':
          while (hasNumber()) {
            const line = point(relative);
            current = { x: line.x, y: line.y };
            segments.push(line);
          }
          break;
        case 'H':
          while (hasNumber()) {
            const x = readNumber();
            current = { x: relative ? current.x + x : x, y: current.y };
            segments.push({ ...current, penDown: true });
          }
          break;
        case 'V':
          while (hasNumber()) {
            const y = readNumber();
            current = { x: current.x, y: relative ? current.y + y : y };
            segments.push({ ...current, penDown: true });
          }
          break;
        case 'C':
          while (hasNumber()) {
            const p1 = point(relative);
            const p2 = point(relative);
            const end = point(relative);
            const sampled = sampleBezierCurve(current, p1, p2, end, 0.1).slice(1);
            segments.push(...sampled.map((sample) => ({ ...sample, penDown: true })));
            current = { x: end.x, y: end.y };
          }
          break;
        case 'Q':
          while (hasNumber()) {
            const p1 = point(relative);
            const end = point(relative);
            const sampled = sampleQuadraticCurve(current, p1, end, 0.1).slice(1);
            segments.push(...sampled.map((sample) => ({ ...sample, penDown: true })));
            current = { x: end.x, y: end.y };
          }
          break;
        case 'Z':
          segments.push({ ...subpathStart, penDown: true });
          current = { ...subpathStart };
          command = '';
          break;
        default:
          throw new Error(`Unsupported SVG path command: ${command}`);
      }
    }

    return segments;
  }

  private parseViewBox(viewBoxAttr: string): void {
    /**
     * Phase 2: Parse viewBox="x y width height"
     */
    const values = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid SVG viewBox: ${viewBoxAttr}`);
    }

    this.viewBox = {
      x: values[0],
      y: values[1],
      width: values[2],
      height: values[3]
    };
  }
}

function findElements(node: SvgNode, tagName: string): SvgNode[] {
  const current = node.type === 'element' && node.tagName === tagName ? [node] : [];
  const children = node.children ?? [];
  return current.concat(children.flatMap((child) => findElements(child, tagName)));
}

function findFirstElement(node: SvgNode, tagName: string): SvgNode | undefined {
  if (node.type === 'element' && node.tagName === tagName) {
    return node;
  }

  for (const child of node.children ?? []) {
    const found = findFirstElement(child, tagName);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function tokenizePathData(pathD: string): string[] {
  return pathD.match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
}

function isPathCommand(token: string): boolean {
  return /^[A-Za-z]$/.test(token);
}

function splitSubpaths(segments: PathSegment[]): PathSegment[][] {
  const subpaths: PathSegment[][] = [];
  let current: PathSegment[] = [];

  for (const segment of segments) {
    if (segment.penDown === false && current.length > 0) {
      subpaths.push(current);
      current = [];
    }
    current.push(segment);
  }

  if (current.length > 0) {
    subpaths.push(current);
  }

  return subpaths;
}

export function convertSVGToMM(pixels: number, dpi: number = 96): number {
  /**
   * Phase 2: Convert pixel coordinates to millimeters
   * Default DPI: 96 (screen DPI)
   * 1 inch = 25.4 mm
   */
  return (pixels / dpi) * 25.4;
}

export function convertSVGLengthToMM(value: number, unit: LengthUnit | 'px' = 'px', dpi: number = 96): number {
  if (unit === 'px') {
    return convertSVGToMM(value, dpi);
  }

  return toMillimeters(value, unit);
}

export function normalizePathToMachineCoordinates(
  segments: PathSegment[],
  svgBounds: BoundingBox,
  canvasWidth: number,
  canvasHeight: number
): PathSegment[] {
  /**
   * Phase 2: Scale and translate SVG paths to fit canvas
   */
  const width = svgBounds.maxX - svgBounds.minX;
  const height = svgBounds.maxY - svgBounds.minY;
  if (width <= 0 || height <= 0) {
    throw new Error('Cannot normalize an empty SVG bounds box');
  }

  const scale = Math.min(canvasWidth / width, canvasHeight / height);
  const offsetX = (canvasWidth - width * scale) / 2;
  const offsetY = (canvasHeight - height * scale) / 2;

  return segments.map((segment) => ({
    x: (segment.x - svgBounds.minX) * scale + offsetX,
    y: (segment.y - svgBounds.minY) * scale + offsetY,
    penDown: segment.penDown
  }));
}
