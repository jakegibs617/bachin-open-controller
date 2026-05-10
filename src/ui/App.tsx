import React from 'react';
import { JobWarning, LengthUnit, Path } from '../types';
import { Controls } from './pages/Controls';
import { Canvas } from './pages/Canvas';
import { Settings } from './pages/Settings';
import pkg from '../../package.json';

type Page = 'controls' | 'canvas' | 'settings';

const NAV_LABELS: Record<Page, string> = {
  controls: 'Machine',
  canvas: 'Artwork',
  settings: 'Settings'
};

export interface PreparedJob {
  name: string;
  paths: Path[];
  gcode: string[];
  warnings: JobWarning[];
}

export const App: React.FC = () => {
  const [page, setPage] = React.useState<Page>('controls');
  const [units, setUnits] = React.useState<LengthUnit>('cm');
  const [preparedJob, setPreparedJob] = React.useState<PreparedJob | null>(null);
  const [serialConnected, setSerialConnected] = React.useState(false);
  const [jobProgress, setJobProgress] = React.useState<{ sent: number; total: number } | null>(null);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-bar">
          <div>
            <span className="app-title">Bachin Open Controller</span>
            <span className="app-version">v{pkg.version}</span>
          </div>
          <div className="app-bar-right">
            <div className="conn-chip">
              <span className={`conn-dot${serialConnected ? ' on' : ''}`} />
              <span>{serialConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
        <nav className="app-nav">
          {(['controls', 'canvas', 'settings'] as Page[]).map((p) => (
            <button
              key={p}
              type="button"
              className={page === p ? 'active' : ''}
              onClick={() => setPage(p)}
            >
              {NAV_LABELS[p]}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        <div style={page !== 'controls' ? { display: 'none' } : {}}>
          <Controls
            connected={serialConnected}
            onConnectedChange={setSerialConnected}
            preparedJob={preparedJob}
            onClearPreparedJob={() => setPreparedJob(null)}
            units={units}
            onProgressChange={setJobProgress}
          />
        </div>
        <div style={page !== 'canvas' ? { display: 'none' } : {}}>
          <Canvas units={units} preparedJob={preparedJob} onPreparedJobChange={setPreparedJob} jobProgress={jobProgress} />
        </div>
        <div style={page !== 'settings' ? { display: 'none' } : {}}>
          <Settings units={units} onUnitsChange={setUnits} />
        </div>
      </main>
    </div>
  );
};

export default App;
