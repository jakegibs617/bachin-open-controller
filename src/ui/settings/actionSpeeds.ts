import { MachineProfile } from '../../types';

export interface ActionSpeedSettings {
  travelSpeed: number;
  drawingSpeed: number;
  penSpeed: number;
}

const STORAGE_KEY = 'bachin-open-controller.action-speeds';

export const MIN_ACTION_SPEED = 100;
export const MAX_ACTION_SPEED = 10000;

function clampSpeed(value: unknown, fallback: number): number {
  const speed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(speed)) {
    return fallback;
  }

  return Math.max(MIN_ACTION_SPEED, Math.min(MAX_ACTION_SPEED, Math.round(speed)));
}

function feedFromCommand(command: string): number | null {
  const match = command.match(/\bF(-?\d+(?:\.\d+)?)\b/i);
  if (!match) {
    return null;
  }

  const feed = Number(match[1]);
  return Number.isFinite(feed) && feed > 0 ? feed : null;
}

export function defaultActionSpeedSettings(profile: MachineProfile): ActionSpeedSettings {
  const penSpeed = feedFromCommand(profile.penDownCommand) ?? feedFromCommand(profile.penUpCommand) ?? profile.drawingSpeed;

  return {
    travelSpeed: clampSpeed(profile.travelSpeed, 6000),
    drawingSpeed: clampSpeed(profile.drawingSpeed, 1600),
    penSpeed: clampSpeed(penSpeed, 6000)
  };
}

export function loadActionSpeedSettings(storage: Storage | undefined, fallback: ActionSpeedSettings): ActionSpeedSettings {
  if (!storage) {
    return fallback;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<ActionSpeedSettings>;
    return {
      travelSpeed: clampSpeed(parsed.travelSpeed, fallback.travelSpeed),
      drawingSpeed: clampSpeed(parsed.drawingSpeed, fallback.drawingSpeed),
      penSpeed: clampSpeed(parsed.penSpeed, fallback.penSpeed)
    };
  } catch {
    return fallback;
  }
}

export function saveActionSpeedSettings(storage: Storage | undefined, settings: ActionSpeedSettings): void {
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify({
    travelSpeed: clampSpeed(settings.travelSpeed, MIN_ACTION_SPEED),
    drawingSpeed: clampSpeed(settings.drawingSpeed, MIN_ACTION_SPEED),
    penSpeed: clampSpeed(settings.penSpeed, MIN_ACTION_SPEED)
  }));
}
