/**
 * Controls Page
 * Phase 4: Job streaming and machine control
 *
 * Features:
 * - Connect/disconnect buttons
 * - Start/pause/stop job controls
 * - Progress bar and stats
 * - Machine status display (X, Y, Z position)
 * - Error/warning display
 *
 * TODO (Phase 4):
 * - Create IPC channel for serial commands
 * - Implement progress polling
 * - Add status display
 * - Real-time error handling
 */

import React from 'react';

type IpcResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
}

interface ElectronApi {
  serial: {
    listPorts: () => Promise<IpcResult<SerialPortInfo[]>>;
    connect: (port: string, baudRate: number) => Promise<IpcResult<{ port: string; baudRate: number }>>;
    disconnect: () => Promise<IpcResult>;
    penDown: () => Promise<IpcResult<string[]>>;
    penUp: () => Promise<IpcResult<string[]>>;
  };
}

declare global {
  interface Window {
    api?: ElectronApi;
  }
}

export const Controls: React.FC = () => {
  const [ports, setPorts] = React.useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = React.useState('');
  const [baudRate, setBaudRate] = React.useState(115200);
  const [connected, setConnected] = React.useState(false);
  const [penDown, setPenDown] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('Connect to a GRBL controller to enable pen control.');
  const [error, setError] = React.useState<string | null>(null);

  const apiAvailable = Boolean(window.api?.serial);

  const runAction = async (action: () => Promise<IpcResult>, successMessage: string): Promise<boolean> => {
    if (!window.api?.serial) {
      setError('Electron serial bridge is not available.');
      return false;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return false;
      }

      setMessage(successMessage);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const refreshPorts = React.useCallback(async () => {
    if (!window.api?.serial) {
      setError('Electron serial bridge is not available.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await window.api.serial.listPorts();
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const nextPorts = result.data ?? [];
      setPorts(nextPorts);
      setSelectedPort((current) => current || nextPorts[0]?.path || '');
      setMessage(nextPorts.length > 0 ? 'Select a port, then connect.' : 'No serial ports found.');
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    if (apiAvailable) {
      refreshPorts();
    }
  }, [apiAvailable, refreshPorts]);

  const connect = async () => {
    const ok = await runAction(
      () => window.api!.serial.connect(selectedPort, baudRate),
      `Connected to ${selectedPort}.`
    );
    if (ok) {
      setConnected(true);
      setPenDown(false);
    }
  };

  const disconnect = async () => {
    const ok = await runAction(() => window.api!.serial.disconnect(), 'Disconnected.');
    if (ok) {
      setConnected(false);
      setPenDown(false);
    }
  };

  const lowerPen = async () => {
    const ok = await runAction(
      () => window.api!.serial.penDown(),
      'Pen is down. Hold current remains enabled until Up is pressed.'
    );
    if (ok) {
      setPenDown(true);
    }
  };

  const liftPen = async () => {
    const ok = await runAction(() => window.api!.serial.penUp(), 'Pen is up.');
    if (ok) {
      setPenDown(false);
    }
  };

  return (
    <div className="controls-page">
      <h2>Manual Pen Control</h2>
      <section className="control-section">
        <div className="field-row">
          <label htmlFor="serial-port">Serial port</label>
          <select
            id="serial-port"
            value={selectedPort}
            disabled={!apiAvailable || busy || connected}
            onChange={(event) => setSelectedPort(event.target.value)}
          >
            {ports.length === 0 && <option value="">No ports found</option>}
            {ports.map((port) => (
              <option key={port.path} value={port.path}>
                {port.manufacturer ? `${port.path} - ${port.manufacturer}` : port.path}
              </option>
            ))}
          </select>
          <button type="button" disabled={!apiAvailable || busy || connected} onClick={refreshPorts}>
            Refresh
          </button>
        </div>

        <div className="field-row">
          <label htmlFor="baud-rate">Baud rate</label>
          <input
            id="baud-rate"
            type="number"
            min="9600"
            step="9600"
            value={baudRate}
            disabled={busy || connected}
            onChange={(event) => setBaudRate(Number(event.target.value))}
          />
          {connected ? (
            <button type="button" disabled={busy} onClick={disconnect}>
              Disconnect
            </button>
          ) : (
            <button type="button" disabled={!apiAvailable || busy || !selectedPort} onClick={connect}>
              Connect
            </button>
          )}
        </div>
      </section>

      <section className="control-section">
        <div className={`pen-state ${penDown ? 'down' : 'up'}`}>
          <span>Status</span>
          <strong>{penDown ? 'Down and holding' : 'Up'}</strong>
        </div>
        <div className="pen-actions">
          <button type="button" className="pen-button down" disabled={!connected || busy || penDown} onClick={lowerPen}>
            Down
          </button>
          <button type="button" className="pen-button up" disabled={!connected || busy || !penDown} onClick={liftPen}>
            Up
          </button>
        </div>
      </section>

      <p className="status-message">{busy ? 'Working...' : message}</p>
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};

export default Controls;
