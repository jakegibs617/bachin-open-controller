/**
 * Canvas Page
 * Phase 4: SVG preview and canvas editor
 *
 * Features:
 * - Display imported SVG paths
 * - Show work area bounds
 * - Zoom/pan controls (Konva)
 * - Object transform UI (drag, scale, rotate)
 *
 * TODO (Phase 4):
 * - Implement Konva canvas
 * - Add zoom/pan
 * - Add object selection and transform
 * - Connect to project state
 */

import React from 'react';
import { LengthUnit } from '../../types';
import { formatLength } from '../../core/units';

interface CanvasProps {
  units: LengthUnit;
}

export const Canvas: React.FC<CanvasProps> = ({ units }) => {
  return (
    <div className="canvas-page">
      <h2>Canvas Preview</h2>
      <div className="work-area-preview" aria-label="TA4 work area preview">
        <span>{formatLength(210, units)}</span>
        <span>{formatLength(297, units)}</span>
      </div>
    </div>
  );
};

export default Canvas;
