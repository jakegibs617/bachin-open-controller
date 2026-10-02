/**
 * Speed Test G-code Generator
 *
 * Draws one golden ("Fibonacci") spiral per requested feedrate so the operator
 * can compare line quality and cornering at different drawing speeds on a single
 * sheet. Every spiral is confined to a square cell smaller than a 2 inch
 * boundary, and the whole tiled row is validated against the machine work area.
 *
 * The spiral is an ideal speed probe: radius and curvature increase smoothly, so
 * a single shape exercises both long fast arcs and tight inner corners where a
 * too-high feedrate first shows skipping or rounding.
 */

import { MachineProfile } from '../../types';

export const TWO_INCH_MM = 50.8;

/** GRBL min practical feed and the profile max rate are the hard speed bounds. */
export const MIN_TEST_SPEED = 100;

export const DEFAULT_SPEED_TEST_BOUNDARY_MM = 1.8 * 25.4; // 45.72 mm, safely under 2 in
export const DEFAULT_SPEED_TEST_TURNS = 3.5;
export const DEFAULT_POINTS_PER_TURN = 64;
const MAX_SPEED_COUNT = 8;
const ORIGIN_MARGIN_MM = 5;

const PHI = (1 + Math.sqrt(5)) / 2;
// Growth of the golden spiral radius per radian: r multiplies by PHI every
// quarter turn, i.e. b = PHI^(2/pi).
const GROWTH_PER_RADIAN = Math.pow(PHI, 2 / Math.PI);

export interface SpeedTestOptions {
  /** Feedrates (mm/min) to draw, one spiral each, left to right. */
  speeds: number[];
  /** Square cell size per spiral in mm. Must be > 0 and < 2 in (50.8 mm). */
  boundaryMm?: number;
  /** Number of full revolutions in each spiral. */
  turns?: number;
  /** Segment resolution; higher means smoother arcs (and more lines). */
  pointsPerTurn?: number;
}

export interface SpeedTestPlan {
  gcode: string[];
  /** The clamped speeds actually drawn, in draw order. */
  speeds: number[];
  /** Resolved per-spiral cell size in mm. */
  boundaryMm: number;
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function clampSpeed(value: number, maxSpeed: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Speed test feedrate must be a finite number');
  }
  return Math.max(MIN_TEST_SPEED, Math.min(maxSpeed, Math.round(value)));
}

/**
 * Build the spiral points in a local, Y-down canvas centred on (cx, cy),
 * starting at the innermost point and winding outward. The outermost radius is
 * exactly `maxRadius` so the drawn shape fits the requested boundary.
 */
function spiralPoints(
  cx: number,
  cy: number,
  maxRadius: number,
  turns: number,
  pointsPerTurn: number
): Array<{ x: number; y: number }> {
  const totalPoints = Math.max(2, Math.round(turns * pointsPerTurn));
  const thetaEnd = turns * 2 * Math.PI;
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= totalPoints; i++) {
    const theta = (i / totalPoints) * thetaEnd;
    // Normalised so the radius reaches exactly maxRadius at theta = thetaEnd.
    const radius = maxRadius * Math.pow(GROWTH_PER_RADIAN, theta - thetaEnd);
    points.push({
      x: cx + radius * Math.cos(theta),
      y: cy + radius * Math.sin(theta)
    });
  }

  return points;
}

export function generateSpeedTestGCode(options: SpeedTestOptions, profile: MachineProfile): SpeedTestPlan {
  const maxSpeed = Number.isFinite(profile.travelSpeed) && profile.travelSpeed > 0 ? profile.travelSpeed : 6000;

  if (!Array.isArray(options.speeds) || options.speeds.length === 0) {
    throw new Error('Provide at least one feedrate to test');
  }
  if (options.speeds.length > MAX_SPEED_COUNT) {
    throw new Error(`Speed test supports at most ${MAX_SPEED_COUNT} speeds per run`);
  }

  const speeds = options.speeds.map((speed) => clampSpeed(speed, maxSpeed));

  const boundaryMm = options.boundaryMm ?? DEFAULT_SPEED_TEST_BOUNDARY_MM;
  if (!Number.isFinite(boundaryMm) || boundaryMm <= 0) {
    throw new Error('Speed test boundary must be a positive number of millimeters');
  }
  if (boundaryMm >= TWO_INCH_MM) {
    throw new Error(`Speed test boundary must stay under 2 in (${TWO_INCH_MM} mm)`);
  }

  const turns = options.turns ?? DEFAULT_SPEED_TEST_TURNS;
  if (!Number.isFinite(turns) || turns <= 0) {
    throw new Error('Speed test turns must be a positive number');
  }
  const pointsPerTurn = options.pointsPerTurn ?? DEFAULT_POINTS_PER_TURN;

  // Leave a small margin inside each cell so the drawn diameter stays strictly
  // below the boundary.
  const margin = Math.max(0.5, boundaryMm * 0.04);
  const maxRadius = boundaryMm / 2 - margin;
  const cellPitch = boundaryMm + Math.max(8, boundaryMm * 0.2);

  // All spirals share a Y-down row near the origin.
  const cy = ORIGIN_MARGIN_MM + boundaryMm / 2;
  const lastCx = ORIGIN_MARGIN_MM + boundaryMm / 2 + (speeds.length - 1) * cellPitch;
  const maxX = lastCx + maxRadius;
  const maxYDown = cy + maxRadius;

  if (maxX > profile.workArea.x) {
    throw new Error(
      `Speed test row (${maxX.toFixed(1)} mm wide) exceeds work area X of ${profile.workArea.x} mm. ` +
        'Reduce the boundary or number of speeds.'
    );
  }
  if (maxYDown > profile.workArea.y) {
    throw new Error(
      `Speed test (${maxYDown.toFixed(1)} mm tall) exceeds work area Y of ${profile.workArea.y} mm. ` +
        'Reduce the boundary.'
    );
  }

  const gcode: string[] = [...profile.safeStartupSequence];

  speeds.forEach((speed, index) => {
    const cx = ORIGIN_MARGIN_MM + boundaryMm / 2 + index * cellPitch;
    const points = spiralPoints(cx, cy, maxRadius, turns, pointsPerTurn);
    const [start, ...rest] = points;

    gcode.push(
      profile.penUpCommand,
      // Machine Y runs negative (downward) from a top-left origin.
      `G0 X${formatCoordinate(start.x)} Y${formatCoordinate(-start.y)} F${formatCoordinate(maxSpeed)}`,
      profile.penDownCommand
    );

    for (const point of rest) {
      gcode.push(`G1 X${formatCoordinate(point.x)} Y${formatCoordinate(-point.y)} F${formatCoordinate(speed)}`);
    }

    gcode.push(profile.penUpCommand);
  });

  gcode.push(...profile.safeShutdownSequence);

  return { gcode, speeds, boundaryMm };
}
