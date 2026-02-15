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
import { StartUpPageCreateResult } from '@evenrealities/even_hub_sdk';

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
export function getTextMetrics(text: string, previousText: string = ''): { contentLength: number; contentOffset: number } {
  // For Even Hub SDK, contentLength is the byte length of the text
  // contentOffset should be 0 for new content or when text changes completely
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  
  // Calculate offset: if previous text is a prefix of new text, use previous length
  // Otherwise, start from 0 (full replacement)
  let contentOffset = 0;
  if (previousText && text.startsWith(previousText)) {
    const previousEncoded = encoder.encode(previousText);
    contentOffset = previousEncoded.length;
  }
  
  return {
    contentLength: encoded.length,
    contentOffset: contentOffset,
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

// Store previous text values for incremental updates
let previousTexts: Record<number, string> = {};
let isFirstRender = true;

// Reset previous texts (useful when recreating containers)
export function resetPreviousTexts(): void {
  previousTexts = {};
  isFirstRender = true;
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
    // On first render, always use contentOffset: 0 to replace initial content
    // On subsequent renders, use incremental updates if possible
    const useIncremental = !isFirstRender;
    
    if (isFirstRender) {
      console.log('First render - using contentOffset: 0 for all containers');
    }
    
    // Update title
    const titleText = 'TIMER';
    const previousTitle = useIncremental ? (previousTexts[CONTAINER_IDS.TITLE] || '') : '';
    const titleMetrics = getTextMetrics(titleText, previousTitle);
    bridge.textContainerUpgrade({
      containerID: CONTAINER_IDS.TITLE,
      containerName: CONTAINER_NAMES.TITLE,
      content: titleText,
      contentLength: titleMetrics.contentLength,
      contentOffset: isFirstRender ? 0 : titleMetrics.contentOffset,
    });
    previousTexts[CONTAINER_IDS.TITLE] = titleText;

    // Update time display
    const timeText = formatTime(remainingSeconds);
    const previousTime = useIncremental ? (previousTexts[CONTAINER_IDS.TIME_DISPLAY] || '') : '';
    const timeMetrics = getTextMetrics(timeText, previousTime);
    bridge.textContainerUpgrade({
      containerID: CONTAINER_IDS.TIME_DISPLAY,
      containerName: CONTAINER_NAMES.TIME_DISPLAY,
      content: timeText,
      contentLength: timeMetrics.contentLength,
      contentOffset: isFirstRender ? 0 : timeMetrics.contentOffset,
    });
    previousTexts[CONTAINER_IDS.TIME_DISPLAY] = timeText;

    // Update preset row
    const presetText = formatPresetRow(selectedPreset);
    const previousPreset = useIncremental ? (previousTexts[CONTAINER_IDS.PRESET_ROW] || '') : '';
    const presetMetrics = getTextMetrics(presetText, previousPreset);
    bridge.textContainerUpgrade({
      containerID: CONTAINER_IDS.PRESET_ROW,
      containerName: CONTAINER_NAMES.PRESET_ROW,
      content: presetText,
      contentLength: presetMetrics.contentLength,
      contentOffset: isFirstRender ? 0 : presetMetrics.contentOffset,
    });
    previousTexts[CONTAINER_IDS.PRESET_ROW] = presetText;

    // Update status (hide text if blinking and not visible)
    const statusText = getStatusText(state);
    const displayStatusText = isBlinkingVisible ? statusText : '';
    const previousStatus = useIncremental ? (previousTexts[CONTAINER_IDS.STATUS] || '') : '';
    const statusMetrics = getTextMetrics(displayStatusText, previousStatus);
    bridge.textContainerUpgrade({
      containerID: CONTAINER_IDS.STATUS,
      containerName: CONTAINER_NAMES.STATUS,
      content: displayStatusText,
      contentLength: statusMetrics.contentLength,
      contentOffset: isFirstRender ? 0 : statusMetrics.contentOffset,
    });
    previousTexts[CONTAINER_IDS.STATUS] = displayStatusText;
    
    // Mark first render as complete
    if (isFirstRender) {
      isFirstRender = false;
    }
  } catch (error) {
    console.error('Error rendering UI:', error);
  }
}

// Create initial page containers
export async function createPageContainers(bridge: any): Promise<boolean> {
  if (!bridge) return false;

  try {
    // Create text containers following the SDK structure
    // Based on the existing project, use minimal required properties
    const textContainers = [
      // Title
      {
        containerID: CONTAINER_IDS.TITLE,
        containerName: CONTAINER_NAMES.TITLE,
        xPosition: LAYOUT.PADDING_X,
        yPosition: LAYOUT.TITLE_Y,
        width: CANVAS_WIDTH - LAYOUT.PADDING_X * 2,
        height: LAYOUT.TITLE_HEIGHT,
        content: 'TIMER',
        isEventCapture: 1, // Enable tap events
        paddingLength: 5,
      },
      // Time display
      {
        containerID: CONTAINER_IDS.TIME_DISPLAY,
        containerName: CONTAINER_NAMES.TIME_DISPLAY,
        xPosition: LAYOUT.PADDING_X,
        yPosition: LAYOUT.TIME_Y,
        width: CANVAS_WIDTH - LAYOUT.PADDING_X * 2,
        height: LAYOUT.TIME_HEIGHT,
        content: '05:00',
        isEventCapture: 1, // Enable tap events
        paddingLength: 5,
      },
      // Preset row
      {
        containerID: CONTAINER_IDS.PRESET_ROW,
        containerName: CONTAINER_NAMES.PRESET_ROW,
        xPosition: LAYOUT.PADDING_X,
        yPosition: LAYOUT.PRESET_Y,
        width: CANVAS_WIDTH - LAYOUT.PADDING_X * 2,
        height: LAYOUT.PRESET_HEIGHT,
        content: '1 3 5 10 15 30 60',
        isEventCapture: 1, // Enable tap events
        paddingLength: 5,
      },
      // Status
      {
        containerID: CONTAINER_IDS.STATUS,
        containerName: CONTAINER_NAMES.STATUS,
        xPosition: LAYOUT.PADDING_X,
        yPosition: LAYOUT.STATUS_Y,
        width: CANVAS_WIDTH - LAYOUT.PADDING_X * 2 - LAYOUT.STATUS_ICON_SIZE - 10,
        height: LAYOUT.STATUS_HEIGHT,
        content: 'IDLE',
        isEventCapture: 1, // Enable tap events
        paddingLength: 5,
      },
    ];

    const container = {
      containerTotalNum: textContainers.length,
      textObject: textContainers,
    };

    // Reset previous texts when creating new containers
    resetPreviousTexts();
    
    console.log('Creating containers with:', {
      totalNum: container.containerTotalNum,
      containers: textContainers.map(c => ({
        id: c.containerID,
        name: c.containerName,
        content: c.content,
        pos: `(${c.xPosition}, ${c.yPosition})`,
        size: `${c.width}x${c.height}`
      }))
    });
    
    const result = await bridge.createStartUpPageContainer(container);
    console.log('CreateStartUpPageContainer result:', result);
    
    // On real hardware, sometimes we need to wait a bit for containers to be ready
    // The result might be successful but containers need time to initialize
    const isSuccess = result === StartUpPageCreateResult.success || result === 0 || result === 1 || result === 'success';
    
    if (isSuccess) {
      console.log('Containers created successfully, waiting for initialization...');
      // Small delay to ensure containers are fully initialized on hardware
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('Containers should be ready now');
    } else {
      console.error('Container creation failed with result:', result);
    }
    
    return isSuccess;
  } catch (error) {
    console.error('Error creating page containers:', error);
    return false;
  }
}
