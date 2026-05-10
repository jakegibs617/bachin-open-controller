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
      <div className="card">
        <div className="card-label">Display units</div>
        <div className="settings-section">
          <label htmlFor="project-units">Measurement units</label>
          <select
            id="project-units"
            value={units}
            onChange={(e) => onUnitsChange(e.target.value as LengthUnit)}
          >
            {UNIT_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_NAMES[unit]} ({unit})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="card-label">TA4 work area</div>
        <dl>
          <div>
            <dt>Width</dt>
            <dd>{formatLength(180, units)}</dd>
          </div>
          <div>
            <dt>Height</dt>
            <dd>{formatLength(210, units)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
};

export default Settings;
