// Canvas dimensions for G2 HUD
export const CANVAS_WIDTH = 576;
export const CANVAS_HEIGHT = 288;

// Timer presets in minutes
export const PRESETS = [1, 3, 5, 10, 15, 30, 60] as const;

// Container IDs and names (IDs must be numeric)
export const CONTAINER_IDS = {
  TITLE: 1,
  TIME_DISPLAY: 2,
  PRESET_ROW: 3,
  STATUS: 4,
  STATUS_ICON: 5,
} as const;

export const CONTAINER_NAMES = {
  TITLE: 'Title',
  TIME_DISPLAY: 'Time Display',
  PRESET_ROW: 'Preset Row',
  STATUS: 'Status',
  STATUS_ICON: 'Status Icon',
} as const;

// Layout constants
export const LAYOUT = {
  TITLE_Y: 20,
  TITLE_HEIGHT: 40,
  TIME_Y: 80,
  TIME_HEIGHT: 80,
  PRESET_Y: 180,
  PRESET_HEIGHT: 40,
  STATUS_Y: 240,
  STATUS_HEIGHT: 30,
  STATUS_ICON_X: 520,
  STATUS_ICON_Y: 240,
  STATUS_ICON_SIZE: 40,
  PADDING_X: 20,
} as const;

// Timer states
export enum TimerState {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  DONE = 'DONE',
}

// Update intervals
export const UPDATE_INTERVAL_MS = 1000; // 1 second
export const BLINK_INTERVAL_MS = 500; // For DONE state blinking
export const BLINK_DURATION_MS = 3000; // Blink for 3 seconds
