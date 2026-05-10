/**
 * Main React App Component
 * Phase 4: Root component for Electron UI
 *
 * Features:
 * - Project/connection state management
 * - Router for pages (Canvas, Controls, Settings)
 * - Global error handling
 *
 * TODO (Phase 4):
 * - Set up Zustand store for app state
 * - Implement page routing
 * - Add error boundary
 * - Connect to IPC handlers
 */

import React from 'react';
import { LengthUnit } from '../types';
import Canvas from './pages/Canvas';
import Controls from './pages/Controls';
import Settings from './pages/Settings';

type Page = 'canvas' | 'controls' | 'settings';

const PAGES: Array<{ id: Page; label: string }> = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'controls', label: 'Controls' },
  { id: 'settings', label: 'Settings' }
];

export const App: React.FC = () => {
  const [activePage, setActivePage] = React.useState<Page>('settings');
  const [units, setUnits] = React.useState<LengthUnit>('mm');

  return (
    <div className="app">
      <header>
        <div>Bachin Open Controller</div>
        <nav aria-label="Main navigation">
          {PAGES.map((page) => (
            <button
              key={page.id}
              type="button"
              className={activePage === page.id ? 'active' : ''}
              onClick={() => setActivePage(page.id)}
            >
              {page.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {activePage === 'canvas' && <Canvas units={units} />}
        {activePage === 'controls' && <Controls />}
        {activePage === 'settings' && <Settings units={units} onUnitsChange={setUnits} />}
      </main>
    </div>
  );
};

export default App;
