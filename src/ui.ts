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
// IMPORTANT: Based on working project, contentLength should be string length, not byte length!
export function getTextMetrics(text: string): { contentLength: number; contentOffset: number } {
  // For Even Hub SDK, contentLength is the STRING LENGTH, not byte length
  // Always use contentOffset: 0 for updates (as per working project)
  return {
    contentLength: text.length,
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

// Reset function (kept for compatibility, but not needed with new approach)
export function resetPreviousTexts(): void {
  // No-op: we always use contentOffset: 0 now
}

// Render all UI elements
export function renderUI(
  bridge: any,
  state: TimerState,
  selectedPreset: number,
  remainingSeconds: number,
  isBlinkingVisible: boolean = true,
  debugMessage?: string
): void {
  if (!bridge) return;

  try {
    // If there's a debug message, show it on the status container temporarily
    if (debugMessage) {
      bridge.textContainerUpgrade({
        containerID: CONTAINER_IDS.STATUS,
        containerName: CONTAINER_NAMES.STATUS,
        content: debugMessage,
        contentLength: debugMessage.length,
        contentOffset: 0,
      });
      // After 2 seconds, restore normal status
      setTimeout(() => {
        if (bridge) {
          const statusText = getStatusText(state);
          const displayStatusText = isBlinkingVisible ? statusText : '';
          const statusMetrics = getTextMetrics(displayStatusText);
          bridge.textContainerUpgrade({
            containerID: CONTAINER_IDS.STATUS,
            containerName: CONTAINER_NAMES.STATUS,
            content: displayStatusText,
            contentLength: statusMetrics.contentLength,
            contentOffset: statusMetrics.contentOffset,
          });
        }
      }, 2000);
    }
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
    const displayStatusText = isBlinkingVisible ? statusText : '';
    const statusMetrics = getTextMetrics(displayStatusText);
    bridge.textContainerUpgrade({
      containerID: CONTAINER_IDS.STATUS,
      containerName: CONTAINER_NAMES.STATUS,
      content: displayStatusText,
      contentLength: statusMetrics.contentLength,
      contentOffset: statusMetrics.contentOffset,
    });
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
        borderWidth: 1,
        borderColor: 15, // white border to make it visible
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
        borderWidth: 1,
        borderColor: 15, // white border to make it visible
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
        borderWidth: 1,
        borderColor: 15, // white border to make it visible
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
        borderWidth: 1,
        borderColor: 15, // white border to make it visible
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
    
    console.log('[Boot] 📺 Creazione contenitore display...');
    const result = await bridge.createStartUpPageContainer(container);
    console.log('[Boot] 📊 CreateStartUpPageContainer result:', result);
    console.log('[Boot] 📊 StartUpPageCreateResult.success:', StartUpPageCreateResult.success);
    console.log('[Boot] 📊 Result type:', typeof result);
    console.log('[Boot] 📊 Result === 0:', result === 0);
    console.log('[Boot] 📊 Result === 1:', result === 1);
    console.log('[Boot] 📊 Result === StartUpPageCreateResult.success:', result === StartUpPageCreateResult.success);
    
    // On real hardware, sometimes we need to wait a bit for containers to be ready
    // The result might be successful but containers need time to initialize
    const isSuccess = result === StartUpPageCreateResult.success || result === 0 || result === 1 || result === 'success';
    
    if (isSuccess) {
      console.log('[Display] ✅ Contenitore display creato con successo');
    } else {
      console.error('[Display] ❌ Errore creazione contenitore:', result);
      console.log('[Display] 🔄 Tentativo di aggiornare contenitore esistente...');
      // Even if creation "fails", try to update anyway (like working project does)
    }
    
    return isSuccess;
  } catch (error) {
    console.error('Error creating page containers:', error);
    return false;
  }
}
