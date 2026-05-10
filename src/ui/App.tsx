import React from 'react';
import { LengthUnit } from '../types';
import { Controls } from './pages/Controls';
import { Canvas } from './pages/Canvas';
import { Settings } from './pages/Settings';

type Page = 'controls' | 'canvas' | 'settings';

export const App: React.FC = () => {
  const [page, setPage] = React.useState<Page>('controls');
  const [units, setUnits] = React.useState<LengthUnit>('mm');

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
        {page === 'controls' && <Controls />}
        {page === 'canvas' && <Canvas units={units} />}
        {page === 'settings' && <Settings units={units} onUnitsChange={setUnits} />}
      </main>
    </div>
  );
};

export default App;
