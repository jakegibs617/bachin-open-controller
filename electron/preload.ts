/**
 * Electron Preload Script
 * Phase 4: IPC bridge between renderer and main process
 *
 * Exposes safe IPC methods to renderer process
 * All IPC calls go through this bridge for security
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Phase 4: Serial communication
  serial: {
    listPorts: () => ipcRenderer.invoke('serial:listPorts'),
    connect: (port: string, baudRate: number) => ipcRenderer.invoke('serial:connect', port, baudRate),
    disconnect: () => ipcRenderer.invoke('serial:disconnect'),
    sendJob: (gcode: string[]) => ipcRenderer.invoke('serial:sendJob', gcode),
    penDown: () => ipcRenderer.invoke('serial:penDown'),
    penUp: () => ipcRenderer.invoke('serial:penUp'),
    pause: () => ipcRenderer.invoke('serial:pause'),
    resume: () => ipcRenderer.invoke('serial:resume'),
    cancel: () => ipcRenderer.invoke('serial:cancel'),
    onProgress: (callback: (progress: any) => void) => ipcRenderer.on('serial:progress', (event, data) => callback(data))
  },

  // Phase 4: Project management
  project: {
    open: (filePath: string) => ipcRenderer.invoke('project:open', filePath),
    save: (projectData: any) => ipcRenderer.invoke('project:save', projectData)
  },

  // Phase 4: Machine profiles
  machine: {
    listProfiles: () => ipcRenderer.invoke('machine:listProfiles'),
    getProfile: (profileId: string) => ipcRenderer.invoke('machine:getProfile', profileId)
  }
});

export {};
