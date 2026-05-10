/**
 * Shared TypeScript types and interfaces for Bachin Open Controller
 */

export interface WorkArea {
  x: number;
  y: number;
  z?: number;
}

export interface StepsPerMm {
  x: number;
  y: number;
  z?: number;
}

export type LengthUnit = 'mm' | 'cm' | 'in' | 'ft';

export interface MachineProfile {
  id: string;
  name: string;
  machineKind: 'pen_plotter' | 'laser_engraver' | 'writing_machine';
  workArea: WorkArea;
  origin: 'top-left' | 'lower-left' | 'current-position';
  baudRate: number;
  travelSpeed: number;
  drawingSpeed: number;
  stepsPerMm: StepsPerMm;
  penUpCommand: string;          // Phase 0: TO BE CONFIRMED
  penDownCommand: string;         // Phase 0: TO BE CONFIRMED
  penUpValue?: number;
  penDownValue?: number;
  laserOnCommand?: string;
  laserOffCommand?: string;
  maxLaserPower?: number;
  safeStartupSequence: string[];
  safeShutdownSequence: string[];
}

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface PathSegment {
  x: number;
  y: number;
  penDown?: boolean;
}

export interface Path {
  id: string;
  segments: PathSegment[];
  bounds: BoundingBox;
}

export interface CanvasObject {
  id: string;
  type: 'svg_path' | 'text' | 'qr_code';
  source: string;
  transform: Transform;
  visible: boolean;
  paths?: Path[];
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface Canvas {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export interface Project {
  id: string;
  name: string;
  created: string;
  machineProfileId: string;
  units: LengthUnit;
  canvas: Canvas;
  objects: CanvasObject[];
  savedAt: string;
}

export interface Job {
  id: string;
  projectId: string;
  generatedAt: string;
  machineProfile: MachineProfile;
  bounds: BoundingBox;
  gcode: string[];
  warnings: JobWarning[];
  status: 'ready' | 'streaming' | 'paused' | 'completed' | 'error' | 'cancelled';
  streamingProgress?: JobProgress;
}

export interface JobWarning {
  severity: 'info' | 'warn' | 'error';
  message: string;
}

export interface JobProgress {
  linesSent: number;
  totalLines: number;
  estimatedTimeS: number;
  currentProgress: number;
}

export interface GRBLStatus {
  state: 'idle' | 'run' | 'hold' | 'jog' | 'alarm' | 'door' | 'check' | 'home' | 'sleep';
  position: Point;
  feedRate: number;
  spindleSpeed: number;
}

export interface GRBLResponse {
  type: 'ok' | 'error' | 'alarm' | 'status';
  message: string;
  status?: GRBLStatus;
  errorCode?: number;
}
