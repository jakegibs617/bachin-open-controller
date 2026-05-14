import React from 'react';
import { JobWarning, LengthUnit, Path } from '../types';
import { Controls } from './pages/Controls';
import { Canvas } from './pages/Canvas';
import { Settings } from './pages/Settings';
import pkg from '../../package.json';

type Page = 'controls' | 'canvas' | 'settings';
type Theme = 'light' | 'dark';

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
  const [theme, setTheme] = React.useState<Theme>(() => {
    const savedTheme = window.localStorage.getItem('bachin-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [preparedJob, setPreparedJob] = React.useState<PreparedJob | null>(null);
  const [serialConnected, setSerialConnected] = React.useState(false);
  const [jobProgress, setJobProgress] = React.useState<{ sent: number; total: number } | null>(null);

  React.useEffect(() => {
    window.localStorage.setItem('bachin-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => current === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="app" data-theme={theme}>
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
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              <span className="theme-toggle-icon" aria-hidden="true" />
              <span className="theme-toggle-text">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
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
