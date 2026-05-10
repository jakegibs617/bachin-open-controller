/**
 * G-code Generator
 * Phase 3: Converts paths to safe, machine-specific G-code
 *
 * Features:
 * - Pen plotter G-code generation
 * - Safety validation (bounds, coordinates)
 * - Profile-specific command injection
 * - Warning generation
 *
 * TODO (Phase 3):
 * - Implement GCodeGenerator class
 * - Implement safety validation
 * - Create snapshot tests for generated G-code
 * - Test with real TA4 profile
 */

import { Path, PathSegment, MachineProfile, Canvas, JobWarning } from '../../types';

function formatCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export class GCodeGenerator {
  /**
   * Phase 3: Generates G-code from paths and machine profile
   */

  private profile: MachineProfile;
  private canvas: Canvas;
  private warnings: JobWarning[] = [];

  constructor(profile: MachineProfile, canvas: Canvas) {
    this.profile = profile;
    this.canvas = canvas;
  }

  generate(paths: Path[]): { gcode: string[]; warnings: JobWarning[] } {
    /**
     * Phase 3: Main generation pipeline
     * 1. Validate bounds
     * 2. Emit startup sequence
     * 3. For each path:
     *    - Lift pen
     *    - Rapid move to start
     *    - Lower pen
     *    - Draw path
     *    - Lift pen
     * 4. Emit shutdown sequence
     * 5. Return warnings
     */

    this.warnings = [];
    const gcode: string[] = [];

    // Phase 3: Validate bounds
    this.validateBounds(paths);

    // Phase 3: Startup
    gcode.push(...this.profile.safeStartupSequence);

    // Phase 3: Draw each path
    for (const path of paths) {
      gcode.push(...this.emitPathGCode(path));
    }

    // Phase 3: Shutdown
    gcode.push(...this.profile.safeShutdownSequence);

    return { gcode, warnings: this.warnings };
  }

  private emitPathGCode(path: Path): string[] {
    const drawableSegments = path.segments.filter((segment) => Number.isFinite(segment.x) && Number.isFinite(segment.y));

    if (drawableSegments.length === 0) {
      this.addWarning('warn', `Path ${path.id} has no drawable segments`);
      return [];
    }

    const [start, ...rest] = drawableSegments;
    const gcode: string[] = [
      this.profile.penUpCommand,
      `G0 X${formatCoordinate(start.x)} Y${formatCoordinate(start.y)} F${formatCoordinate(this.profile.travelSpeed)}`,
      this.profile.penDownCommand
    ];

    for (const segment of rest) {
      gcode.push(`G1 X${formatCoordinate(segment.x)} Y${formatCoordinate(segment.y)} F${formatCoordinate(this.profile.drawingSpeed)}`);
    }

    gcode.push(this.profile.penUpCommand);
    return gcode;
  }

  private validateBounds(paths: Path[]): void {
    if (paths.length === 0) {
      this.addWarning('warn', 'No paths to generate');
      return;
    }

    for (const path of paths) {
      if (path.segments.length === 0) {
        this.addWarning('warn', `Path ${path.id} has no segments`);
        continue;
      }

      for (const segment of path.segments) {
        this.collectCoordinateWarning(validateCoordinates(segment.x, 0, this.profile.workArea.x, `Path ${path.id} X`));
        this.collectCoordinateWarning(validateCoordinates(segment.y, 0, this.profile.workArea.y, `Path ${path.id} Y`));
      }

      const widthWarning = validateCoordinates(path.bounds.maxX, 0, this.canvas.width, `Path ${path.id} canvas X`);
      const heightWarning = validateCoordinates(path.bounds.maxY, 0, this.canvas.height, `Path ${path.id} canvas Y`);
      this.collectCoordinateWarning(widthWarning);
      this.collectCoordinateWarning(heightWarning);
    }
  }

  addWarning(severity: 'info' | 'warn' | 'error', message: string): void {
    this.warnings.push({ severity, message });
  }

  private collectCoordinateWarning(warning: JobWarning | null): void {
    if (warning) {
      this.warnings.push(warning);
    }
  }
}

export function validateCoordinates(value: number, min: number, max: number, label: string): JobWarning | null {
  /**
   * Phase 3: Check if a coordinate is valid
   */
  if (value < min || value > max) {
    return {
      severity: 'warn',
      message: `${label} ${value} exceeds bounds [${min}, ${max}]`
    };
  }
  return null;
}

export function validateProfile(profile: MachineProfile): JobWarning[] {
  /**
   * Phase 3: Validate machine profile has required fields
   */
  const warnings: JobWarning[] = [];

  if (!profile.penUpCommand || profile.penUpCommand === '') {
    warnings.push({ severity: 'error', message: 'Machine profile missing penUpCommand' });
  }
  if (!profile.penDownCommand || profile.penDownCommand === '') {
    warnings.push({ severity: 'error', message: 'Machine profile missing penDownCommand' });
  }

  return warnings;
}
