export const TIMER_LAYOUT_STORAGE_KEY = 'g2-timer:layout-settings:v1';

export const TIMER_LAYOUT_FORMATS = ['large', 'compact'] as const;
export const TIMER_LAYOUT_VERTICALS = ['top', 'mid', 'center'] as const;
export const TIMER_LAYOUT_HORIZONTALS = ['left', 'center', 'right'] as const;
export const TIMER_DONE_BLINK_COUNTS = [0, 1, 2, 3, 5, 10] as const;
export const TIMER_LAYOUT_FIELDS = ['format', 'vertical', 'horizontal', 'doneBlinkCount'] as const;

export type TimerLayoutFormat = typeof TIMER_LAYOUT_FORMATS[number];
export type TimerLayoutVertical = typeof TIMER_LAYOUT_VERTICALS[number];
export type TimerLayoutHorizontal = typeof TIMER_LAYOUT_HORIZONTALS[number];
export type TimerLayoutField = typeof TIMER_LAYOUT_FIELDS[number];

export interface TimerLayoutSettings {
  format: TimerLayoutFormat;
  vertical: TimerLayoutVertical;
  horizontal: TimerLayoutHorizontal;
  doneBlinkCount: number;
}

export interface TimerLayoutMenuState {
  selectedField: TimerLayoutField;
  draftSettings: TimerLayoutSettings;
}

type LayoutStorageBridge = {
  getLocalStorage?: (key: string) => Promise<string>;
  setLocalStorage?: (key: string, value: string) => Promise<boolean>;
};

export const DEFAULT_TIMER_LAYOUT_SETTINGS: TimerLayoutSettings = {
  format: 'large',
  vertical: 'center',
  horizontal: 'center',
  doneBlinkCount: 0,
};

function isTimerLayoutFormat(value: unknown): value is TimerLayoutFormat {
  return typeof value === 'string' && TIMER_LAYOUT_FORMATS.includes(value as TimerLayoutFormat);
}

function isTimerLayoutVertical(value: unknown): value is TimerLayoutVertical {
  return typeof value === 'string' && TIMER_LAYOUT_VERTICALS.includes(value as TimerLayoutVertical);
}

function isTimerLayoutHorizontal(value: unknown): value is TimerLayoutHorizontal {
  return typeof value === 'string' && TIMER_LAYOUT_HORIZONTALS.includes(value as TimerLayoutHorizontal);
}

function normalizeDoneBlinkCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.max(0, Math.round(value));
    const matched = TIMER_DONE_BLINK_COUNTS.find((candidate) => candidate === rounded);
    return matched ?? DEFAULT_TIMER_LAYOUT_SETTINGS.doneBlinkCount;
  }

  return DEFAULT_TIMER_LAYOUT_SETTINGS.doneBlinkCount;
}

function nextInCycle<T extends string | number>(values: readonly T[], current: T, dir: 1 | -1): T {
  const currentIndex = values.indexOf(current);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (safeIndex + dir + values.length) % values.length;
  return values[nextIndex];
}

export function normalizeTimerLayoutSettings(input: unknown): TimerLayoutSettings {
  const candidate = typeof input === 'object' && input !== null ? input as Partial<TimerLayoutSettings> : {};

  return {
    format: isTimerLayoutFormat(candidate.format) ? candidate.format : DEFAULT_TIMER_LAYOUT_SETTINGS.format,
    vertical: isTimerLayoutVertical(candidate.vertical) ? candidate.vertical : DEFAULT_TIMER_LAYOUT_SETTINGS.vertical,
    horizontal: isTimerLayoutHorizontal(candidate.horizontal) ? candidate.horizontal : DEFAULT_TIMER_LAYOUT_SETTINGS.horizontal,
    doneBlinkCount: normalizeDoneBlinkCount(candidate.doneBlinkCount),
  };
}

export function formatTimerLayoutValue(field: TimerLayoutField, settings: TimerLayoutSettings): string {
  const value = settings[field];
  if (field === 'doneBlinkCount') {
    return value === 0 ? 'Infinite' : `${value}x`;
  }

  switch (value) {
    case 'large':
      return 'Large';
    case 'compact':
      return 'Small text';
    case 'top':
      return 'Top';
    case 'mid':
      return 'Mid';
    case 'center':
      return 'Center';
    case 'left':
      return 'Left';
    case 'right':
      return 'Right';
    default:
      return String(value);
  }
}

export function nextTimerLayoutField(field: TimerLayoutField): TimerLayoutField {
  return nextInCycle(TIMER_LAYOUT_FIELDS, field, 1);
}

export function previousTimerLayoutField(field: TimerLayoutField): TimerLayoutField {
  return nextInCycle(TIMER_LAYOUT_FIELDS, field, -1);
}

export function adjustTimerLayoutSetting(
  settings: TimerLayoutSettings,
  field: TimerLayoutField,
  dir: 1 | -1,
): TimerLayoutSettings {
  if (field === 'format') {
    return {
      ...settings,
      format: nextInCycle(TIMER_LAYOUT_FORMATS, settings.format, dir),
    };
  }

  if (field === 'vertical') {
    return {
      ...settings,
      vertical: nextInCycle(TIMER_LAYOUT_VERTICALS, settings.vertical, dir),
    };
  }

  if (field === 'horizontal') {
    return {
      ...settings,
      horizontal: nextInCycle(TIMER_LAYOUT_HORIZONTALS, settings.horizontal, dir),
    };
  }

  return {
    ...settings,
    doneBlinkCount: nextInCycle(TIMER_DONE_BLINK_COUNTS, normalizeDoneBlinkCount(settings.doneBlinkCount), dir),
  };
}

function readWindowStorage(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(TIMER_LAYOUT_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeWindowStorage(value: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(TIMER_LAYOUT_STORAGE_KEY, value);
  } catch {}
}

export async function loadTimerLayoutSettings(bridge: LayoutStorageBridge | null): Promise<TimerLayoutSettings> {
  let raw = '';

  if (bridge?.getLocalStorage) {
    try {
      raw = await bridge.getLocalStorage(TIMER_LAYOUT_STORAGE_KEY);
    } catch {}
  }

  if (!raw) {
    raw = readWindowStorage();
  }

  if (!raw) {
    return DEFAULT_TIMER_LAYOUT_SETTINGS;
  }

  try {
    return normalizeTimerLayoutSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_TIMER_LAYOUT_SETTINGS;
  }
}

export async function saveTimerLayoutSettings(
  settings: TimerLayoutSettings,
  bridge: LayoutStorageBridge | null,
): Promise<void> {
  const normalized = normalizeTimerLayoutSettings(settings);
  const serialized = JSON.stringify(normalized);

  if (bridge?.setLocalStorage) {
    try {
      await bridge.setLocalStorage(TIMER_LAYOUT_STORAGE_KEY, serialized);
    } catch {}
  }

  writeWindowStorage(serialized);
}
