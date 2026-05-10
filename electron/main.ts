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
import * as path from 'path';
import { GRBLController, listSerialPorts } from '../src/core/serial-grbl';
import ta4Profile from '../profiles/ta4.json';
import { MachineProfile } from '../src/types';

let mainWindow: BrowserWindow;
let grblController: GRBLController | undefined;
const machineProfile = ta4Profile as MachineProfile;
const holdCurrentCommand = '$1=255';
const idleReleaseCommand = '$1=250';

type IpcResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

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

ipcMain.handle('serial:connect', async (event, port: string, baudRate: number) => {
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

ipcMain.handle('serial:sendJob', async (event, gcode: string[]) => {
  // Phase 4: NOT YET IMPLEMENTED
  return { error: 'Phase 4: Not yet implemented' };
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

ipcMain.handle('serial:pause', async (event) => {
  // Phase 4: NOT YET IMPLEMENTED
  return { error: 'Phase 4: Not yet implemented' };
});

ipcMain.handle('serial:resume', async (event) => {
  // Phase 4: NOT YET IMPLEMENTED
  return { error: 'Phase 4: Not yet implemented' };
});

ipcMain.handle('serial:cancel', async (event) => {
  // Phase 4: NOT YET IMPLEMENTED
  return { error: 'Phase 4: Not yet implemented' };
});

// Phase 4: IPC Handlers for project management
ipcMain.handle('project:open', async (event, filePath: string) => {
  // Phase 4: NOT YET IMPLEMENTED
  return { error: 'Phase 4: Not yet implemented' };
});

ipcMain.handle('project:save', async (event, projectData: any) => {
  // Phase 4: NOT YET IMPLEMENTED
  return { error: 'Phase 4: Not yet implemented' };
});

// Phase 4: IPC Handlers for machine profiles
ipcMain.handle('machine:listProfiles', async (event) => {
  // Phase 4: NOT YET IMPLEMENTED
  return { error: 'Phase 4: Not yet implemented' };
});

ipcMain.handle('machine:getProfile', async (event, profileId: string) => {
  // Phase 4: NOT YET IMPLEMENTED
  return { error: 'Phase 4: Not yet implemented' };
});
