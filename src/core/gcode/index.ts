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

import { Path, MachineProfile, Canvas, JobWarning } from '../../types';
export { validateGCodeJob, validateGCodeLine } from './validation';

function formatCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export interface GCodeSpeedOptions {
  travelSpeed?: number;
  drawingSpeed?: number;
  penSpeed?: number;
}

function resolveSpeed(value: number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  return fallback;
}

function feedFromCommand(command: string): number | null {
  const match = command.match(/\bF(-?\d+(?:\.\d+)?)\b/i);
  if (!match) {
    return null;
  }

  const feed = Number(match[1]);
  return Number.isFinite(feed) && feed > 0 ? feed : null;
}

function commandWithFeed(command: string, feed: number | undefined): string {
  if (!feed || !Number.isFinite(feed) || feed <= 0) {
    return command;
  }

  const formattedFeed = formatCoordinate(feed);
  if (/\bF-?\d+(?:\.\d+)?\b/i.test(command)) {
    return command.replace(/\bF-?\d+(?:\.\d+)?\b/gi, `F${formattedFeed}`);
  }

  return `${command} F${formattedFeed}`;
}

export class GCodeGenerator {
  /**
   * Phase 3: Generates G-code from paths and machine profile
   */

  private profile: MachineProfile;
  private canvas: Canvas;
  private speeds: Required<GCodeSpeedOptions>;
  private warnings: JobWarning[] = [];

  constructor(profile: MachineProfile, canvas: Canvas, speedOptions: GCodeSpeedOptions = {}) {
    this.profile = profile;
    this.canvas = canvas;
    this.speeds = {
      travelSpeed: resolveSpeed(speedOptions.travelSpeed, profile.travelSpeed),
      drawingSpeed: resolveSpeed(speedOptions.drawingSpeed, profile.drawingSpeed),
      penSpeed: resolveSpeed(
        speedOptions.penSpeed,
        feedFromCommand(profile.penDownCommand) ?? feedFromCommand(profile.penUpCommand) ?? profile.drawingSpeed
      )
    };
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

    const gcode: string[] = [];
    let currentRun: typeof drawableSegments = [];

    const flushRun = () => {
      if (currentRun.length === 0) {
        return;
      }

      const [start, ...rest] = currentRun;
      const machineStart = this.toMachinePoint(start.x, start.y);
      gcode.push(
        this.penUpCommand(),
        `G0 X${formatCoordinate(machineStart.x)} Y${formatCoordinate(machineStart.y)} F${formatCoordinate(this.speeds.travelSpeed)}`,
        this.penDownCommand()
      );

      for (const segment of rest) {
        const machinePoint = this.toMachinePoint(segment.x, segment.y);
        gcode.push(`G1 X${formatCoordinate(machinePoint.x)} Y${formatCoordinate(machinePoint.y)} F${formatCoordinate(this.speeds.drawingSpeed)}`);
      }

      gcode.push(this.penUpCommand());
      currentRun = [];
    };

    for (const segment of drawableSegments) {
      if (segment.penDown === false && currentRun.length > 0) {
        flushRun();
      }
      currentRun.push(segment);
    }
    flushRun();

    return gcode;
  }

  private toMachinePoint(x: number, y: number): { x: number; y: number } {
    if (this.profile.origin === 'top-left') {
      return {
        x: x + this.canvas.offsetX,
        y: -(y + this.canvas.offsetY)
      };
    }

    return {
      x: x + this.canvas.offsetX,
      y: y + this.canvas.offsetY
    };
  }

  private penUpCommand(): string {
    return commandWithFeed(this.profile.penUpCommand, this.speeds.penSpeed);
  }

  private penDownCommand(): string {
    return commandWithFeed(this.profile.penDownCommand, this.speeds.penSpeed);
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

      this.collectCoordinateWarning(validateCoordinates(path.bounds.minX, 0, this.canvas.width, `Path ${path.id} canvas min X`));
      this.collectCoordinateWarning(validateCoordinates(path.bounds.minY, 0, this.canvas.height, `Path ${path.id} canvas min Y`));
      this.collectCoordinateWarning(validateCoordinates(path.bounds.maxX, 0, this.canvas.width, `Path ${path.id} canvas X`));
      this.collectCoordinateWarning(validateCoordinates(path.bounds.maxY, 0, this.canvas.height, `Path ${path.id} canvas Y`));
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
