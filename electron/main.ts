/**
 * Electron Main Process
 * Phase 4: Backend for serial I/O, file operations, and job streaming
 *
 * IPC Handlers:
 * - serial:connect, serial:disconnect, serial:sendJob, serial:pause, serial:resume, serial:cancel
 * - project:open, project:save
 * - machine:listProfiles, machine:getProfile
 *
 * TODO (Phase 4):
 * - Set up Electron window creation
 * - Implement IPC handlers
 * - Create serial I/O event handling
 * - Add file I/O for projects and profiles
 * - Error logging and recovery
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GRBLController, listSerialPorts } from '../src/core/serial-grbl';
import ta4Profile from '../profiles/ta4.json';
import { MachineProfile, Project } from '../src/types';

let mainWindow: BrowserWindow;
let grblController: GRBLController | undefined;
const machineProfile = ta4Profile as MachineProfile;
const holdCurrentCommand = '$1=255';
const idleReleaseCommand = '$1=250';

type IpcResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

interface SavedProject extends Project {
  filePath?: string;
}

async function runSerialAction<T>(action: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    const data = await action();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function requireController(): GRBLController {
  if (!grblController || !grblController.isPortConnected()) {
    throw new Error('GRBL serial port is not connected');
  }

  return grblController;
}

function generatePerimeterGCode(width: number, height: number, profile: MachineProfile): string[] {
  const w = width.toFixed(3);
  const downY = (-height).toFixed(3);
  const f = profile.drawingSpeed;
  return [
    ...profile.safeStartupSequence,
    profile.penUpCommand,
    'G0 X0 Y0',
    profile.penDownCommand,
    `G1 X${w} Y0 F${f}`,
    `G1 X${w} Y${downY} F${f}`,
    `G1 X0 Y${downY} F${f}`,
    `G1 X0 Y0 F${f}`,
    profile.penUpCommand,
    `G1 X0 Y0 F${f}`,
    ...profile.safeShutdownSequence,
  ];
}

function resolvePerimeterDimension(value: number | undefined, fallback: number, max: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (resolved <= 0 || resolved > max) {
    throw new Error(`${label} must be greater than 0 and no more than ${max} mm`);
  }
  return resolved;
}

function resolveJogDistance(value: number | undefined, maxAbs: number, label: string): number {
  const resolved = value ?? 0;
  if (!Number.isFinite(resolved)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (Math.abs(resolved) > maxAbs) {
    throw new Error(`${label} cannot be more than ${maxAbs} mm per jog`);
  }
  return resolved;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateMachineProfile(value: unknown): MachineProfile {
  if (!isRecord(value)) {
    throw new Error('Machine profile must be an object');
  }

  const requiredStrings = ['id', 'name', 'machineKind', 'origin', 'penUpCommand', 'penDownCommand'];
  for (const field of requiredStrings) {
    if (typeof value[field] !== 'string' || value[field] === '') {
      throw new Error(`Machine profile missing ${field}`);
    }
  }

  if (!isRecord(value.workArea) || typeof value.workArea.x !== 'number' || typeof value.workArea.y !== 'number') {
    throw new Error('Machine profile missing workArea dimensions');
  }
  if (typeof value.baudRate !== 'number' || typeof value.travelSpeed !== 'number' || typeof value.drawingSpeed !== 'number') {
    throw new Error('Machine profile missing speed or baud-rate values');
  }
  if (!Array.isArray(value.safeStartupSequence) || !Array.isArray(value.safeShutdownSequence)) {
    throw new Error('Machine profile missing safe command sequences');
  }

  return value as unknown as MachineProfile;
}

function validateProject(value: unknown): SavedProject {
  if (!isRecord(value)) {
    throw new Error('Project file must contain a JSON object');
  }

  const requiredStrings = ['id', 'name', 'created', 'machineProfileId', 'units', 'savedAt'];
  for (const field of requiredStrings) {
    if (typeof value[field] !== 'string' || value[field] === '') {
      throw new Error(`Project missing ${field}`);
    }
  }

  if (!isRecord(value.canvas)) {
    throw new Error('Project missing canvas');
  }
  for (const field of ['width', 'height', 'offsetX', 'offsetY']) {
    if (typeof value.canvas[field] !== 'number') {
      throw new Error(`Project canvas missing ${field}`);
    }
  }
  if (!Array.isArray(value.objects)) {
    throw new Error('Project missing objects array');
  }

  return value as unknown as SavedProject;
}

function safeProjectFileName(project: SavedProject): string {
  const baseName = project.name || project.id || 'project';
  const safeName = baseName.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'project';
  return `${safeName}.boc.json`;
}

async function defaultProjectPath(project: SavedProject): Promise<string> {
  const projectDir = path.join(app.getPath('userData'), 'projects');
  await fs.mkdir(projectDir, { recursive: true });
  return path.join(projectDir, safeProjectFileName(project));
}

function profilesDirectory(): string {
  return path.join(app.getAppPath(), 'profiles');
}

async function readProfileFile(filePath: string): Promise<MachineProfile> {
  const profile = JSON.parse(await fs.readFile(filePath, 'utf8'));
  return validateMachineProfile(profile);
}

async function loadProfiles(): Promise<MachineProfile[]> {
  const directory = profilesDirectory();
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const profileFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => path.join(directory, entry.name));

  const profiles = await Promise.all(profileFiles.map(readProfileFile));
  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

async function waitForStreamingToStop(controller: GRBLController, timeoutMs: number = 3000): Promise<void> {
  const startedAt = Date.now();
  while (controller.isJobStreaming()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for active job to stop');
    }
    await delay(50);
  }
}

async function sendCommandSequence(controller: GRBLController, commands: string[]): Promise<string[]> {
  const responses: string[] = [];

  for (const command of commands) {
    const response = await controller.sendCommand(command);
    responses.push(response.message);
    if (response.type !== 'ok') {
      throw new Error(response.message);
    }
  }

  return responses;
}

function createWindow() {
  // Phase 4: Create main application window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Phase 4: Load app URL (dev server or bundled app)
  if (process.env.ELECTRON_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'));
  }
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Phase 4: IPC Handlers for serial communication
ipcMain.handle('serial:listPorts', async () => {
  return runSerialAction(() => listSerialPorts());
});

ipcMain.handle('serial:connect', async (_event, port: string, baudRate: number) => {
  return runSerialAction(async () => {
    if (grblController?.isPortConnected()) {
      await grblController.closePort();
    }

    grblController = new GRBLController();
    await grblController.openPort(port, baudRate || machineProfile.baudRate);
    return { port, baudRate: baudRate || machineProfile.baudRate };
  });
});

ipcMain.handle('serial:disconnect', async () => {
  return runSerialAction(async () => {
    if (grblController?.isPortConnected()) {
      await grblController.closePort();
    }
  });
});

ipcMain.handle('serial:sendJob', async (_event, gcode: string[]) => {
  return runSerialAction(async () => {
    const controller = requireController();
    if (!Array.isArray(gcode) || gcode.length === 0) {
      throw new Error('Generated job has no G-code lines');
    }
    if (gcode.some((line) => typeof line !== 'string')) {
      throw new Error('Generated job contains an invalid G-code line');
    }

    await controller.streamJob(gcode, (sent, total) => {
      mainWindow.webContents.send('serial:progress', { sent, total });
    }, { waitForIdle: true });
  });
});

ipcMain.handle('serial:perimeterTest', async (_event, width?: number, height?: number) => {
  return runSerialAction(async () => {
    const controller = requireController();
    const w = resolvePerimeterDimension(width, machineProfile.workArea.x, machineProfile.workArea.x, 'Perimeter width');
    const h = resolvePerimeterDimension(height, machineProfile.workArea.y, machineProfile.workArea.y, 'Perimeter height');
    const gcode = generatePerimeterGCode(w, h, machineProfile);
    await controller.streamJob(gcode, (sent, total) => {
      mainWindow.webContents.send('serial:progress', { sent, total });
    }, { waitForIdle: true });
  });
});

ipcMain.handle('serial:penDown', async () => {
  return runSerialAction(async () => {
    const controller = requireController();
    return sendCommandSequence(controller, [holdCurrentCommand, machineProfile.penDownCommand]);
  });
});

ipcMain.handle('serial:penUp', async () => {
  return runSerialAction(async () => {
    const controller = requireController();
    return sendCommandSequence(controller, [machineProfile.penUpCommand, idleReleaseCommand]);
  });
});

ipcMain.handle('serial:returnToOrigin', async () => {
  return runSerialAction(async () => {
    const controller = requireController();
    if (controller.isJobStreaming()) {
      await controller.cancel();
      await waitForStreamingToStop(controller);
      await delay(2000);
    }
    return sendCommandSequence(controller, [
      '$X',
      holdCurrentCommand,
      machineProfile.penUpCommand,
      `G1 X0 Y0 F${machineProfile.drawingSpeed}`
    ]);
  });
});

ipcMain.handle('serial:jog', async (_event, dx?: number, dy?: number) => {
  return runSerialAction(async () => {
    const controller = requireController();
    if (controller.isJobStreaming()) {
      throw new Error('Cannot jog while a job is running');
    }

    const x = resolveJogDistance(dx, 10, 'Jog X');
    const y = resolveJogDistance(dy, 10, 'Jog Y');
    if (x === 0 && y === 0) {
      throw new Error('Jog distance cannot be zero');
    }

    const parts = ['G91', machineProfile.penUpCommand];
    const move = ['G0'];
    if (x !== 0) {
      move.push(`X${x.toFixed(3)}`);
    }
    if (y !== 0) {
      move.push(`Y${y.toFixed(3)}`);
    }
    parts.push(move.join(' '));
    parts.push('G90');
    return sendCommandSequence(controller, parts);
  });
});

ipcMain.handle('serial:pause', async (_event) => {
  // Phase 4: NOT YET IMPLEMENTED
  return { error: 'Phase 4: Not yet implemented' };
});

ipcMain.handle('serial:resume', async (_event) => {
  // Phase 4: NOT YET IMPLEMENTED
  return { error: 'Phase 4: Not yet implemented' };
});

ipcMain.handle('serial:cancel', async () => {
  return runSerialAction(async () => {
    if (grblController) {
      await grblController.cancel();
    }
  });
});

// Phase 4: IPC Handlers for project management
ipcMain.handle('project:open', async (_event, filePath: string) => {
  return runSerialAction(async () => {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error('Project file path is required');
    }

    const project = validateProject(JSON.parse(await fs.readFile(filePath, 'utf8')));
    return { ...project, filePath };
  });
});

ipcMain.handle('project:save', async (_event, projectData: unknown, requestedPath?: string) => {
  return runSerialAction(async () => {
    const project = validateProject({
      ...(isRecord(projectData) ? projectData : {}),
      savedAt: new Date().toISOString()
    });
    const filePath = requestedPath || project.filePath || await defaultProjectPath(project);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify({ ...project, filePath: undefined }, null, 2)}\n`, 'utf8');
    return { ...project, filePath };
  });
});

// Phase 4: IPC Handlers for machine profiles
ipcMain.handle('machine:listProfiles', async (_event) => {
  return runSerialAction(() => loadProfiles());
});

ipcMain.handle('machine:getProfile', async (_event, profileId: string) => {
  return runSerialAction(async () => {
    if (typeof profileId !== 'string' || profileId.trim() === '') {
      throw new Error('Machine profile id is required');
    }

    const profiles = await loadProfiles();
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      throw new Error(`Machine profile not found: ${profileId}`);
    }
    return profile;
  });
});
