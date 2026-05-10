import { LengthUnit } from '../../types';

export const MILLIMETERS_PER_UNIT: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  ft: 304.8
};

export const UNIT_LABELS: Record<LengthUnit, string> = {
  mm: 'mm',
  cm: 'cm',
  in: 'in',
  ft: 'ft'
};

export const UNIT_NAMES: Record<LengthUnit, string> = {
  mm: 'Millimeters',
  cm: 'Centimeters',
  in: 'Inches',
  ft: 'Feet'
};

export function isLengthUnit(value: string): value is LengthUnit {
  return value === 'mm' || value === 'cm' || value === 'in' || value === 'ft';
}

export function normalizeLengthUnit(value: string): LengthUnit {
  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case 'mm':
    case 'millimeter':
    case 'millimeters':
      return 'mm';
    case 'cm':
    case 'centimeter':
    case 'centimeters':
      return 'cm';
    case 'in':
    case 'inch':
    case 'inches':
    case '"':
      return 'in';
    case 'ft':
    case 'foot':
    case 'feet':
    case "'":
      return 'ft';
    default:
      throw new Error(`Unsupported length unit: ${value}`);
  }
}

export function toMillimeters(value: number, unit: LengthUnit): number {
  return value * MILLIMETERS_PER_UNIT[unit];
}

export function fromMillimeters(valueMm: number, unit: LengthUnit): number {
  return valueMm / MILLIMETERS_PER_UNIT[unit];
}

export function convertLength(value: number, fromUnit: LengthUnit, toUnit: LengthUnit): number {
  return fromMillimeters(toMillimeters(value, fromUnit), toUnit);
}

export function formatLength(valueMm: number, unit: LengthUnit, precision: number = 2): string {
  const value = fromMillimeters(valueMm, unit);
  const formatted = Number(value.toFixed(precision)).toString();
  return `${formatted} ${UNIT_LABELS[unit]}`;
}

export function parseLength(input: string, defaultUnit: LengthUnit = 'mm'): { value: number; unit: LengthUnit; valueMm: number } {
  const match = input.trim().match(/^(-?(?:\d+\.?\d*|\.\d+))\s*([a-zA-Z"']*)$/);

  if (!match) {
    throw new Error(`Invalid length value: ${input}`);
  }

  const value = Number(match[1]);
  const unit = match[2] ? normalizeLengthUnit(match[2]) : defaultUnit;

  return {
    value,
    unit,
    valueMm: toMillimeters(value, unit)
  };
}
