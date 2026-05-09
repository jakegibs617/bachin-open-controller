/**
 * Entry point for React application
 * Phase 4: Render React app into DOM
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../src/ui/App';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
