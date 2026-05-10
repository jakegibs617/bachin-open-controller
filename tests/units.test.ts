import {
  convertLength,
  formatLength,
  fromMillimeters,
  normalizeLengthUnit,
  parseLength,
  toMillimeters
} from '../src/core/units';
import { convertSVGLengthToMM } from '../src/importers/svg';

describe('length unit conversion', () => {
  it('converts supported display units to millimeters', () => {
    expect(toMillimeters(12, 'mm')).toBe(12);
    expect(toMillimeters(2.54, 'cm')).toBeCloseTo(25.4);
    expect(toMillimeters(1, 'in')).toBeCloseTo(25.4);
    expect(toMillimeters(1, 'ft')).toBeCloseTo(304.8);
  });

  it('converts millimeters back to display units', () => {
    expect(fromMillimeters(25.4, 'in')).toBeCloseTo(1);
    expect(convertLength(12, 'in', 'ft')).toBeCloseTo(1);
  });

  it('parses common metric and imperial unit names', () => {
    expect(parseLength('10 cm').valueMm).toBeCloseTo(100);
    expect(parseLength('2 inches').valueMm).toBeCloseTo(50.8);
    expect(parseLength("3'").unit).toBe('ft');
    expect(normalizeLengthUnit('feet')).toBe('ft');
  });

  it('formats millimeter values in the selected display unit', () => {
    expect(formatLength(25.4, 'in')).toBe('1 in');
    expect(formatLength(304.8, 'ft', 3)).toBe('1 ft');
  });

  it('keeps SVG pixels compatible with explicit SVG units', () => {
    expect(convertSVGLengthToMM(96, 'px')).toBeCloseTo(25.4);
    expect(convertSVGLengthToMM(1, 'in')).toBeCloseTo(25.4);
    expect(convertSVGLengthToMM(2, 'cm')).toBeCloseTo(20);
  });
});
