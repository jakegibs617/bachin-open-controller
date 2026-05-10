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
import { PreparedJob } from '../App';

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
    returnToOrigin: () => Promise<IpcResult<string[]>>;
    jog: (dx: number, dy: number) => Promise<IpcResult<string[]>>;
    perimeterTest: (width: number, height: number) => Promise<IpcResult>;
    sendJob: (gcode: string[]) => Promise<IpcResult>;
    pause: () => Promise<IpcResult>;
    resume: () => Promise<IpcResult>;
    cancel: () => Promise<IpcResult>;
    cancelAndReturnToOrigin: () => Promise<IpcResult<string[]>>;
    onProgress: (callback: (data: { sent: number; total: number }) => void) => () => void;
  };
}

declare global {
  interface Window {
    api?: ElectronApi;
  }
}

interface ControlsProps {
  connected: boolean;
  onConnectedChange: (connected: boolean) => void;
  preparedJob: PreparedJob | null;
  onClearPreparedJob: () => void;
}

export const Controls: React.FC<ControlsProps> = ({ connected, onConnectedChange, preparedJob, onClearPreparedJob }) => {
  const [ports, setPorts] = React.useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = React.useState('');
  const [baudRate, setBaudRate] = React.useState(115200);
  const [penDown, setPenDown] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [streaming, setStreaming] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [progress, setProgress] = React.useState<{ sent: number; total: number } | null>(null);
  const [jogStep, setJogStep] = React.useState(1);
  const [jogOffset, setJogOffset] = React.useState({ x: 0, y: 0 });
  const [perimeterWidth, setPerimeterWidth] = React.useState(20);
  const [perimeterHeight, setPerimeterHeight] = React.useState(20);
  const [message, setMessage] = React.useState('Connect to a GRBL controller to enable pen control.');
  const [error, setError] = React.useState<string | null>(null);

  const apiAvailable = Boolean(window.api?.serial);
  const jobRunDisabledReason = busy
      ? 'Wait for the current command to finish.'
      : '';

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
      onConnectedChange(true);
      setPenDown(false);
      setPaused(false);
    }
  };

  const disconnect = async () => {
    const ok = await runAction(() => window.api!.serial.disconnect(), 'Disconnected.');
    if (ok) {
      onConnectedChange(false);
      setPenDown(false);
      setPaused(false);
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

  const returnToOrigin = async () => {
    const ok = await runAction(() => window.api!.serial.returnToOrigin(), 'Returned to origin.');
    if (ok) {
      setPenDown(false);
      setStreaming(false);
      setPaused(false);
      setProgress(null);
      setJogOffset({ x: 0, y: 0 });
    }
  };

  const jog = async (dx: number, dy: number) => {
    const ok = await runAction(() => window.api!.serial.jog(dx, dy), `Jogged ${dx || 0}, ${dy || 0} mm.`);
    if (ok) {
      setPenDown(false);
      setJogOffset((current) => ({
        x: Number((current.x + dx).toFixed(3)),
        y: Number((current.y + dy).toFixed(3))
      }));
    }
  };

  const safeJogStep = Number.isFinite(jogStep) && jogStep > 0 ? Math.min(jogStep, 10) : 1;

  const runPerimeterTest = async () => {
    if (!window.api?.serial) {
      setError('Electron serial bridge is not available.');
      return;
    }
    setStreaming(true);
    setPaused(false);
    setProgress(null);
    setError(null);
    setMessage('Running perimeter test...');
    try {
      const result = await window.api.serial.perimeterTest(perimeterWidth, perimeterHeight);
      if (!result.ok) {
        setError(result.error);
        setMessage('Perimeter test failed.');
      } else {
        setMessage('Perimeter test complete.');
      }
    } finally {
      setStreaming(false);
      setPaused(false);
      setProgress(null);
    }
  };

  const runPreparedJob = async () => {
    if (!preparedJob) {
      setError('No generated job is ready.');
      return;
    }
    if (!window.api?.serial) {
      setError('Electron serial bridge is not available.');
      return;
    }

    setStreaming(true);
    setPaused(false);
    setProgress(null);
    setError(null);
    setMessage(`Running ${preparedJob.name}...`);
    try {
      const result = await window.api.serial.sendJob(preparedJob.gcode);
      if (!result.ok) {
        setError(result.error);
        setMessage('SVG job failed.');
      } else {
        setMessage('SVG job complete.');
        setPenDown(false);
      }
    } finally {
      setStreaming(false);
      setPaused(false);
      setProgress(null);
    }
  };

  const pauseJob = async () => {
    if (!window.api?.serial) {
      setError('Electron serial bridge is not available.');
      return;
    }

    setError(null);
    setMessage('Pausing...');
    const result = await window.api.serial.pause();
    if (!result.ok) {
      setError(result.error);
      setMessage('Pause failed.');
      return;
    }

    setPaused(true);
    setMessage('Paused.');
  };

  const resumeJob = async () => {
    if (!window.api?.serial) {
      setError('Electron serial bridge is not available.');
      return;
    }

    setError(null);
    setMessage('Resuming...');
    const result = await window.api.serial.resume();
    if (!result.ok) {
      setError(result.error);
      setMessage('Resume failed.');
      return;
    }

    setPaused(false);
    setMessage('Running...');
  };

  const cancelJob = async () => {
    setMessage('Cancelling...');
    const result = await window.api?.serial.cancel();
    if (result && !result.ok) {
      setError(result.error);
      return;
    }
    setPaused(false);
  };

  const cancelAndReturnToOrigin = async () => {
    if (!window.api?.serial) {
      setError('Electron serial bridge is not available.');
      return;
    }

    setError(null);
    setMessage('Cancelling and returning to origin...');
    const result = await window.api.serial.cancelAndReturnToOrigin();
    if (!result.ok) {
      setError(result.error);
      setMessage('Cancel and return failed.');
      return;
    }

    setPenDown(false);
    setStreaming(false);
    setPaused(false);
    setProgress(null);
    setJogOffset({ x: 0, y: 0 });
    setMessage('Cancelled and returned to origin.');
  };

  const stopMachine = async () => {
    if (!window.api?.serial) {
      setError('Electron serial bridge is not available.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage('Stopping...');
    try {
      const result = await window.api.serial.cancel();
      if (!result.ok) {
        setError(result.error);
        setMessage('Stop failed.');
        return;
      }
      setPenDown(false);
      setStreaming(false);
      setPaused(false);
      setProgress(null);
      setMessage('Stopped.');
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    if (!window.api?.serial) return;
    return window.api.serial.onProgress((data) => setProgress(data));
  }, []);

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
        <div className="field-row origin-row">
          <button type="button" disabled={!connected || busy} onClick={returnToOrigin}>
            Return to Origin
          </button>
          <button type="button" className="stop-button" disabled={!connected || busy} onClick={stopMachine}>
            Stop
          </button>
        </div>
      </section>

      <section className="control-section">
        <h3>Jog</h3>
        <dl className="jog-readout">
          <div>
            <dt>X offset</dt>
            <dd>{jogOffset.x.toFixed(1)} mm</dd>
          </div>
          <div>
            <dt>Y offset</dt>
            <dd>{jogOffset.y.toFixed(1)} mm</dd>
          </div>
        </dl>
        <div className="field-row">
          <label htmlFor="jog-step">Step (mm)</label>
          <input
            id="jog-step"
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            value={jogStep}
            disabled={busy || streaming}
            onChange={(event) => setJogStep(Number(event.target.value))}
          />
          <button type="button" disabled={busy || streaming} onClick={() => setJogOffset({ x: 0, y: 0 })}>
            Zero Counter
          </button>
        </div>
        <div className="jog-pad" aria-label="Jog controls">
          <button type="button" disabled={!connected || busy || streaming} onClick={() => jog(0, safeJogStep)}>
            Up
          </button>
          <button type="button" disabled={!connected || busy || streaming} onClick={() => jog(-safeJogStep, 0)}>
            Left
          </button>
          <button type="button" disabled={!connected || busy || streaming} onClick={() => jog(safeJogStep, 0)}>
            Right
          </button>
          <button type="button" disabled={!connected || busy || streaming} onClick={() => jog(0, -safeJogStep)}>
            Down
          </button>
        </div>
      </section>

      <section className="control-section">
        <h3>Prepared SVG Job</h3>
        {preparedJob ? (
          <>
            <dl className="job-readout">
              <div>
                <dt>File</dt>
                <dd>{preparedJob.name}</dd>
              </div>
              <div>
                <dt>Lines</dt>
                <dd>{preparedJob.gcode.length}</dd>
              </div>
            </dl>
            {preparedJob.warnings.length > 0 && (
              <ul className="warning-list">
                {preparedJob.warnings.map((warning, index) => (
                  <li key={`${warning.message}-${index}`} className={warning.severity}>
                    {warning.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="field-row">
              {streaming ? (
                <>
                  {paused ? (
                    <button type="button" onClick={resumeJob}>Resume</button>
                  ) : (
                    <button type="button" onClick={pauseJob}>Pause</button>
                  )}
                  <button type="button" onClick={cancelJob}>Cancel</button>
                  <button type="button" onClick={cancelAndReturnToOrigin}>Cancel + Origin</button>
                </>
              ) : (
                <button type="button" disabled={busy} onClick={runPreparedJob}>
                  Run Artwork Job
                </button>
              )}
              <button type="button" disabled={streaming} onClick={onClearPreparedJob}>
                Clear Job
              </button>
            </div>
            {jobRunDisabledReason && <p className="hint">{jobRunDisabledReason}</p>}
          </>
        ) : (
          <p className="hint">Import an SVG on the Canvas tab to prepare a job.</p>
        )}
      </section>

      <section className="control-section">
        <h3>Perimeter Test</h3>
        <p className="hint">Safe measured area is 180 mm right by 210 mm down from origin.</p>
        <div className="field-row">
          <label htmlFor="perimeter-width">Width (mm)</label>
          <input
            id="perimeter-width"
            type="number"
            min="10"
            max="180"
            value={perimeterWidth}
            disabled={streaming}
            onChange={(e) => setPerimeterWidth(Number(e.target.value))}
          />
        </div>
        <div className="field-row">
          <label htmlFor="perimeter-height">Height (mm)</label>
          <input
            id="perimeter-height"
            type="number"
            min="10"
            max="210"
            value={perimeterHeight}
            disabled={streaming}
            onChange={(e) => setPerimeterHeight(Number(e.target.value))}
          />
        </div>
        <div className="field-row">
          {streaming ? (
            <>
              {paused ? (
                <button type="button" onClick={resumeJob}>Resume</button>
              ) : (
                <button type="button" onClick={pauseJob}>Pause</button>
              )}
              <button type="button" onClick={cancelJob}>Cancel</button>
              <button type="button" onClick={cancelAndReturnToOrigin}>Cancel + Origin</button>
            </>
          ) : (
            <button type="button" disabled={!connected || busy} onClick={runPerimeterTest}>
              Run Perimeter Test
            </button>
          )}
          {progress && (
            <span className="progress-label">{progress.sent} / {progress.total} lines</span>
          )}
        </div>
      </section>

      <p className="status-message">{paused ? 'Paused.' : busy || streaming ? 'Working...' : message}</p>
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};

export default Controls;
