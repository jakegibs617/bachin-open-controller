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

export const Controls: React.FC = () => {
  return (
    <div className="controls-page">
      <h2>Job Controls</h2>
      <p>Serial connection support is implemented in the core controller. Use the hardware test to verify the connected GRBL controller before enabling motion controls here.</p>
    </div>
  );
};

export default Controls;
