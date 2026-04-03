import { MAX_PRESET_MINUTES, MIN_PRESET_MINUTES, PRESETS } from './constants';

export const TIMER_PRESET_STORAGE_KEY = 'g2-timer:preset-settings:v1';
export const MAX_CUSTOM_PRESET_SLOTS = 8;

export interface TimerPresetSettings {
  customPresets: number[];
}

type PresetStorageBridge = {
  getLocalStorage?: (key: string) => Promise<string>;
  setLocalStorage?: (key: string, value: string) => Promise<boolean>;
};

export const DEFAULT_TIMER_PRESET_SETTINGS: TimerPresetSettings = {
  customPresets: [...PRESETS],
};

function normalizePresetMinute(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  if (rounded < MIN_PRESET_MINUTES || rounded > MAX_PRESET_MINUTES) {
    return null;
  }

  return rounded;
}

export function normalizeCustomPresets(input: unknown): number[] {
  const values = Array.isArray(input) ? input : [];
  const uniquePresets = new Set<number>();

  for (const value of values) {
    const normalized = normalizePresetMinute(value);
    if (normalized === null) {
      continue;
    }
    uniquePresets.add(normalized);
    if (uniquePresets.size >= MAX_CUSTOM_PRESET_SLOTS) {
      break;
    }
  }

  const normalizedPresets = [...uniquePresets];
  return normalizedPresets.length ? normalizedPresets : [...DEFAULT_TIMER_PRESET_SETTINGS.customPresets];
}

export function normalizeTimerPresetSettings(input: unknown): TimerPresetSettings {
  const candidate = typeof input === 'object' && input !== null
    ? input as Partial<TimerPresetSettings>
    : {};

  return {
    customPresets: normalizeCustomPresets(candidate.customPresets),
  };
}

export function parseCustomPresetInput(value: string): number[] {
  return normalizeCustomPresets(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => Number(entry)),
  );
}

function readWindowStorage(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(TIMER_PRESET_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeWindowStorage(value: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(TIMER_PRESET_STORAGE_KEY, value);
  } catch {}
}

export async function loadTimerPresetSettings(bridge: PresetStorageBridge | null): Promise<TimerPresetSettings> {
  let raw = '';

  if (bridge?.getLocalStorage) {
    try {
      raw = await bridge.getLocalStorage(TIMER_PRESET_STORAGE_KEY);
    } catch {}
  }

  if (!raw) {
    raw = readWindowStorage();
  }

  if (!raw) {
    return DEFAULT_TIMER_PRESET_SETTINGS;
  }

  try {
    return normalizeTimerPresetSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_TIMER_PRESET_SETTINGS;
  }
}

export async function saveTimerPresetSettings(
  settings: TimerPresetSettings,
  bridge: PresetStorageBridge | null,
): Promise<void> {
  const normalized = normalizeTimerPresetSettings(settings);
  const serialized = JSON.stringify(normalized);

  if (bridge?.setLocalStorage) {
    try {
      await bridge.setLocalStorage(TIMER_PRESET_STORAGE_KEY, serialized);
    } catch {}
  }

  writeWindowStorage(serialized);
}
