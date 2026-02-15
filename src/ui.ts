import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PRESETS,
  CONTAINER_IDS,
  CONTAINER_NAMES,
  LAYOUT,
  TimerState,
} from './constants';
import type { TimerStateData } from './timerState';

// Format seconds as MM:SS
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Create text content for preset row with highlighting
export function formatPresetRow(selectedPreset: number): string {
  return PRESETS.map((preset) => {
    if (preset === selectedPreset) {
      return `[${preset}]`;
    }
    return `${preset}`;
  }).join(' ');
}

// Get status text
export function getStatusText(state: TimerState): string {
  return state;
}

// Calculate text content length and offset for textContainerUpgrade
export function getTextMetrics(text: string): { contentLength: number; contentOffset: number } {
  // For Even Hub SDK, contentLength is the byte length of the text
  // contentOffset is typically 0 for new content
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  return {
    contentLength: encoded.length,
    contentOffset: 0,
  };
}

// Create a simple monochrome image data for status icon
// Returns a small green square/icon as Uint8Array (1-bit per pixel, packed)
export function createStatusIcon(state: TimerState): Uint8Array | null {
  // For simplicity, create a small 8x8 icon
  // In a real implementation, you'd create proper icon data
  // For now, return null to avoid image updates unless needed
  // If you want to add icons, create 8x8 or 16x16 monochrome bitmaps
  return null;
}

// Render all UI elements
export function renderUI(
  bridge: any,
  state: TimerState,
  selectedPreset: number,
  remainingSeconds: number,
  isBlinkingVisible: boolean = true
): void {
  if (!bridge) return;

  try {
    // Update title
    const titleText = 'TIMER';
    const titleMetrics = getTextMetrics(titleText);
    bridge.textContainerUpgrade({
      containerID: CONTAINER_IDS.TITLE,
      containerName: CONTAINER_NAMES.TITLE,
      content: titleText,
      contentLength: titleMetrics.contentLength,
      contentOffset: titleMetrics.contentOffset,
    });

    // Update time display
    const timeText = formatTime(remainingSeconds);
    const timeMetrics = getTextMetrics(timeText);
    bridge.textContainerUpgrade({
      containerID: CONTAINER_IDS.TIME_DISPLAY,
      containerName: CONTAINER_NAMES.TIME_DISPLAY,
      content: timeText,
      contentLength: timeMetrics.contentLength,
      contentOffset: timeMetrics.contentOffset,
    });

    // Update preset row
    const presetText = formatPresetRow(selectedPreset);
    const presetMetrics = getTextMetrics(presetText);
    bridge.textContainerUpgrade({
      containerID: CONTAINER_IDS.PRESET_ROW,
      containerName: CONTAINER_NAMES.PRESET_ROW,
      content: presetText,
      contentLength: presetMetrics.contentLength,
      contentOffset: presetMetrics.contentOffset,
    });

    // Update status (hide text if blinking and not visible)
    const statusText = getStatusText(state);
    const statusMetrics = getTextMetrics(isBlinkingVisible ? statusText : '');
    bridge.textContainerUpgrade({
      containerID: CONTAINER_IDS.STATUS,
      containerName: CONTAINER_NAMES.STATUS,
      content: isBlinkingVisible ? statusText : '',
      contentLength: statusMetrics.contentLength,
      contentOffset: statusMetrics.contentOffset,
    });
  } catch (error) {
    console.error('Error rendering UI:', error);
  }
}

// Create initial page containers
export function createPageContainers(bridge: any): void {
  if (!bridge) return;

  try {
    bridge.createStartUpPageContainer({
      containers: [
        // Title
        {
          containerID: CONTAINER_IDS.TITLE,
          containerName: CONTAINER_NAMES.TITLE,
          containerType: 'TextContainer',
          x: LAYOUT.PADDING_X,
          y: LAYOUT.TITLE_Y,
          width: CANVAS_WIDTH - LAYOUT.PADDING_X * 2,
          height: LAYOUT.TITLE_HEIGHT,
          fontSize: 24,
          fontColor: [0, 255, 0], // Green
          textAlign: 'center',
        },
        // Time display
        {
          containerID: CONTAINER_IDS.TIME_DISPLAY,
          containerName: CONTAINER_NAMES.TIME_DISPLAY,
          containerType: 'TextContainer',
          x: LAYOUT.PADDING_X,
          y: LAYOUT.TIME_Y,
          width: CANVAS_WIDTH - LAYOUT.PADDING_X * 2,
          height: LAYOUT.TIME_HEIGHT,
          fontSize: 48,
          fontColor: [0, 255, 0], // Green
          textAlign: 'center',
        },
        // Preset row
        {
          containerID: CONTAINER_IDS.PRESET_ROW,
          containerName: CONTAINER_NAMES.PRESET_ROW,
          containerType: 'TextContainer',
          x: LAYOUT.PADDING_X,
          y: LAYOUT.PRESET_Y,
          width: CANVAS_WIDTH - LAYOUT.PADDING_X * 2,
          height: LAYOUT.PRESET_HEIGHT,
          fontSize: 18,
          fontColor: [0, 255, 0], // Green
          textAlign: 'center',
        },
        // Status
        {
          containerID: CONTAINER_IDS.STATUS,
          containerName: CONTAINER_NAMES.STATUS,
          containerType: 'TextContainer',
          x: LAYOUT.PADDING_X,
          y: LAYOUT.STATUS_Y,
          width: CANVAS_WIDTH - LAYOUT.PADDING_X * 2 - LAYOUT.STATUS_ICON_SIZE - 10,
          height: LAYOUT.STATUS_HEIGHT,
          fontSize: 16,
          fontColor: [0, 255, 0], // Green
          textAlign: 'left',
        },
      ],
    });
  } catch (error) {
    console.error('Error creating page containers:', error);
  }
}
