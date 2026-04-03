import { DEFAULT_PRESET_MINUTES, MAX_PRESET_MINUTES, MIN_PRESET_MINUTES, TimerState } from './constants';

export const TIMER_RUNTIME_STORAGE_KEY = 'g2-timer:runtime:v1';

export interface TimerRuntimeSnapshot {
  state: TimerState;
  selectedPreset: number;
  remainingSeconds: number;
  endTimestamp: number | null;
  savedAt: number;
}

type TimerStorageBridge = {
  getLocalStorage?: (key: string) => Promise<string>;
  setLocalStorage?: (key: string, value: string) => Promise<boolean>;
};

function isTimerState(value: unknown): value is TimerState {
  return typeof value === 'string' && Object.values(TimerState).includes(value as TimerState);
}

function normalizePreset(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(MAX_PRESET_MINUTES, Math.max(MIN_PRESET_MINUTES, Math.round(value)));
  }
  return DEFAULT_PRESET_MINUTES;
}

function normalizeRemainingSeconds(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  return fallback;
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function readWindowStorage(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(TIMER_RUNTIME_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeWindowStorage(value: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(TIMER_RUNTIME_STORAGE_KEY, value);
  } catch {}
}

function normalizeTimerRuntimeSnapshot(input: unknown): TimerRuntimeSnapshot | null {
  const candidate = typeof input === 'object' && input !== null
    ? input as Partial<TimerRuntimeSnapshot>
    : null;

  if (!candidate || !isTimerState(candidate.state)) {
    return null;
  }

  const selectedPreset = normalizePreset(candidate.selectedPreset);
  const remainingSeconds = normalizeRemainingSeconds(candidate.remainingSeconds, selectedPreset * 60);

  return {
    state: candidate.state,
    selectedPreset,
    remainingSeconds,
    endTimestamp: normalizeTimestamp(candidate.endTimestamp),
    savedAt: typeof candidate.savedAt === 'number' && Number.isFinite(candidate.savedAt)
      ? candidate.savedAt
      : Date.now(),
  };
}

export async function loadTimerRuntimeSnapshot(bridge: TimerStorageBridge | null): Promise<TimerRuntimeSnapshot | null> {
  let raw = '';

  if (bridge?.getLocalStorage) {
    try {
      raw = await bridge.getLocalStorage(TIMER_RUNTIME_STORAGE_KEY);
    } catch {}
  }

  if (!raw) {
    raw = readWindowStorage();
  }

  if (!raw) {
    return null;
  }

  try {
    return normalizeTimerRuntimeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveTimerRuntimeSnapshot(
  snapshot: TimerRuntimeSnapshot,
  bridge: TimerStorageBridge | null,
): Promise<void> {
  const serialized = JSON.stringify(snapshot);

  if (bridge?.setLocalStorage) {
    try {
      await bridge.setLocalStorage(TIMER_RUNTIME_STORAGE_KEY, serialized);
    } catch {}
  }

  writeWindowStorage(serialized);
}
