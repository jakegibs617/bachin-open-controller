/**
 * Settings Page
 * Phase 4: Machine profile and project settings
 *
 * Features:
 * - Machine profile selector
 * - Profile editor (advanced)
 * - Canvas dimensions
 * - Units selection
 * - File save/load
 *
 * TODO (Phase 4):
 * - Load available profiles
 * - Implement profile form
 * - Connect to project state
 */

import React from 'react';
import { LengthUnit } from '../../types';
import { UNIT_NAMES, formatLength } from '../../core/units';

const UNIT_OPTIONS: LengthUnit[] = ['mm', 'cm', 'in', 'ft'];

interface SettingsProps {
  units: LengthUnit;
  onUnitsChange: (units: LengthUnit) => void;
}

export const Settings: React.FC<SettingsProps> = ({ units, onUnitsChange }) => {
  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <section className="settings-section">
        <label htmlFor="project-units">Project units</label>
        <select
          id="project-units"
          value={units}
          onChange={(event) => onUnitsChange(event.target.value as LengthUnit)}
        >
          {UNIT_OPTIONS.map((unit) => (
            <option key={unit} value={unit}>
              {UNIT_NAMES[unit]} ({unit})
            </option>
          ))}
        </select>
      </section>
      <section className="settings-section">
        <h3>TA4 work area</h3>
        <dl>
          <div>
            <dt>Width</dt>
            <dd>{formatLength(210, units)}</dd>
          </div>
          <div>
            <dt>Height</dt>
            <dd>{formatLength(297, units)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
};

export default Settings;
