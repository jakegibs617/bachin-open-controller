import React from 'react';
import { JobWarning, LengthUnit, Path } from '../types';
import { Controls } from './pages/Controls';
import { Canvas } from './pages/Canvas';
import { Settings } from './pages/Settings';

type Page = 'controls' | 'canvas' | 'settings';

export interface PreparedJob {
  name: string;
  paths: Path[];
  gcode: string[];
  warnings: JobWarning[];
}

export const App: React.FC = () => {
  const [page, setPage] = React.useState<Page>('controls');
  const [units, setUnits] = React.useState<LengthUnit>('mm');
  const [preparedJob, setPreparedJob] = React.useState<PreparedJob | null>(null);
  const [serialConnected, setSerialConnected] = React.useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">Bachin Open Controller</span>
        <nav className="app-nav">
          {(['controls', 'canvas', 'settings'] as Page[]).map((p) => (
            <button
              key={p}
              type="button"
              className={page === p ? 'active' : ''}
              onClick={() => setPage(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {page === 'controls' && (
          <Controls
            connected={serialConnected}
            onConnectedChange={setSerialConnected}
            preparedJob={preparedJob}
            onClearPreparedJob={() => setPreparedJob(null)}
          />
        )}
        {page === 'canvas' && <Canvas units={units} preparedJob={preparedJob} onPreparedJobChange={setPreparedJob} />}
        {page === 'settings' && <Settings units={units} onUnitsChange={setUnits} />}
      </main>
    </div>
  );
};

export default App;
